import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import type { ArbLegDTO, ArbResultDTO } from "@/domain/arb/types";
import { extractTwoWayMoneylines } from "@/domain/hedge/marketFilter";
import { extractTwoWaySpreadsAndTotals } from "@/domain/hedge/spreadsTotalsFilter";
import { moneylineToArbMarket, type ArbLeg, type ArbMarket, type ArbOpportunity } from "@/domain/hedge/rankArbs";
import { getSportLabel } from "@/config/sports";
import type { OddsEvent } from "@/domain/odds/schemas";

// Pure arb builders shared by findArbs and getOpportunities. Kept out of the
// "use server" file so they are not exposed as server actions.
export const ARB_WINDOW_DAYS = 7;

function toLegDTO(leg: ArbLeg, bookNames: Map<string, string>, marketType: ArbMarket["marketType"]): ArbLegDTO {
  return {
    bookKey: leg.bookKey,
    bookName: bookNames.get(leg.bookKey) ?? leg.bookKey,
    selection: selectionLabel(marketType, leg.selection, leg.point),
    oddsAmerican: leg.oddsAmerican,
    tiedBookNames: leg.tiedBookKeys.map((k) => bookNames.get(k) ?? k),
  };
}

export function toArbResultDTO(opportunity: ArbOpportunity, bookNames: Map<string, string>): ArbResultDTO {
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

export function buildArbMarkets(
  moneylineEvents: OddsEvent[],
  extendedEvents: OddsEvent[],
  sportKeys: ReadonlySet<string>,
  now: Date,
  allowedBookKeys: ReadonlySet<string>,
): ArbMarket[] {
  const moneylineMarkets = extractTwoWayMoneylines(moneylineEvents, {
    now,
    windowDays: ARB_WINDOW_DAYS,
    allowedBookKeys,
    sportKeys,
  }).map(moneylineToArbMarket);

  const spreadsTotalsMarkets = extractTwoWaySpreadsAndTotals(extendedEvents, {
    now,
    windowDays: ARB_WINDOW_DAYS,
    allowedBookKeys,
    sportKeys,
  });

  return [...moneylineMarkets, ...spreadsTotalsMarkets];
}
