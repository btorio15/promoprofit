import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateBonusBetHedge, type BonusBetHedgeResult } from "./bonusBet";
import type { MoneylineQuote, TwoWayMoneylineMarket } from "./marketFilter";
import { isMarketVenue } from "@/config/books";
import { toMarketLeg } from "@/domain/market/marketLeg";
import { solveBonusBetMarketHedge, type MarketFill } from "@/domain/market/solveMarketHedge";

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
  /** Whole-contract market fill when the hedge is at a prediction market, else null. */
  market: MarketFill | null;
}

export interface RankOptions {
  bonusBookKey: string;
  bonusAmount: Decimal;
  hedgeBookKeys: ReadonlySet<string>;
  limit?: number;
  /** Optional cap (D-18): games whose best orientation's hedgeStake exceeds
   * this are dropped before sort/slice, never scaled or partial, and no
   * fallback orientation is used (owner decision 2026-09-26, UAT 01.1 Test
   * 5) -- a game whose best orientation doesn't fit under the cap is
   * dropped rather than replaced by its cheaper, worse orientation. */
  maxHedgeStake?: Decimal;
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
  const candidates = quotes.filter(
    (q) => q.outcome === outcome && hedgeBookKeys.has(q.bookKey) && !isMarketVenue(q.bookKey),
  );
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

  let chosenQuote: MoneylineQuote | null = null;
  let chosenResult: BonusBetHedgeResult | null = null;
  let chosenMarket: MarketFill | null = null;

  if (hedgeQuote) {
    chosenQuote = hedgeQuote;
    chosenResult = calculateBonusBetHedge({
      bonusAmount: opts.bonusAmount,
      bonusOddsAmerican: bonusQuote.oddsAmerican,
      hedgeOddsAmerican: hedgeQuote.oddsAmerican,
    });
  }

  // D-02: a market hedge replaces the book hedge only when its after-fee
  // profit is strictly greater. Among markets: highest profit, then venue key.
  const marketQuotes = market.quotes
    .filter(
      (q) =>
        q.outcome === hedgeOutcome && opts.hedgeBookKeys.has(q.bookKey) && isMarketVenue(q.bookKey),
    )
    .sort((x, y) => (x.bookKey < y.bookKey ? -1 : x.bookKey > y.bookKey ? 1 : 0));
  let bestMarket: { quote: MoneylineQuote; solved: NonNullable<ReturnType<typeof solveBonusBetMarketHedge>> } | null = null;
  for (const quote of marketQuotes) {
    const leg = toMarketLeg(quote);
    if (!leg) continue;
    const solved = solveBonusBetMarketHedge({
      bonusAmount: opts.bonusAmount,
      bonusOddsAmerican: bonusQuote.oddsAmerican,
      leg,
    });
    if (!solved) continue;
    if (!bestMarket || solved.guaranteedProfit.gt(bestMarket.solved.guaranteedProfit)) {
      bestMarket = { quote, solved };
    }
  }
  if (
    bestMarket &&
    (chosenResult === null || bestMarket.solved.guaranteedProfit.gt(chosenResult.guaranteedProfit))
  ) {
    chosenQuote = bestMarket.quote;
    chosenResult = bestMarket.solved;
    chosenMarket = bestMarket.solved.market;
  }

  if (!chosenQuote || !chosenResult) return null;
  if (chosenResult.guaranteedProfit.lte(0)) return null;

  return {
    eventId: market.eventId,
    sportKey: market.sportKey,
    commenceTime: market.commenceTime,
    homeTeam: market.homeTeam,
    awayTeam: market.awayTeam,
    tieRisk: market.tieRisk,
    bonus: toLeg(bonusQuote),
    hedge: toLeg(chosenQuote),
    sameBook: chosenMarket === null && chosenQuote.bookKey === bonusQuote.bookKey,
    result: chosenResult,
    market: chosenMarket,
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

  // D-18: apply the cap BEFORE sort/slice, not after -- otherwise an
  // over-cap game occupying a top-10 slot would silently shrink the result
  // count instead of letting the next affordable game take its place. The
  // best orientation is chosen above from the UNCAPPED candidates; a game
  // whose best orientation is over the cap is dropped here rather than
  // falling back to its cheaper, worse orientation (owner decision
  // 2026-09-26, UAT 01.1 Test 5).
  const withinCap =
    opts.maxHedgeStake === undefined
      ? opportunities
      : opportunities.filter((o) => o.result.hedgeStake.lte(opts.maxHedgeStake as Decimal));

  withinCap.sort((a, b) => {
    const profitDiff = b.result.guaranteedProfit.comparedTo(a.result.guaranteedProfit);
    if (profitDiff !== 0) return profitDiff;

    const timeDiff = a.commenceTime.getTime() - b.commenceTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  return withinCap.slice(0, limit);
}
