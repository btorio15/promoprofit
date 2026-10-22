import { COLORADO_BOOKS } from "@/config/books";
import { getActivePromos } from "@/db/promos";
import {
  getBonusBooks,
  getCachedEvents,
  getCachedExtendedEvents,
  getHedgeBookKeys,
  getUserBookKeys,
} from "@/db/queries";
import { getPromoCompletions } from "@/db/promoTracking";
import { toDoneRows } from "@/domain/promos/doneSnapshot";
import { getMemberProfitHistory } from "@/db/memberObservations";
import {
  buildProfitSeriesData,
  type ProfitSeriesDTO,
} from "@/domain/promos/profitSeries";
import { denverDate } from "@/domain/promos/profitTotals";
import type { RankOptions } from "@/domain/promos/rankPromoHedges";
import type { StakePrecision } from "@/domain/hedge/arbMath";

/**
 * Phase 6 (STATS-01..03): the member's own all-time daily gains. Plain module;
 * the caller passes the session user id (from requireUser()). D-04 revised and
 * D-18: the grey line uses only member_profit_observations, no group fallback.
 * The graph start day is the table-wide earliest denver_date, or today when
 * the table is empty. Never throws: the feed must not fail because of the graph.
 */
export async function loadProfitSeries({
  userId,
  now,
  completions,
}: {
  userId: number;
  now: Date;
  completions: { completedAt: Date; profitExtracted: string }[];
}): Promise<ProfitSeriesDTO> {
  const today = denverDate(now);
  try {
    const history = await getMemberProfitHistory(userId);
    if (history.status === "not-ready") {
      return { status: "not-ready" };
    }
    const graphStartDay = history.graphStartDay ?? today;
    return {
      status: "ready",
      ...buildProfitSeriesData({
        memberRows: history.rows,
        completions,
        graphStartDay,
        today,
      }),
    };
  } catch (err) {
    console.error("loadProfitSeries: failed to build the profit series", err);
    return { status: "error" };
  }
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
    { events: moneylineEvents, fetchedAt: oddsFetchedAt, fetchedAtByEventId: oddsFetchedAtByEventId },
    {
      events: extendedEvents,
      fetchedAt: extendedOddsFetchedAt,
      fetchedAtByEventId: extendedOddsFetchedAtByEventId,
    },
  ] = await Promise.all([
    getActivePromos(now, userId),
    getPromoCompletions(userId),
    getUserBookKeys(userId),
    getBonusBooks(),
    getCachedEvents(),
    getCachedExtendedEvents(),
  ]);

  const userBookSet = new Set(userBookKeys);
  const hedgeBookKeys = await getHedgeBookKeys(userBookSet);

  const colBookNames = new Map<string, string>(
    COLORADO_BOOKS.map((b) => [b.key, b.displayName]),
  );
  const doneRows = toDoneRows(completions, colBookNames);
  const doneIds = new Set(completions.map((c) => c.promoId));
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
    hedgeBookKeys,
    // Every usable book (equals getHedgeBookKeys() with no argument), for group recording.
    everyUsableHedgeBookKeys: bonusBooks.map((b) => b.key),
    bookNames,
    moneylineEvents,
    extendedEvents,
    oddsFetchedAt,
    extendedOddsFetchedAt,
    oddsFetchedAtByEventId,
    extendedOddsFetchedAtByEventId,
    rankOpts,
  };
}
