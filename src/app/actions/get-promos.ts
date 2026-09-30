"use server";

import { requireUser } from "@/lib/session";
import { COLORADO_BOOKS } from "@/config/books";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { PromosInputSchema } from "@/domain/promos/promosInput";
import type {
  ClassifyQueueItemDTO,
  CorrectionOptions,
  GetPromosResponse,
  PromosEmptyVariant,
  QueueItemDTO,
  ScrapeStatusLineDTO,
} from "@/domain/promos/dto";
import { getActivePromos, getScrapeStatus } from "@/db/promos";
import { getReviewQueue, type QueueRow } from "@/db/promoReview";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "@/db/queries";
import { getPromoCompletions } from "@/db/promoTracking";
import { loadAvailableProfit } from "@/db/feedContext";
import { sumProfitExtracted, toDoneRows } from "@/domain/promos/doneSnapshot";
import { recordCurrentProfitObservations } from "@/db/promoObservations";
import { toPromoRowDTO, toUnprofitablePromoRowDTO } from "@/domain/promos/promoRowDto";
import { describePromo, scopeGuessLabel } from "@/domain/promos/describe";
import { listCorrectionOptions, scrapedWindowEtDays } from "@/domain/promos/correctionOptions";
import { findUnprofitablePromos, rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { sumOwnBookProfit } from "@/domain/promos/profitTotals";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import type { OddsEvent } from "@/domain/odds/schemas";

const EMPTY_CORRECTION_OPTIONS: CorrectionOptions = { events: [], sportDays: [] };

/** WR-02: note on the member's own added promos while no odds are cached. */
const NO_ODDS_NOTE = "No odds loaded yet";

/**
 * WR-07: promos at books the member has come first; promos at books they
 * don't have are kept (shown dimmed) but sorted after them. A stable
 * partition, so each group keeps its incoming (profit) order.
 */
function ownBooksFirst<T extends { hasPromoBook: boolean }>(rows: T[]): T[] {
  return [...rows.filter((row) => row.hasPromoBook), ...rows.filter((row) => !row.hasPromoBook)];
}

/**
 * Correct/classify sub-panel dropdown data (T-03-09-06; quick-260928-it1
 * extends the gate to classify items too -- ClassifyQueueCard's "Game or
 * day" selector reuses the same CorrectionScopeSelect data). Built ONLY when
 * the queue actually has a match or classify item -- there's no correction
 * UI to populate otherwise, so skip the extra cache reads entirely on every
 * other visit. Reuses an already-fetched cache when the caller has one (the
 * activePromos-present branch below already fetched both caches for hedge
 * math); otherwise fetches them itself (the activePromos-empty branch never
 * would have otherwise).
 */
async function correctionOptionsFor(
  needsCorrectionOptions: boolean,
  now: Date,
  cached?: { moneylineEvents: OddsEvent[]; extendedEvents: OddsEvent[] },
): Promise<CorrectionOptions> {
  if (!needsCorrectionOptions) return EMPTY_CORRECTION_OPTIONS;

  const { moneylineEvents, extendedEvents } =
    cached ??
    (await (async () => {
      const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([
        getCachedEvents(),
        getCachedExtendedEvents(),
      ]);
      return { moneylineEvents, extendedEvents };
    })());

  return listCorrectionOptions({ moneyline: moneylineEvents, extended: extendedEvents }, { now });
}

/**
 * Reads active promos (D-01, D-16, PROMO-04) and, when there's at least one
 * and cached odds exist, runs rankPromoHedges at the member's own hedge
 * books (D-05) to produce this tab's rows. requireUser() is the literal
 * first statement -- a logged-out call redirects before any DB read,
 * mirroring save-books.ts's "user id comes ONLY from the session"
 * discipline -- before PromosInputSchema.safeParse, before any of
 * getActivePromos/getScrapeStatus/getUserBookKeys/getHedgeBookKeys.
 */
export async function getPromos(input: unknown): Promise<GetPromosResponse> {
  const user = await requireUser();

  const parsed = PromosInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { precision } = parsed.data;

  const targetBooks = COLORADO_BOOKS.filter((book) => SCRAPE_TARGET_BOOK_KEYS.includes(book.key)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const statusByBook = await getScrapeStatus(SCRAPE_TARGET_BOOK_KEYS);

  const scrapeStatus: ScrapeStatusLineDTO[] = targetBooks.map((book) => {
    const row = statusByBook.get(book.key) ?? { lastOkAt: null, lastStatus: null };
    return {
      bookKey: book.key,
      bookName: book.displayName,
      lastOkAt: row.lastOkAt ? row.lastOkAt.toISOString() : null,
      lastRunFailed: row.lastStatus === "failed",
    };
  });

  const hasAnyOkRun = scrapeStatus.some((line) => line.lastOkAt !== null);

  const now = new Date();
  const [activePromos, queueRows, completions, userBookKeys] = await Promise.all([
    getActivePromos(now, user.userId),
    getReviewQueue(now),
    getPromoCompletions(user.userId),
    getUserBookKeys(user.userId),
  ]);
  const userBookSet = new Set(userBookKeys);
  // quick-260929-igk: done promos leave the feed and render only from their
  // saved snapshots (never live odds); the extracted total is an exact-cent sum.
  const colBookNames = new Map<string, string>(COLORADO_BOOKS.map((b) => [b.key, b.displayName]));
  const doneRows = toDoneRows(completions, colBookNames);
  const doneIds = new Set(completions.map((c) => c.promoId));
  const totalExtracted = sumProfitExtracted(doneRows);
  const feedPromos = activePromos.filter((p) => !doneIds.has(p.id));
  const queue = queueRows.map(toQueueItemDTO);
  // quick-260928-it1: classify items also need correctionOptions (their
  // "Game or day" selector reuses the same CorrectionScopeSelect data).
  const needsCorrectionOptions = queueRows.some(
    (row) => row.reviewReason === "match" || row.reviewReason === "classify",
  );

  /**
   * quick-260927-n12: records today's GROUP-level profit observations
   * (ranked at every usable hedge book, not this member's own -- see
   * src/db/promoObservations.ts) from whatever odds are already cached (no
   * new Odds API call), then loads this member's own-book today/week/month
   * totals. Both run unconditionally, before any empty-state branch below,
   * so the period numbers are present in every "ok" response.
   */
  await recordCurrentProfitObservations(now, { activePromos, precision: precision as StakePrecision });
  const availableProfit = await loadAvailableProfit(now, userBookSet, user.userId, doneIds);

  if (feedPromos.length === 0) {
    const emptyVariant: PromosEmptyVariant = hasAnyOkRun ? "no-active" : "none-scraped";
    const correctionOptions = await correctionOptionsFor(needsCorrectionOptions, now);
    return {
      status: "ok",
      scrapeStatus,
      emptyVariant,
      rows: [],
      unprofitableRows: [],
      queue,
      correctionOptions,
      totalProfit: "0.00",
      doneRows,
      totalExtracted,
      availableProfit,
    };
  }

  const [hedgeBookKeys, bonusBooks, { events: moneylineEvents, fetchedAt: oddsFetchedAt }, { events: extendedEvents, fetchedAt: extendedOddsFetchedAt }] =
    await Promise.all([
      getHedgeBookKeys(userBookSet),
      getBonusBooks(),
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);

  const correctionOptions = await correctionOptionsFor(needsCorrectionOptions, now, { moneylineEvents, extendedEvents });

  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));

  if (oddsFetchedAt === null && extendedOddsFetchedAt === null) {
    // WR-02: with no odds cached nothing can be hedged, but the member's own
    // hand-added promos still come back (greyed, with a no-odds note) so they
    // can see, edit, expire or delete what they just added.
    const ownAddedRows = ownBooksFirst(
      feedPromos
        .filter((promo) => promo.addedByYou)
        .map((promo) => ({
          ...toUnprofitablePromoRowDTO({ promo, bestGuaranteedProfit: null, candidatesEvaluated: 0 }, bookNames, userBookSet),
          note: NO_ODDS_NOTE,
        })),
    );
    return {
      status: "ok",
      scrapeStatus,
      emptyVariant: "no-odds",
      rows: [],
      unprofitableRows: ownAddedRows,
      queue,
      correctionOptions,
      totalProfit: "0.00",
      doneRows,
      totalExtracted,
      availableProfit,
    };
  }

  const rankOpts = {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(hedgeBookKeys),
    precision: precision as StakePrecision,
    now,
  };

  const opportunities = rankPromoHedges(feedPromos, rankOpts);
  const unprofitable = findUnprofitablePromos(feedPromos, rankOpts);
  const unprofitableRows = ownBooksFirst(
    unprofitable.map((entry) => toUnprofitablePromoRowDTO(entry, bookNames, userBookSet)),
  );

  if (opportunities.length === 0) {
    /**
     * D-05/D-18 analog to find-arbs.ts's booksExcludedAll: re-rank at every
     * usable book (not just the member's own) to tell "no rows anywhere"
     * (no-active) apart from "rows exist, but not at your books" (no-books).
     */
    const everyUsableBookKeys = await getHedgeBookKeys();
    const userHasEveryUsableBook = everyUsableBookKeys.every((key) => userBookSet.has(key));

    let emptyVariant: PromosEmptyVariant = "no-active";
    if (!userHasEveryUsableBook) {
      const everyUsableOpportunities = rankPromoHedges(feedPromos, {
        ...rankOpts,
        hedgeBookKeys: new Set(everyUsableBookKeys),
      });
      if (everyUsableOpportunities.length > 0) {
        emptyVariant = "no-books";
      }
    }

    // quick-260927-edt: zero profitable rows still shows the greyed
    // unprofitable rows (instead of the "no-active" empty state) as long as
    // at least one is present -- "no-books" still wins over this.
    if (emptyVariant === "no-active" && unprofitableRows.length > 0) {
      return {
        status: "ok",
        scrapeStatus,
        emptyVariant: null,
        rows: [],
        unprofitableRows,
        queue,
        correctionOptions,
        totalProfit: "0.00",
        doneRows,
        totalExtracted,
        availableProfit,
      };
    }

    return {
      status: "ok",
      scrapeStatus,
      emptyVariant,
      rows: [],
      unprofitableRows: [],
      queue,
      correctionOptions,
      totalProfit: "0.00",
      doneRows,
      totalExtracted,
      availableProfit,
    };
  }

  const rows = ownBooksFirst(
    opportunities.map((opportunity) => toPromoRowDTO(opportunity, bookNames, userBookSet)),
  );
  // quick-260927-n12 (owner decision 1): own-book rows only. Done promos are
  // already filtered out of the feed (quick-260929-igk); doneIds stays as a
  // belt-and-braces exclusion.
  const totalProfit = sumOwnBookProfit(
    rows.map((row) => ({ promoId: row.promoId, guaranteedProfit: row.guaranteedProfit, hasPromoBook: row.hasPromoBook })),
    doneIds,
  );

  return {
    status: "ok",
    scrapeStatus,
    emptyVariant: null,
    rows,
    unprofitableRows,
    queue,
    correctionOptions,
    totalProfit,
    doneRows,
    totalExtracted,
    availableProfit,
  };
}

const EXCERPT_MAX_CHARS = 280;

/** Whitespace-collapsed, <= 280 chars, ending in "…" when trimmed (T-it1-06: rendered as React text only, never HTML). */
function buildClassifyExcerpt(rawText: string): string {
  const collapsed = rawText.replace(/\s+/g, " ").trim();
  if (collapsed.length <= EXCERPT_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, EXCERPT_MAX_CHARS - 1)}…`;
}

/** T-it1-06: allowlists a classify draft's sourceUrl to http:/https: only -- javascript:/data:/any other scheme becomes null. */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function toClassifyQueueItemDTO(row: QueueRow): ClassifyQueueItemDTO {
  return {
    title: row.parsed.title,
    excerpt: buildClassifyExcerpt(row.parsed.rawText),
    sourceUrl: safeHttpUrl(row.parsed.sourceUrl),
    expiresAt: row.parsed.expiresAt,
    suggested: {
      promoType: row.promoType,
      boostPercent: row.parsed.boostPercent,
      bonusAmount: row.bonusAmount,
      maxStake: row.maxStake,
      maxWinnings: row.maxWinnings,
      minOdds: row.minOddsAmerican,
      sportKey: row.parsed.sportKeyHint,
    },
    maxWinningsKindKnown: row.maxWinningsKind !== null,
  };
}

/**
 * Maps one pending_review row to its queue-card DTO (03-UI-SPEC.md "Queue
 * item card"; quick-260928-it1 for "classify"). kind mirrors review_reason:
 * "match" rows only get a bestGuessLabel (when a guess exists, D-10 --
 * presentational only, never auto-activated); "caps" rows only get
 * matchedLabel (the already-confirmed scope) and capRecap (D-18 -- null
 * fields render as "not found" in the UI); "classify" rows get the
 * ClassifyQueueItemDTO instead of describePromo's scope-based description
 * (the scraper doesn't even know the promo type yet, so there's no scope to
 * describe) -- description falls back to the draft's own title.
 */
function toQueueItemDTO(row: QueueRow): QueueItemDTO {
  const bookName = COLORADO_BOOKS.find((b) => b.key === row.bookKey)?.displayName ?? row.bookKey;
  const promoTypeLabel: "Boost" | "Bonus bet" = row.promoType === "profit_boost" ? "Boost" : "Bonus bet";

  return {
    promoId: row.id,
    kind: row.reviewReason,
    bookName,
    promoTypeLabel,
    description: row.reviewReason === "classify" ? row.parsed.title : describePromo(row.parsed),
    bestGuessLabel:
      row.reviewReason === "match" && row.bestGuess ? `Best guess: ${scopeGuessLabel(row.bestGuess)}.` : null,
    matchedLabel: row.reviewReason === "caps" && row.scope ? scopeGuessLabel(row.scope) : null,
    capRecap:
      row.reviewReason === "caps"
        ? { maxStake: row.maxStake, maxWinnings: row.maxWinnings, minOdds: row.minOddsAmerican }
        : null,
    unparsedCapFields: row.unparsedCapFields,
    classify: row.reviewReason === "classify" ? toClassifyQueueItemDTO(row) : null,
    scrapedWindow: scrapedWindowFor(row),
  };
}

/** Partial drafts may carry undefined (not null) fields, so guard by type. */
function scrapedWindowFor(row: QueueRow): QueueItemDTO["scrapedWindow"] {
  const { sportKeyHint, windowStart, windowEnd } = row.parsed;
  if (typeof sportKeyHint !== "string" || typeof windowStart !== "string" || typeof windowEnd !== "string") {
    return null;
  }
  const days = scrapedWindowEtDays(windowStart, windowEnd);
  return days ? { sportKey: sportKeyHint, ...days } : null;
}
