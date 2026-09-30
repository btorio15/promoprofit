import { COLORADO_BOOKS } from "@/config/books";
import { getActivePromos } from "@/db/promos";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "@/db/queries";
import { getProfitObservationsSince, getPromoCompletions } from "@/db/promoTracking";
import { sumProfitExtracted, toDonePromoDTO } from "@/domain/promos/doneSnapshot";
import { periodStartDates, summarizeAvailableProfit, type AvailableProfit } from "@/domain/promos/profitTotals";
import type { RankOptions } from "@/domain/promos/rankPromoHedges";
import type { StakePrecision } from "@/domain/hedge/arbMath";

/**
 * quick-260927-n12: the member's own-book today/week/month "profit
 * available" numbers (owner decision 3), from persisted observations --
 * independent of the live feed, so it's computed in EVERY "ok" branch of
 * getPromos/getOpportunities, including every empty-state variant. Reads
 * from the min of the week/month start (ISO date strings compare
 * correctly) so one query covers both periods.
 */
export async function loadAvailableProfit(now: Date, ownBookKeys: ReadonlySet<string>): Promise<AvailableProfit> {
  const { weekStart, monthStart } = periodStartDates(now);
  const sinceDate = weekStart < monthStart ? weekStart : monthStart;
  const observations = await getProfitObservationsSince(sinceDate);
  return summarizeAvailableProfit(observations, ownBookKeys, now);
}

/**
 * The reads every feed-style screen needs (member's books, active promos,
 * done split, cached odds, ranking options), in one parallel batch. Plain
 * module, not a server action: the acting user id is passed in by the
 * caller, which must have got it from requireUser().
 */
export async function loadMemberFeedContext({
  userId,
  precision,
  now,
}: {
  userId: number;
  precision: StakePrecision;
  now: Date;
}) {
  const [
    activePromos,
    completions,
    userBookKeys,
    bonusBooks,
    { events: moneylineEvents, fetchedAt: oddsFetchedAt },
    { events: extendedEvents, fetchedAt: extendedOddsFetchedAt },
  ] = await Promise.all([
    getActivePromos(now),
    getPromoCompletions(userId),
    getUserBookKeys(userId),
    getBonusBooks(),
    getCachedEvents(),
    getCachedExtendedEvents(),
  ]);

  const userBookSet = new Set(userBookKeys);
  const hedgeBookKeys = await getHedgeBookKeys(userBookSet);

  const colBookNames = new Map<string, string>(COLORADO_BOOKS.map((b) => [b.key, b.displayName]));
  const doneRows = completions.map((c) => toDonePromoDTO(c, colBookNames));
  const doneIds = new Set(completions.map((c) => c.promoId));
  const totalExtracted = sumProfitExtracted(doneRows);
  const feedPromos = activePromos.filter((p) => !doneIds.has(p.id));
  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));

  const rankOpts: RankOptions = {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(hedgeBookKeys),
    precision,
    now,
  };

  return {
    userBookSet,
    activePromos,
    completions,
    doneIds,
    feedPromos,
    doneRows,
    totalExtracted,
    hedgeBookKeys,
    bookNames,
    moneylineEvents,
    extendedEvents,
    oddsFetchedAt,
    extendedOddsFetchedAt,
    rankOpts,
  };
}
