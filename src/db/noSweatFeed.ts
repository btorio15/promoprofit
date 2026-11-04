import { getActiveNoSweatPromos, type ActiveNoSweatPromo } from "@/db/promos";
import { getTrackedNoSweats } from "@/db/trackedNoSweats";
import { getMemberLowProfile } from "@/db/lowProfile";
import type { loadMemberFeedContext } from "@/db/feedContext";
import { makeConversionRateFor } from "@/domain/hedge/conversionRate";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import { buildPriceAgeContext } from "@/domain/promos/priceAge";
import { rankNoSweatFeed, type NoSweatFeedEntry } from "@/domain/promos/rankNoSweatFeed";
import {
  toNoSweatNoteRowDTO,
  toNoSweatRowDTO,
  type NoSweatNoteRowDTO,
  type NoSweatRowDTO,
} from "@/domain/promos/noSweatRowDto";
import { buildTrackedCardDTO, type TrackedNoSweatCardDTO } from "@/domain/promos/trackedCardDto";
import type { LowProfileSettings } from "@/domain/promos/lowProfile";

/**
 * Phase 9 (FEED-03/04): the estimates-only no-sweat path of the Opportunities
 * feed. A plain module (the acting user id comes from the caller's
 * requireUser). A-01: nothing here feeds computeMemberFeed, the recorders, the
 * dashboard or the grey-line observations; those never see no-sweat data.
 */

export type MemberFeedContext = Awaited<ReturnType<typeof loadMemberFeedContext>>;

export interface NoSweatFeedResult {
  rows: NoSweatRowDTO[];
  /** Can't-price, not-worth-it and Low-profile-blocked, unsliced (D-10, D-11). */
  notes: NoSweatNoteRowDTO[];
  tracking: TrackedNoSweatCardDTO[];
  ranked: NoSweatFeedEntry<ActiveNoSweatPromo>[];
  trackedIds: Set<number>;
  /** How many no-sweat promos are active for this member (any state), for the empty-state chain. */
  activeCount: number;
}

function priceAgeFor(ctx: MemberFeedContext) {
  return buildPriceAgeContext(ctx.moneylineEvents, ctx.oddsFetchedAt, ctx.extendedOddsFetchedAt, {
    moneyline: ctx.oddsFetchedAtByEventId,
    extended: ctx.extendedOddsFetchedAtByEventId,
  });
}

function rankPromos(args: {
  promos: ActiveNoSweatPromo[];
  precision: StakePrecision;
  now: Date;
  ctx: MemberFeedContext;
  lowProfile: LowProfileSettings;
}) {
  const { ctx } = args;
  // A-11: exactly one memoised conversion-rate function per request.
  const conversionRateFor = makeConversionRateFor({ events: ctx.moneylineEvents, now: args.now });
  return rankNoSweatFeed({
    promos: args.promos,
    moneylineEvents: ctx.moneylineEvents,
    extendedEvents: ctx.extendedEvents,
    now: args.now,
    hedgeBookKeys: ctx.rankOpts.hedgeBookKeys,
    precision: args.precision,
    lowProfile: args.lowProfile,
    conversionRateFor,
  });
}

export async function loadNoSweatFeed({
  userId,
  precision,
  now,
  ctx,
}: {
  userId: number;
  precision: StakePrecision;
  now: Date;
  ctx: MemberFeedContext;
}): Promise<NoSweatFeedResult> {
  // WR-04: tracked cards are real bets with money on them, so they load
  // independently of the ranked feed -- a failure loading or ranking promos
  // must never hide the Tracking strip.
  const [activeResult, trackedRows, lowProfileResult] = await Promise.all([
    getActiveNoSweatPromos(now, userId).then(
      (v) => ({ ok: true as const, v }),
      (err: unknown) => ({ ok: false as const, err }),
    ),
    getTrackedNoSweats(userId),
    getMemberLowProfile(userId).then(
      (v) => ({ ok: true as const, v }),
      (err: unknown) => ({ ok: false as const, err }),
    ),
  ]);

  const trackedIds = new Set(trackedRows.map((r) => r.promoId));
  const hasOdds = !(ctx.oddsFetchedAt === null && ctx.extendedOddsFetchedAt === null);

  // Tracked rows whose promo is already done (settled) do not show as Tracking cards.
  // Each card is built on its own so one bad stored row drops only that card (WR-04).
  const tracking: TrackedNoSweatCardDTO[] = [];
  for (const r of trackedRows) {
    if (ctx.doneIds.has(r.promoId)) continue;
    try {
      tracking.push(
        buildTrackedCardDTO(r, {
          now,
          moneylineEvents: ctx.moneylineEvents,
          hedgeBookKeys: ctx.rankOpts.hedgeBookKeys,
          bookNames: ctx.bookNames,
          oddsFetchedAt: ctx.oddsFetchedAt,
        }),
      );
    } catch (err) {
      console.warn(`loadNoSweatFeed: dropping tracked card for promo ${r.promoId} (could not build it)`, err);
    }
  }

  if (!activeResult.ok || !lowProfileResult.ok) {
    console.error(
      "loadNoSweatFeed: could not load no-sweat promos; showing Tracking only",
      activeResult.ok ? null : activeResult.err,
      lowProfileResult.ok ? null : lowProfileResult.err,
    );
    return { rows: [], notes: [], tracking, ranked: [], trackedIds, activeCount: 0 };
  }
  const activeNoSweats = activeResult.v;
  const lowProfile = lowProfileResult.v;

  if (!hasOdds) return { rows: [], notes: [], tracking, ranked: [], trackedIds, activeCount: activeNoSweats.length };

  try {
    return {
      ...rankForMember({ activeNoSweats, trackedIds, precision, now, ctx, lowProfile }),
      tracking,
      trackedIds,
      activeCount: activeNoSweats.length,
    };
  } catch (err) {
    console.error("loadNoSweatFeed: ranking no-sweats failed; showing Tracking only", err);
    return { rows: [], notes: [], tracking, ranked: [], trackedIds, activeCount: activeNoSweats.length };
  }
}

function rankForMember({
  activeNoSweats,
  trackedIds,
  precision,
  now,
  ctx,
  lowProfile,
}: {
  activeNoSweats: ActiveNoSweatPromo[];
  trackedIds: ReadonlySet<number>;
  precision: StakePrecision;
  now: Date;
  ctx: MemberFeedContext;
  lowProfile: LowProfileSettings;
}): Pick<NoSweatFeedResult, "rows" | "notes" | "ranked"> {
  // D-16: only promos at the member's own books; done and tracked promos leave the ranked feed.
  const candidates = activeNoSweats.filter(
    (p) => ctx.userBookSet.has(p.bookKey) && !ctx.doneIds.has(p.id) && !trackedIds.has(p.id),
  );

  const result = rankPromos({ promos: candidates, precision, now, ctx, lowProfile });
  for (const bad of result.invalid) {
    console.warn(`loadNoSweatFeed: skipping invalid no-sweat promo ${bad.promoId} (${bad.reason})`);
  }

  const priceAge = priceAgeFor(ctx);
  const rows = result.ranked.map((e) => toNoSweatRowDTO(e, ctx.bookNames, priceAge));
  const notes: NoSweatNoteRowDTO[] = [
    ...result.cantPrice.map((p) => toNoSweatNoteRowDTO(p, "cant_price", ctx.bookNames)),
    ...result.notWorthIt.map((e) => toNoSweatNoteRowDTO(e.promo, "not_worth_it", ctx.bookNames, e.filteredOut)),
    ...result.lowProfileBlocked.map((b) =>
      toNoSweatNoteRowDTO(b.promo, "low_profile_blocked", ctx.bookNames, b.filteredOut),
    ),
  ];

  return { rows, notes, ranked: result.ranked };
}

export type PriceOneNoSweatResult =
  | { kind: "ok"; entry: NoSweatFeedEntry<ActiveNoSweatPromo>; row: NoSweatRowDTO }
  | {
      kind: "not_found" | "not_in_books" | "cant_price" | "not_worth_it" | "low_profile_blocked" | "no_line" | "invalid";
    };

/**
 * Re-prices ONE promo through the identical path the feed uses, so Track
 * (09-14) records exactly what the member saw.
 */
export async function priceOneNoSweat({
  userId,
  promoId,
  precision,
  now,
  ctx,
}: {
  userId: number;
  promoId: number;
  precision: StakePrecision;
  now: Date;
  ctx: MemberFeedContext;
}): Promise<PriceOneNoSweatResult> {
  const [active, lowProfile] = await Promise.all([getActiveNoSweatPromos(now, userId), getMemberLowProfile(userId)]);
  const promo = active.find((p) => p.id === promoId);
  if (!promo) return { kind: "not_found" };
  if (!ctx.userBookSet.has(promo.bookKey)) return { kind: "not_in_books" };

  const result = rankPromos({ promos: [promo], precision, now, ctx, lowProfile });
  if (result.ranked[0]) {
    const entry = result.ranked[0];
    return { kind: "ok", entry, row: toNoSweatRowDTO(entry, ctx.bookNames, priceAgeFor(ctx)) };
  }
  if (result.notWorthIt.length > 0) return { kind: "not_worth_it" };
  if (result.cantPrice.length > 0) return { kind: "cant_price" };
  if (result.lowProfileBlocked.length > 0) return { kind: "low_profile_blocked" };
  if (result.noLine.length > 0) return { kind: "no_line" };
  return { kind: "invalid" };
}
