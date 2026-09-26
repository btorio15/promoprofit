"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { FinderInputSchema } from "@/domain/finder/finderInput";
import type {
  FindHedgesResponse,
  FinderResultDTO,
  FinderLegDTO,
  FinderResultsBySport,
} from "@/domain/finder/types";
import { getBonusBooks, getHedgeBookKeys, getCachedEvents } from "@/db/queries";
import { extractTwoWayMoneylines, type TwoWayMoneylineMarket } from "@/domain/hedge/marketFilter";
import { rankBonusBetHedges, type BonusBetOpportunity, type HedgeLeg, type RankOptions } from "@/domain/hedge/rankBonusBetHedges";
import { SPORT_KEYS, getSportLabel } from "@/config/sports";

const WINDOW_DAYS = 7;
const RESULT_LIMIT = 10;

function toLegDTO(leg: HedgeLeg, bookNames: Map<string, string>): FinderLegDTO {
  return {
    bookKey: leg.bookKey,
    bookName: bookNames.get(leg.bookKey) ?? leg.bookKey,
    team: leg.team,
    oddsAmerican: leg.oddsAmerican,
  };
}

function toResultDTO(
  opportunity: BonusBetOpportunity,
  bookNames: Map<string, string>,
  normalizedBonusAmount: string,
): FinderResultDTO {
  const { result } = opportunity;
  return {
    eventId: opportunity.eventId,
    sportKey: opportunity.sportKey,
    sportLabel: getSportLabel(opportunity.sportKey),
    commenceTime: opportunity.commenceTime.toISOString(),
    homeTeam: opportunity.homeTeam,
    awayTeam: opportunity.awayTeam,
    tieRisk: opportunity.tieRisk,
    sameBook: opportunity.sameBook,
    bonus: toLegDTO(opportunity.bonus, bookNames),
    hedge: toLegDTO(opportunity.hedge, bookNames),
    bonusAmount: normalizedBonusAmount,
    hedgeStake: result.hedgeStake.toFixed(2),
    bonusPayout: result.bonusPayout.toFixed(2),
    hedgePayout: result.hedgePayout.toFixed(2),
    netIfBonusWins: result.netIfBonusWins.toFixed(2),
    netIfHedgeWins: result.netIfHedgeWins.toFixed(2),
    guaranteedProfit: result.guaranteedProfit.toFixed(2),
    conversionPct: result.conversionPct.toFixed(2),
  };
}

/**
 * Ranks markets for a single sport scope (either "all" D-01 sports, or one
 * sport's own markets) completely independently -- never by slicing the
 * "all" ranking -- so a sport can appear in its own tab even when none of
 * its markets crack the overall top 10 (owner-requested scope change, 01-05).
 */
function rankForSportKeys(
  events: Parameters<typeof extractTwoWayMoneylines>[0],
  sportKeys: ReadonlySet<string>,
  now: Date,
  rankOpts: RankOptions,
): BonusBetOpportunity[] {
  const markets: TwoWayMoneylineMarket[] = extractTwoWayMoneylines(events, {
    now,
    windowDays: WINDOW_DAYS,
    allowedBookKeys: rankOpts.hedgeBookKeys,
    sportKeys,
  });
  return rankBonusBetHedges(markets, rankOpts);
}

/**
 * findHedges: reads cached odds from Postgres and returns, for one search,
 * the top 10 ranked bonus-bet hedge conversions overall plus each sport's
 * own top 10 (BONUS-01, D-06, D-13). The sport is a client-side tab, not a
 * search input, so this always computes every scope from one cache read.
 * Zero Odds API calls on this path — this file must never call the
 * odds-fetch layer directly.
 */
export async function findHedges(input: unknown): Promise<FindHedgesResponse> {
  const parsed = FinderInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { status: "invalid", fieldErrors };
  }

  const { bookKey, bonusAmount, maxHedgeAmount } = parsed.data;

  const bonusBooks = await getBonusBooks();
  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));
  const bonusBook = bonusBooks.find((b) => b.key === bookKey);
  if (!bonusBook) {
    return {
      status: "invalid",
      fieldErrors: { bookKey: ["Choose the book holding your bonus bet."] },
    };
  }

  const { events, fetchedAt } = await getCachedEvents();
  if (fetchedAt === null) {
    return { status: "no_cached_odds" };
  }

  const hedgeBookKeys = new Set(await getHedgeBookKeys());
  const normalizedBonusAmount = new Decimal(bonusAmount).toFixed(2);
  const now = new Date();

  const maxHedgeStake = maxHedgeAmount !== undefined ? new Decimal(maxHedgeAmount) : undefined;
  const normalizedMaxHedgeAmount = maxHedgeStake !== undefined ? maxHedgeStake.toFixed(2) : null;

  const rankOpts: RankOptions = {
    bonusBookKey: bookKey,
    bonusAmount: new Decimal(bonusAmount),
    hedgeBookKeys,
    limit: RESULT_LIMIT,
    maxHedgeStake,
  };

  const resultsBySport: FinderResultsBySport = {};
  const limitExcludedAll: Record<string, boolean> = {};

  /**
   * Ranks one scope with the cap applied, records its DTOs, and -- only
   * when a cap is set and the capped ranking came back empty -- re-ranks
   * the same scope without the cap (pure in-memory, zero API calls) to
   * decide whether the cap is the reason this scope is empty (D-18).
   */
  function computeScope(sportKeys: ReadonlySet<string>, key: string): void {
    const opportunities = rankForSportKeys(events, sportKeys, now, rankOpts);
    resultsBySport[key] = opportunities.map((o) =>
      toResultDTO(o, bookNames, normalizedBonusAmount),
    );

    if (maxHedgeStake === undefined || opportunities.length > 0) {
      limitExcludedAll[key] = false;
      return;
    }

    const uncapped = rankForSportKeys(events, sportKeys, now, { ...rankOpts, maxHedgeStake: undefined });
    limitExcludedAll[key] = uncapped.length > 0;
  }

  computeScope(new Set(SPORT_KEYS), "all");
  for (const sportKey of SPORT_KEYS) {
    computeScope(new Set([sportKey]), sportKey);
  }

  return {
    status: "ok",
    resultsBySport,
    oddsFetchedAt: fetchedAt.toISOString(),
    bonusBookName: bonusBook.displayName,
    bonusAmount: normalizedBonusAmount,
    maxHedgeAmount: normalizedMaxHedgeAmount,
    limitExcludedAll,
  };
}
