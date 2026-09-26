"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { ArbInputSchema } from "@/domain/arb/arbInput";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import type { ArbLegDTO, ArbResultDTO, ArbResultsBySport, FindArbsResponse } from "@/domain/arb/types";
import { getBonusBooks, getHedgeBookKeys, getUserBookKeys, getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { extractTwoWayMoneylines } from "@/domain/hedge/marketFilter";
import { extractTwoWaySpreadsAndTotals } from "@/domain/hedge/spreadsTotalsFilter";
import { rankArbs, moneylineToArbMarket, type ArbLeg, type ArbMarket, type ArbOpportunity } from "@/domain/hedge/rankArbs";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import { SPORT_KEYS, getSportLabel } from "@/config/sports";
import type { OddsEvent } from "@/domain/odds/schemas";
import { requireUser } from "@/lib/session";

const WINDOW_DAYS = 7;

/**
 * findArbs: reads BOTH the moneyline cache (cached_odds) and the spreads/
 * totals cache (cached_extended_odds) from Postgres and returns, for one
 * search, every true arb per sport scope, ranked by return % descending
 * (D-04, D-11, D-12). This file must NEVER import the odds-fetch client --
 * moneyline arbs cost zero Odds API credits on this path (SC1), and
 * spreads/totals are only ever included when a prior "Search spreads &
 * totals" press has already populated cached_extended_odds.
 */

function toLegDTO(leg: ArbLeg, bookNames: Map<string, string>, marketType: ArbMarket["marketType"]): ArbLegDTO {
  return {
    bookKey: leg.bookKey,
    bookName: bookNames.get(leg.bookKey) ?? leg.bookKey,
    selection: selectionLabel(marketType, leg.selection, leg.point),
    oddsAmerican: leg.oddsAmerican,
    tiedBookNames: leg.tiedBookKeys.map((k) => bookNames.get(k) ?? k),
  };
}

function toArbResultDTO(opportunity: ArbOpportunity, bookNames: Map<string, string>): ArbResultDTO {
  const { result } = opportunity;
  const netIfAWins = result.netIfAWins.toFixed(2);
  const netIfBWins = result.netIfBWins.toFixed(2);

  return {
    rowKey: opportunity.rowKey,
    eventId: opportunity.eventId,
    sportKey: opportunity.sportKey,
    sportLabel: getSportLabel(opportunity.sportKey),
    commenceTime: opportunity.commenceTime.toISOString(),
    homeTeam: opportunity.homeTeam,
    awayTeam: opportunity.awayTeam,
    marketType: opportunity.marketType,
    marketBadge: marketBadgeLabel(opportunity.marketType, opportunity.line),
    tieRisk: opportunity.tieRisk,
    sideA: toLegDTO(opportunity.sideA, bookNames, opportunity.marketType),
    sideB: toLegDTO(opportunity.sideB, bookNames, opportunity.marketType),
    stakeA: result.stakeA.toFixed(2),
    stakeB: result.stakeB.toFixed(2),
    totalLaid: result.totalLaid.toFixed(2),
    payoutA: result.payoutA.toFixed(2),
    payoutB: result.payoutB.toFixed(2),
    netIfAWins,
    netIfBWins,
    guaranteedProfit: result.guaranteedProfit.toFixed(2),
    returnPct: result.returnPct.toFixed(2),
    worstCase: netIfAWins !== netIfBWins,
  };
}

function buildMarkets(
  moneylineEvents: OddsEvent[],
  extendedEvents: OddsEvent[],
  sportKeys: ReadonlySet<string>,
  now: Date,
  allowedBookKeys: ReadonlySet<string>,
): ArbMarket[] {
  const moneylineMarkets = extractTwoWayMoneylines(moneylineEvents, {
    now,
    windowDays: WINDOW_DAYS,
    allowedBookKeys,
    sportKeys,
  }).map(moneylineToArbMarket);

  const spreadsTotalsMarkets = extractTwoWaySpreadsAndTotals(extendedEvents, {
    now,
    windowDays: WINDOW_DAYS,
    allowedBookKeys,
    sportKeys,
  });

  return [...moneylineMarkets, ...spreadsTotalsMarkets];
}

export async function findArbs(input: unknown): Promise<FindArbsResponse> {
  const user = await requireUser();

  const parsed = ArbInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { status: "invalid", fieldErrors };
  }

  const { totalStake, precision } = parsed.data;

  const userBookSet = new Set(await getUserBookKeys(user.userId));

  const [bonusBooks, hedgeBookKeys, { events: moneylineEvents, fetchedAt: oddsFetchedAt }, { events: extendedEvents, fetchedAt: extendedOddsFetchedAt }] =
    await Promise.all([
      getBonusBooks(userBookSet),
      getHedgeBookKeys(userBookSet),
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);

  if (oddsFetchedAt === null && extendedOddsFetchedAt === null) {
    return { status: "no_cached_odds" };
  }

  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));
  const allowedBookKeys = new Set(hedgeBookKeys);
  const now = new Date();
  const stake = new Decimal(totalStake);
  const rankOpts = { totalStake: stake, precision: precision as StakePrecision };

  const resultsBySport: ArbResultsBySport = {};

  function computeScope(sportKeys: ReadonlySet<string>, key: string): void {
    const markets = buildMarkets(moneylineEvents, extendedEvents, sportKeys, now, allowedBookKeys);
    const opportunities = rankArbs(markets, rankOpts);
    resultsBySport[key] = opportunities.map((o) => toArbResultDTO(o, bookNames));
  }

  computeScope(new Set(SPORT_KEYS), "all");
  for (const sportKey of SPORT_KEYS) {
    computeScope(new Set([sportKey]), sportKey);
  }

  /**
   * D-16, D-18: true only when the "all" scope came back empty, the user
   * hasn't selected every usable book, AND the same cached events (zero
   * extra reads, D-19) DO produce at least one arb at the full usable-book
   * set -- i.e. the user's own book selection, not a lack of arbs this
   * week, is why nothing surfaced.
   */
  let booksExcludedAll = false;
  if (resultsBySport.all.length === 0) {
    const everyUsableBookKey = await getHedgeBookKeys();
    const userHasEveryUsableBook = everyUsableBookKey.every((key) => userBookSet.has(key));
    if (!userHasEveryUsableBook) {
      const marketsAtEveryUsableBook = buildMarkets(
        moneylineEvents,
        extendedEvents,
        new Set(SPORT_KEYS),
        now,
        new Set(everyUsableBookKey),
      );
      booksExcludedAll = rankArbs(marketsAtEveryUsableBook, rankOpts).length > 0;
    }
  }

  return {
    status: "ok",
    resultsBySport,
    oddsFetchedAt: oddsFetchedAt !== null ? oddsFetchedAt.toISOString() : null,
    extendedOddsFetchedAt: extendedOddsFetchedAt !== null ? extendedOddsFetchedAt.toISOString() : null,
    totalStake: stake.toFixed(2),
    precision,
    booksExcludedAll,
  };
}
