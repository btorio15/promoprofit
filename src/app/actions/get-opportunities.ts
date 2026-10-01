"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { requireUser } from "@/lib/session";
import { getHedgeBookKeys } from "@/db/queries";
import { loadAvailableProfit, loadMemberFeedContext } from "@/db/feedContext";
import { recordCurrentProfitObservations } from "@/db/promoObservations";
import { toPromoRowDTO } from "@/domain/promos/promoRowDto";
import { buildPriceAgeContext } from "@/domain/promos/priceAge";
import { buildArbMarkets, toArbResultDTO } from "@/domain/arb/build";
import { rankArbs } from "@/domain/hedge/rankArbs";
import { SPORT_KEYS } from "@/config/sports";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { sumPortfolioProfit } from "@/domain/promos/profitTotals";
import { findPairCandidates, selectPairs, singleProfitMap } from "@/domain/promos/pairPromos";
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
 * requireUser() is the literal first statement (T-04-01).
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

  // Same as getPromos: keeps the landing screen's period figures fresh.
  await recordCurrentProfitObservations(now, { activePromos: ctx.activePromos, precision });
  const availableProfit = await loadAvailableProfit(now, ctx.userBookSet, user.userId, ctx.doneIds);

  const oddsFetchedAt = ctx.oddsFetchedAt ? ctx.oddsFetchedAt.toISOString() : null;
  const extendedOddsFetchedAt = ctx.extendedOddsFetchedAt ? ctx.extendedOddsFetchedAt.toISOString() : null;

  const respond = (
    emptyVariant: OpportunitiesEmptyVariant | null,
    totalProfit: string,
    sources: OpportunitySourceDTO[],
  ): OpportunitiesResponse => ({
    status: "ok",
    emptyVariant,
    oddsFetchedAt,
    extendedOddsFetchedAt,
    totals: { totalProfit, totalExtracted: ctx.totalExtracted, availableProfit },
    sources,
  });

  if (ctx.oddsFetchedAt === null && ctx.extendedOddsFetchedAt === null) {
    return respond("no-odds", "0.00", [
      { id: "promos", items: [] },
      { id: "pairs", items: [] },
      { id: "arbs", items: [] },
    ]);
  }

  const priceAge = buildPriceAgeContext(ctx.moneylineEvents, ctx.oddsFetchedAt, ctx.extendedOddsFetchedAt);

  // D-17: rankOpts.hedgeBookKeys is the member's own hedge books only.
  const singles = rankPromoHedges(ctx.feedPromos, ctx.rankOpts);
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
  const chosenPairs = selectPairs(
    findPairCandidates(ctx.feedPromos, singleProfitMap(singles), {
      ...ctx.rankOpts,
      memberBookKeys: ctx.userBookSet,
    }),
  );
  const pairRows: PairRowDTO[] = chosenPairs.map((c) => toPairRowDTO(c, ctx.bookNames, priceAge));
  const pairItems: OpportunityItem<PairRowDTO>[] = pairRows.map((row) => ({
    rowKey: row.rowKey,
    profit: row.guaranteedProfit,
    pct: row.roiPct,
    pctLabel: "ROI" as const,
    commenceTime: row.commenceTime,
    data: row,
  }));

  // D-12: a pair counts once, in place of its two single profits.
  const totalProfit = sumPortfolioProfit(
    rows.map((r) => ({ promoId: r.promoId, guaranteedProfit: r.guaranteedProfit, hasPromoBook: r.hasPromoBook })),
    pairRows,
    ctx.doneIds,
  );

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
    return respond(null, totalProfit, sources);
  }

  if (ctx.activePromos.length === 0) {
    return respond("none-scraped", totalProfit, sources);
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
      return respond("no-books", totalProfit, sources);
    }
  }
  return respond("nothing-profitable", totalProfit, sources);
}
