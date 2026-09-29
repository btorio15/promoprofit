import { getActivePromos } from "./promos";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "./queries";
import type { PromoRowDTO, UnprofitablePromoRowDTO } from "@/domain/promos/dto";
import type { DonePromoTerms } from "@/domain/promos/doneSnapshot";
import { promoTitle, toPromoRowDTO, toUnprofitablePromoRowDTO } from "@/domain/promos/promoRowDto";
import { findUnprofitablePromos, rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import type { StakePrecision } from "@/domain/hedge/arbMath";

/**
 * quick-260929-igk: one promo's CURRENT row for ONE member, computed with the
 * exact same inputs getPromos uses (the member's own books via
 * getUserBookKeys -> getHedgeBookKeys, the same bonus-book names, both cached
 * odds sets, the member's stake precision). rankPromoHedges evaluates every
 * promo independently, so ranking a single promo alone yields the identical
 * row the feed shows for it (proved by the parity test in get-promos.test.ts).
 *
 * Used by the mark-done action to build the snapshot on the server. `userId`
 * MUST come from the session, never from client input.
 */
export type MemberPromoState =
  | { kind: "not_active" }
  | {
      kind: "hedge";
      terms: DonePromoTerms;
      row: PromoRowDTO;
      oddsFetchedAt: { moneyline: Date | null; spreadsTotals: Date | null };
    }
  | {
      kind: "no_hedge";
      terms: DonePromoTerms;
      row: UnprofitablePromoRowDTO;
      oddsFetchedAt: { moneyline: Date | null; spreadsTotals: Date | null };
    };

export async function computeMemberPromoState(args: {
  userId: number;
  promoId: number;
  precision: StakePrecision;
  now: Date;
}): Promise<MemberPromoState> {
  const { userId, promoId, precision, now } = args;

  const activePromos = await getActivePromos(now);
  const promo = activePromos.find((p) => p.id === promoId);
  if (!promo) return { kind: "not_active" };

  const userBookSet = new Set(await getUserBookKeys(userId));
  const [hedgeBookKeys, bonusBooks, { events: moneylineEvents, fetchedAt: moneylineFetchedAt }, { events: extendedEvents, fetchedAt: spreadsTotalsFetchedAt }] =
    await Promise.all([getHedgeBookKeys(userBookSet), getBonusBooks(), getCachedEvents(), getCachedExtendedEvents()]);

  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));
  const rankOpts = {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(hedgeBookKeys),
    precision,
    now,
  };

  const terms: DonePromoTerms = {
    id: promo.id,
    bookKey: promo.bookKey,
    promoType: promo.promoType,
    title: promoTitle(promo),
    boostPercent: promo.boostPercent,
    boostedOddsAmerican: promo.boostedOddsAmerican,
    baseOddsAmerican: promo.baseOddsAmerican,
    bonusAmount: promo.bonusAmount,
    maxStake: promo.maxStake,
    winningsCap: promo.winningsCap,
    minOddsAmerican: promo.minOddsAmerican,
  };
  const oddsFetchedAt = { moneyline: moneylineFetchedAt, spreadsTotals: spreadsTotalsFetchedAt };

  const opportunity = rankPromoHedges([promo], rankOpts)[0];
  if (opportunity) {
    return { kind: "hedge", terms, row: toPromoRowDTO(opportunity, bookNames, userBookSet), oddsFetchedAt };
  }

  const unprofitable = findUnprofitablePromos([promo], rankOpts)[0];
  if (!unprofitable) return { kind: "not_active" };
  return {
    kind: "no_hedge",
    terms,
    row: toUnprofitablePromoRowDTO(unprofitable, bookNames, userBookSet),
    oddsFetchedAt,
  };
}
