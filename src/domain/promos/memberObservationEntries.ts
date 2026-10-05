import Decimal from "decimal.js";
import type { PairCandidate } from "./pairPromos";
import type { PromoOpportunity } from "./rankPromoHedges";

export interface MemberObservationEntry {
  promoId: number;
  bookKey: string;
  denverDate: string;
  /** Guaranteed profit in dollars, fixed to 2 decimals. Always > 0. */
  profit: string;
  partnerPromoId: number | null;
}

/**
 * Turns the member's feed (singles + chosen pairs) into per-promo observation rows.
 *
 * - A chosen pair is recorded as two rows whose profits sum EXACTLY to the pair's
 *   guaranteed profit at the cent: shareA = promoA's separate profit (cent-rounded,
 *   clamped to [0, pairProfit]); shareB = pairProfit - shareA (Decimal subtraction,
 *   so no rounding drift). The pair replaces the two singles (D-06).
 * - Singles are recorded only for promos at one of the member's books (same as the
 *   feed's hasPromoBook filter) and only when profit > 0.
 *
 * Note: the DB upsert keeps the greatest value per promo-day, which can mix single
 * and pair states within one day (accepted "best observed", RESEARCH Pitfall 4).
 *
 * Pure: decimal.js only, no database access.
 */
export function buildMemberObservationEntries(args: {
  denverDate: string;
  singles: PromoOpportunity[];
  chosenPairs: PairCandidate[];
  userBookSet: ReadonlySet<string>;
}): MemberObservationEntry[] {
  const { denverDate, singles, chosenPairs, userBookSet } = args;
  const entries: MemberObservationEntry[] = [];
  const emitted = new Set<number>();
  const pairedIds = new Set<number>();

  const push = (promoId: number, bookKey: string, profit: Decimal, partnerPromoId: number | null) => {
    if (!profit.gt(0) || emitted.has(promoId)) return;
    emitted.add(promoId);
    entries.push({ promoId, bookKey, denverDate, profit: profit.toFixed(2), partnerPromoId });
  };

  for (const c of chosenPairs) {
    pairedIds.add(c.promoA.id);
    pairedIds.add(c.promoB.id);
    const pairProfit = new Decimal(c.result.guaranteedProfit.toFixed(2));
    let shareA = new Decimal(c.separateProfitA.toFixed(2));
    if (shareA.lt(0)) shareA = new Decimal(0);
    if (shareA.gt(pairProfit)) shareA = pairProfit;
    const shareB = pairProfit.minus(shareA);
    push(c.promoA.id, c.promoA.bookKey, shareA, c.promoB.id);
    push(c.promoB.id, c.promoB.bookKey, shareB, c.promoA.id);
  }

  for (const opp of singles) {
    const promo = opp.promo;
    if (pairedIds.has(promo.id)) continue;
    if (!userBookSet.has(promo.bookKey)) continue;
    const profit =
      opp.result.kind === "boost" ? opp.result.boost.guaranteedProfit : opp.result.bonus.guaranteedProfit;
    push(promo.id, promo.bookKey, new Decimal(profit.toFixed(2)), null);
  }

  return entries;
}
