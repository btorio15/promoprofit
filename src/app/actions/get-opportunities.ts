"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getHedgeBookKeys } from "@/db/queries";
import { loadAvailableProfit, loadMemberFeedContext } from "@/db/feedContext";
import { recordCurrentProfitObservations } from "@/db/promoObservations";
import { toPromoRowDTO } from "@/domain/promos/promoRowDto";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { sumOwnBookProfit } from "@/domain/promos/profitTotals";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import type {
  OpportunitiesEmptyVariant,
  OpportunitiesResponse,
  OpportunityItem,
  OpportunitySourceDTO,
} from "@/domain/opportunities/types";
import type { PromoRowDTO } from "@/domain/promos/dto";

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
  const availableProfit = await loadAvailableProfit(now, ctx.userBookSet);

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
    return respond("no-odds", "0.00", [{ id: "promos", items: [] }]);
  }

  // D-17: rankOpts.hedgeBookKeys is the member's own hedge books only.
  const singles = rankPromoHedges(ctx.feedPromos, ctx.rankOpts);
  // D-16: promos at books the member lacks are excluded entirely.
  const rows: PromoRowDTO[] = singles
    .map((o) => toPromoRowDTO(o, ctx.bookNames, ctx.userBookSet))
    .filter((r) => r.hasPromoBook);

  const items: OpportunityItem<PromoRowDTO>[] = rows.map((row) => ({
    rowKey: row.rowKey,
    profit: row.guaranteedProfit,
    pct: row.ratePct,
    pctLabel: row.rateLabel,
    commenceTime: row.commenceTime,
    data: row,
  }));

  const totalProfit = sumOwnBookProfit(
    rows.map((r) => ({ promoId: r.promoId, guaranteedProfit: r.guaranteedProfit, hasPromoBook: r.hasPromoBook })),
    ctx.doneIds,
  );

  const sources: OpportunitySourceDTO[] = [{ id: "promos", items }];

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
    if (wider.length > 0) {
      return respond("no-books", totalProfit, sources);
    }
  }
  return respond("nothing-profitable", totalProfit, sources);
}
