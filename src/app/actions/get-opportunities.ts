"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { requireUser } from "@/lib/session";
import { getHedgeBookKeys } from "@/db/queries";
import { loadMemberFeedContext, loadProfitSeries } from "@/db/feedContext";
import { recordMemberFeedObservations } from "@/db/memberFeedRecording";
import { recordCurrentProfitObservations } from "@/db/promoObservations";
import { toPromoRowDTO } from "@/domain/promos/promoRowDto";
import { buildPriceAgeContext } from "@/domain/promos/priceAge";
import { buildArbMarkets, toArbResultDTO } from "@/domain/arb/build";
import { rankArbs } from "@/domain/hedge/rankArbs";
import { SPORT_KEYS } from "@/config/sports";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { buildDashboardTotals } from "@/domain/promos/dashboardTotals";
import { computeMemberFeed } from "@/domain/promos/memberFeed";
import { toPairRowDTO, type PairRowDTO } from "@/domain/promos/pairRowDto";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import {
  OPPORTUNITIES_ARB_TOTAL_STAKE,
  type OpportunitiesEmptyVariant,
  type OpportunitiesResponse,
  type OpportunityItem,
  type OpportunitySourceDTO,
} from "@/domain/opportunities/types";
import type { PromoRowDTO } from "@/domain/promos/dto";
import type { ArbResultDTO } from "@/domain/arb/types";

// T-04-02: strict, and no userId -- the acting user comes only from the session.
const OpportunitiesInputSchema = z.strictObject({
  precision: z.enum(["whole", "cents"]),
});

/**
 * The Opportunities landing feed. Reads cached odds only (no Odds API
 * client is imported, so viewing spends 0 credits, T-04-04). Every source
 * is limited to the member's own books (D-16 promo book, D-17 hedge books).
 * Also returns the member's Dashboard totals (Phase 7, STATS-08/09), built
 * from data already loaded. requireUser() is the literal first statement (T-04-01).
 */
export async function getOpportunities(input: unknown): Promise<OpportunitiesResponse> {
  const user = await requireUser();

  const parsed = OpportunitiesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  const precision = parsed.data.precision as StakePrecision;

  const now = new Date();
  const ctx = await loadMemberFeedContext({ userId: user.userId, precision, now });

  // Statistics (group) observations from the odds already loaded above. Never
  // fails the Dashboard: the recorder swallows its own errors, and this catch
  // is belt-and-braces.
  try {
    await recordCurrentProfitObservations(now, {
      activePromos: ctx.activePromos,
      precision,
      cached: {
        moneylineEvents: ctx.moneylineEvents,
        extendedEvents: ctx.extendedEvents,
        oddsFetchedAt: ctx.oddsFetchedAt,
        everyUsableHedgeBookKeys: ctx.everyUsableHedgeBookKeys,
      },
    });
  } catch (err) {
    console.error("getOpportunities: group observations failed", err);
  }

  const oddsFetchedAt = ctx.oddsFetchedAt ? ctx.oddsFetchedAt.toISOString() : null;
  const extendedOddsFetchedAt = ctx.extendedOddsFetchedAt ? ctx.extendedOddsFetchedAt.toISOString() : null;

  const hasOdds = !(ctx.oddsFetchedAt === null && ctx.extendedOddsFetchedAt === null);
  // D-06: one shared copy of the singles + pair rule feeds both the screen and the recorder.
  const feed = hasOdds
    ? computeMemberFeed({ feedPromos: ctx.feedPromos, rankOpts: ctx.rankOpts, userBookSet: ctx.userBookSet })
    : null;
  if (feed) {
    // Record BEFORE building the series so today's number is included (D-05, D-07).
    // Always at "whole" precision (same as the morning job); the shared recorder
    // reuses the whole-precision feed when that is what the member is viewing and
    // never throws (WR-01, audit W2).
    await recordMemberFeedObservations({
      userId: user.userId,
      now,
      feedPromos: ctx.feedPromos,
      rankOpts: ctx.rankOpts,
      userBookSet: ctx.userBookSet,
      wholeFeed: precision === "whole" ? feed : undefined,
    });
  }
  const profitSeries = await loadProfitSeries({ userId: user.userId, now, completions: ctx.completions });
  const dashboard = buildDashboardTotals({
    series: profitSeries,
    completions: ctx.completions,
    doneRows: ctx.doneRows,
    now,
  });

  const respond = (
    emptyVariant: OpportunitiesEmptyVariant | null,
    sources: OpportunitySourceDTO[],
  ): OpportunitiesResponse => ({
    status: "ok",
    emptyVariant,
    oddsFetchedAt,
    extendedOddsFetchedAt,
    dashboard,
    profitSeries,
    sources,
  });

  if (!feed) {
    return respond("no-odds", [
      { id: "promos", items: [] },
      { id: "pairs", items: [] },
      { id: "arbs", items: [] },
    ]);
  }

  const priceAge = buildPriceAgeContext(ctx.moneylineEvents, ctx.oddsFetchedAt, ctx.extendedOddsFetchedAt, {
    moneyline: ctx.oddsFetchedAtByEventId,
    extended: ctx.extendedOddsFetchedAtByEventId,
  });

  // D-17: rankOpts.hedgeBookKeys is the member's own hedge books only.
  const singles = feed.singles;
  // D-16: promos at books the member lacks are excluded entirely.
  const rows: PromoRowDTO[] = singles
    .map((o) => toPromoRowDTO(o, ctx.bookNames, ctx.userBookSet, priceAge))
    .filter((r) => r.hasPromoBook);

  const items: OpportunityItem<PromoRowDTO>[] = rows.map((row) => ({
    rowKey: row.rowKey,
    profit: row.guaranteedProfit,
    pct: row.ratePct,
    pctLabel: row.rateLabel,
    commenceTime: row.commenceTime,
    data: row,
  }));

  // D-08/D-10/D-18: pairs of promos at two member books that beat hedging
  // each separately, each promo in at most one pair. Paired promos stay in
  // the promos source too (D-20).
  const chosenPairs = feed.chosenPairs;
  const pairRows: PairRowDTO[] = chosenPairs.map((c) => toPairRowDTO(c, ctx.bookNames, priceAge));
  const pairItems: OpportunityItem<PairRowDTO>[] = pairRows.map((row) => ({
    rowKey: row.rowKey,
    profit: row.guaranteedProfit,
    pct: row.roiPct,
    pctLabel: "ROI" as const,
    commenceTime: row.commenceTime,
    data: row,
  }));

  // D-18, D-21: cached-odds arbs at the member's hedge books only, at a fixed $100 stake.
  const arbStake = new Decimal(OPPORTUNITIES_ARB_TOTAL_STAKE);
  const arbMarkets = buildArbMarkets(
    ctx.moneylineEvents,
    ctx.extendedEvents,
    new Set(SPORT_KEYS),
    now,
    new Set(ctx.hedgeBookKeys),
  );
  const arbItems: OpportunityItem<ArbResultDTO>[] = rankArbs(arbMarkets, {
    totalStake: arbStake,
    precision,
  })
    .map((o) => toArbResultDTO(o, ctx.bookNames))
    .map((dto) => ({
      rowKey: dto.rowKey,
      profit: dto.guaranteedProfit,
      pct: dto.returnPct,
      pctLabel: "ROI" as const,
      commenceTime: dto.commenceTime,
      data: dto,
    }));

  const sources: OpportunitySourceDTO[] = [
    { id: "promos", items },
    { id: "pairs", items: pairItems },
    { id: "arbs", items: arbItems },
  ];

  if (sources.some((s) => s.items.length > 0)) {
    return respond(null, sources);
  }

  if (ctx.activePromos.length === 0) {
    return respond("none-scraped", sources);
  }

  // Re-rank at every usable book to tell "nothing anywhere" from "not at your books".
  const everyUsable = await getHedgeBookKeys();
  const memberHasEveryBook = everyUsable.every((key) => ctx.userBookSet.has(key));
  if (!memberHasEveryBook) {
    const wider = rankPromoHedges(ctx.feedPromos, { ...ctx.rankOpts, hedgeBookKeys: new Set(everyUsable) });
    // Only computed here (all sources empty), so the normal path pays nothing.
    const widerArbs = rankArbs(
      buildArbMarkets(ctx.moneylineEvents, ctx.extendedEvents, new Set(SPORT_KEYS), now, new Set(everyUsable)),
      { totalStake: arbStake, precision },
    );
    if (wider.length > 0 || widerArbs.length > 0) {
      return respond("no-books", sources);
    }
  }
  return respond("nothing-profitable", sources);
}
