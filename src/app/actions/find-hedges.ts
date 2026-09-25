"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { FinderInputSchema } from "@/domain/finder/finderInput";
import type { FindHedgesResponse, FinderResultDTO, FinderLegDTO } from "@/domain/finder/types";
import { getBonusBooks, getHedgeBookKeys, getCachedEvents } from "@/db/queries";
import { extractTwoWayMoneylines } from "@/domain/hedge/marketFilter";
import { rankBonusBetHedges, type BonusBetOpportunity, type HedgeLeg } from "@/domain/hedge/rankBonusBetHedges";
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
 * findHedges: reads cached odds from Postgres and returns the top 10 ranked
 * bonus-bet hedge conversions (BONUS-01, D-06, D-13). Zero Odds API calls on
 * this path — this file must never call the odds-fetch layer directly.
 */
export async function findHedges(input: unknown): Promise<FindHedgesResponse> {
  const parsed = FinderInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { status: "invalid", fieldErrors };
  }

  const { bookKey, bonusAmount, sportKey } = parsed.data;

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
  const sportKeys = sportKey === "all" ? new Set(SPORT_KEYS) : new Set([sportKey]);

  const markets = extractTwoWayMoneylines(events, {
    now: new Date(),
    windowDays: WINDOW_DAYS,
    allowedBookKeys: hedgeBookKeys,
    sportKeys,
  });

  const opportunities = rankBonusBetHedges(markets, {
    bonusBookKey: bookKey,
    bonusAmount: new Decimal(bonusAmount),
    hedgeBookKeys,
    limit: RESULT_LIMIT,
  });

  const normalizedBonusAmount = new Decimal(bonusAmount).toFixed(2);

  return {
    status: "ok",
    results: opportunities.map((o) => toResultDTO(o, bookNames, normalizedBonusAmount)),
    oddsFetchedAt: fetchedAt.toISOString(),
    bonusBookName: bonusBook.displayName,
    bonusAmount: normalizedBonusAmount,
    sportKey,
  };
}
