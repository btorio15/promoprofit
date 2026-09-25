import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateBonusBetHedge, type BonusBetHedgeResult } from "./bonusBet";
import type { MoneylineQuote, TwoWayMoneylineMarket } from "./marketFilter";

const DEFAULT_LIMIT = 10;
const OPPOSITE_OUTCOME = { home: "away", away: "home" } as const;

export interface HedgeLeg {
  bookKey: string;
  outcome: "home" | "away";
  team: string;
  oddsAmerican: number;
}

export interface BonusBetOpportunity {
  eventId: string;
  sportKey: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  tieRisk: boolean;
  bonus: HedgeLeg;
  hedge: HedgeLeg;
  sameBook: boolean;
  result: BonusBetHedgeResult;
}

export interface RankOptions {
  bonusBookKey: string;
  bonusAmount: Decimal;
  hedgeBookKeys: ReadonlySet<string>;
  limit?: number;
}

function toLeg(quote: MoneylineQuote): HedgeLeg {
  return {
    bookKey: quote.bookKey,
    outcome: quote.outcome,
    team: quote.team,
    oddsAmerican: quote.oddsAmerican,
  };
}

/** Highest-decimal-odds quote for the given outcome among hedgeBookKeys; ties broken alphabetically by bookKey. */
function bestHedgeQuote(
  quotes: MoneylineQuote[],
  outcome: "home" | "away",
  hedgeBookKeys: ReadonlySet<string>,
): MoneylineQuote | null {
  const candidates = quotes.filter((q) => q.outcome === outcome && hedgeBookKeys.has(q.bookKey));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDecimal = americanToDecimal(best.oddsAmerican);

  for (const candidate of candidates.slice(1)) {
    const candidateDecimal = americanToDecimal(candidate.oddsAmerican);
    if (
      candidateDecimal.gt(bestDecimal) ||
      (candidateDecimal.equals(bestDecimal) && candidate.bookKey < best.bookKey)
    ) {
      best = candidate;
      bestDecimal = candidateDecimal;
    }
  }

  return best;
}

function buildOrientation(
  market: TwoWayMoneylineMarket,
  bonusQuote: MoneylineQuote,
  opts: RankOptions,
): BonusBetOpportunity | null {
  const hedgeOutcome = OPPOSITE_OUTCOME[bonusQuote.outcome];
  const hedgeQuote = bestHedgeQuote(market.quotes, hedgeOutcome, opts.hedgeBookKeys);
  if (!hedgeQuote) return null;

  const result = calculateBonusBetHedge({
    bonusAmount: opts.bonusAmount,
    bonusOddsAmerican: bonusQuote.oddsAmerican,
    hedgeOddsAmerican: hedgeQuote.oddsAmerican,
  });

  if (result.guaranteedProfit.lte(0)) return null;

  return {
    eventId: market.eventId,
    sportKey: market.sportKey,
    commenceTime: market.commenceTime,
    homeTeam: market.homeTeam,
    awayTeam: market.awayTeam,
    tieRisk: market.tieRisk,
    bonus: toLeg(bonusQuote),
    hedge: toLeg(hedgeQuote),
    sameBook: hedgeQuote.bookKey === bonusQuote.bookKey,
    result,
  };
}

/**
 * Pure ranking of bonus-bet hedge opportunities (D-06/D-08/D-17). No I/O.
 */
export function rankBonusBetHedges(
  markets: TwoWayMoneylineMarket[],
  opts: RankOptions,
): BonusBetOpportunity[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const opportunities: BonusBetOpportunity[] = [];

  for (const market of markets) {
    const bonusQuotes = market.quotes.filter((q) => q.bookKey === opts.bonusBookKey);
    if (bonusQuotes.length === 0) continue;

    let best: BonusBetOpportunity | null = null;
    for (const bonusQuote of bonusQuotes) {
      const opportunity = buildOrientation(market, bonusQuote, opts);
      if (!opportunity) continue;
      if (!best || opportunity.result.guaranteedProfit.gt(best.result.guaranteedProfit)) {
        best = opportunity;
      }
    }

    if (best) opportunities.push(best);
  }

  opportunities.sort((a, b) => {
    const profitDiff = b.result.guaranteedProfit.comparedTo(a.result.guaranteedProfit);
    if (profitDiff !== 0) return profitDiff;

    const timeDiff = a.commenceTime.getTime() - b.commenceTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  return opportunities.slice(0, limit);
}
