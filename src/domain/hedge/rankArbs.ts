import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateArb, type ArbResult, type StakePrecision } from "./arbMath";
import type { TwoWayMoneylineMarket } from "./marketFilter";
import { isMarketVenue } from "@/config/books";
import { toMarketLeg, type ContractSide, type MarketFill } from "@/domain/market/marketLeg";
import { solveArbWithMarket } from "@/domain/market/solveMarketHedge";

/**
 * Book-pair arb search + ranking (D-06/D-07/D-11). Unlike the finder's
 * per-side "independent best price" helper (safe there only because the
 * bonus book is a fixed user input), both sides here are derived from
 * "best price," so an explicit joint pair search is required to avoid
 * selecting the same book for both sides.
 */
export interface ArbSideQuote {
  bookKey: string;
  oddsAmerican: number;
  /** Market venues only: displayed depth at the ask (D-13) and contract side. */
  askSize?: number | null;
  contractSide?: ContractSide | null;
}

export interface ArbSide {
  selection: string;
  point: number | null;
  quotes: ArbSideQuote[];
}

export type ArbMarketType = "moneyline" | "spread" | "total";

export interface ArbMarket {
  eventId: string;
  sportKey: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  marketType: ArbMarketType;
  line: number | null; // null for moneyline; home team's signed point for spreads; the total for totals
  tieRisk: boolean;
  sideA: ArbSide; // moneyline: away team; spread: away team at -line; total: "Over"
  sideB: ArbSide; // moneyline: home team; spread: home team at line; total: "Under"
}

export interface BestArbPair {
  sideA: ArbSideQuote;
  sideB: ArbSideQuote;
  impliedSum: Decimal;
  tiedBooksA: string[];
  tiedBooksB: string[];
}

/**
 * Joint (bookA, bookB) search where bookA != bookB (D-06), keeping the
 * pair with the lowest implied-probability sum. Deliberately NOT a
 * per-side "independent best price" helper — see rankBonusBetHedges.ts
 * for the single-side pattern this must not copy.
 */
export function findBestArbPair(
  sideAQuotes: ArbSideQuote[],
  sideBQuotes: ArbSideQuote[],
): BestArbPair | null {
  let best: BestArbPair | null = null;

  // D-04: this search is book-vs-book only; market quotes never take part.
  sideAQuotes = sideAQuotes.filter((q) => !isMarketVenue(q.bookKey));
  sideBQuotes = sideBQuotes.filter((q) => !isMarketVenue(q.bookKey));

  for (const a of sideAQuotes) {
    for (const b of sideBQuotes) {
      if (a.bookKey === b.bookKey) continue; // D-06: different books required

      const impliedSum = new Decimal(1)
        .dividedBy(americanToDecimal(a.oddsAmerican))
        .plus(new Decimal(1).dividedBy(americanToDecimal(b.oddsAmerican)));

      const isBetter =
        best === null ||
        impliedSum.lt(best.impliedSum) ||
        (impliedSum.equals(best.impliedSum) &&
          (a.bookKey < best.sideA.bookKey ||
            (a.bookKey === best.sideA.bookKey && b.bookKey < best.sideB.bookKey)));

      if (isBetter) {
        best = { sideA: a, sideB: b, impliedSum, tiedBooksA: [], tiedBooksB: [] };
      }
    }
  }

  if (best === null) return null;

  // D-07 "Multiple books": exact American-odds ties only, any book other
  // than the two chosen books.
  best.tiedBooksA = sideAQuotes
    .filter(
      (q) =>
        q.bookKey !== best!.sideA.bookKey &&
        q.bookKey !== best!.sideB.bookKey &&
        q.oddsAmerican === best!.sideA.oddsAmerican,
    )
    .map((q) => q.bookKey);
  best.tiedBooksB = sideBQuotes
    .filter(
      (q) =>
        q.bookKey !== best!.sideB.bookKey &&
        q.bookKey !== best!.sideA.bookKey &&
        q.oddsAmerican === best!.sideB.oddsAmerican,
    )
    .map((q) => q.bookKey);

  return best;
}

export interface ArbLeg {
  bookKey: string;
  selection: string;
  point: number | null;
  oddsAmerican: number;
  tiedBookKeys: string[];
  /** Whole-contract fill when this leg is a prediction-market buy, else null. */
  market: MarketFill | null;
}

export interface ArbOpportunity {
  rowKey: string; // `${eventId}:${marketType}:${line ?? "ml"}`
  eventId: string;
  sportKey: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  marketType: ArbMarketType;
  line: number | null;
  tieRisk: boolean;
  sideA: ArbLeg;
  sideB: ArbLeg;
  result: ArbResult;
}

export function moneylineToArbMarket(market: TwoWayMoneylineMarket): ArbMarket {
  const toSideQuote = (outcome: "home" | "away"): ArbSideQuote[] =>
    market.quotes
      .filter((q) => q.outcome === outcome)
      .map((q) => ({ bookKey: q.bookKey, oddsAmerican: q.oddsAmerican }));

  return {
    eventId: market.eventId,
    sportKey: market.sportKey,
    commenceTime: market.commenceTime,
    homeTeam: market.homeTeam,
    awayTeam: market.awayTeam,
    marketType: "moneyline",
    line: null,
    tieRisk: market.tieRisk,
    sideA: { selection: market.awayTeam, point: null, quotes: toSideQuote("away") },
    sideB: { selection: market.homeTeam, point: null, quotes: toSideQuote("home") },
  };
}

/** Highest decimal odds among sportsbooks, ties by bookKey. */
function bestBookQuote(quotes: ArbSideQuote[]): ArbSideQuote | null {
  let best: ArbSideQuote | null = null;
  let bestDec: Decimal | null = null;
  for (const q of quotes) {
    if (isMarketVenue(q.bookKey)) continue;
    const dec = americanToDecimal(q.oddsAmerican);
    if (
      best === null ||
      bestDec === null ||
      dec.gt(bestDec) ||
      (dec.equals(bestDec) && q.bookKey < best.bookKey)
    ) {
      best = q;
      bestDec = dec;
    }
  }
  return best;
}

/**
 * Best book-vs-market arb for one row (D-04: exactly one market leg). Each
 * market quote is tried against the best sportsbook quote on the opposite
 * side; ties on guaranteed profit go to the venue key, then side A first.
 */
function bestMarketArb(
  market: ArbMarket,
  base: Omit<ArbOpportunity, "sideA" | "sideB" | "result">,
  opts: { totalStake: Decimal; precision: StakePrecision },
): ArbOpportunity | null {
  let best: ArbOpportunity | null = null;
  let bestRank: { venue: string; side: number } | null = null;

  for (const marketSide of ["A", "B"] as const) {
    const mine = marketSide === "A" ? market.sideA : market.sideB;
    const other = marketSide === "A" ? market.sideB : market.sideA;
    const book = bestBookQuote(other.quotes);
    if (book === null) continue;

    for (const q of mine.quotes) {
      if (!isMarketVenue(q.bookKey)) continue;
      const leg = toMarketLeg(q);
      if (leg === null) continue;
      const solved = solveArbWithMarket({
        totalStake: opts.totalStake,
        bookOddsAmerican: book.oddsAmerican,
        leg,
        precision: opts.precision,
      });
      if (solved === null) continue;

      const rank = { venue: q.bookKey, side: marketSide === "A" ? 0 : 1 };
      const better =
        best === null ||
        bestRank === null ||
        solved.result.guaranteedProfit.gt(best.result.guaranteedProfit) ||
        (solved.result.guaranteedProfit.equals(best.result.guaranteedProfit) &&
          (rank.venue < bestRank.venue ||
            (rank.venue === bestRank.venue && rank.side < bestRank.side)));
      if (!better) continue;

      const r = solved.result;
      // The solver reports the book as A and the market as B; swap when the
      // market sits on side A so stakes/payouts follow the leg order.
      const result: ArbResult =
        marketSide === "B"
          ? r
          : {
              ...r,
              stakeA: r.stakeB,
              stakeB: r.stakeA,
              payoutA: r.payoutB,
              payoutB: r.payoutA,
              netIfAWins: r.netIfBWins,
              netIfBWins: r.netIfAWins,
            };
      const marketLeg: ArbLeg = {
        bookKey: q.bookKey,
        selection: mine.selection,
        point: mine.point,
        oddsAmerican: q.oddsAmerican,
        tiedBookKeys: [],
        market: solved.market,
      };
      const bookLeg: ArbLeg = {
        bookKey: book.bookKey,
        selection: other.selection,
        point: other.point,
        oddsAmerican: book.oddsAmerican,
        tiedBookKeys: [],
        market: null,
      };
      best = {
        ...base,
        sideA: marketSide === "A" ? marketLeg : bookLeg,
        sideB: marketSide === "A" ? bookLeg : marketLeg,
        result,
      };
      bestRank = rank;
    }
  }
  return best;
}

export function rankArbs(
  markets: ArbMarket[],
  opts: { totalStake: Decimal; precision: StakePrecision },
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  for (const market of markets) {
    const rowKey = `${market.eventId}:${market.marketType}:${market.line ?? "ml"}`;
    const base = {
      rowKey,
      eventId: market.eventId,
      sportKey: market.sportKey,
      commenceTime: market.commenceTime,
      homeTeam: market.homeTeam,
      awayTeam: market.awayTeam,
      marketType: market.marketType,
      line: market.line,
      tieRisk: market.tieRisk,
    };

    let candidate: ArbOpportunity | null = null;

    const pair = findBestArbPair(market.sideA.quotes, market.sideB.quotes);
    if (pair !== null && pair.impliedSum.lt(1)) {
      const result = calculateArb({
        totalStake: opts.totalStake,
        oddsAmericanA: pair.sideA.oddsAmerican,
        oddsAmericanB: pair.sideB.oddsAmerican,
        precision: opts.precision,
      });
      if (result !== null) {
        candidate = {
          ...base,
          sideA: {
            bookKey: pair.sideA.bookKey,
            selection: market.sideA.selection,
            point: market.sideA.point,
            oddsAmerican: pair.sideA.oddsAmerican,
            tiedBookKeys: pair.tiedBooksA,
            market: null,
          },
          sideB: {
            bookKey: pair.sideB.bookKey,
            selection: market.sideB.selection,
            point: market.sideB.point,
            oddsAmerican: pair.sideB.oddsAmerican,
            tiedBookKeys: pair.tiedBooksB,
            market: null,
          },
          result,
        };
      }
    }

    // D-02: the market arb replaces the book-book arb only when strictly better.
    const marketCandidate = bestMarketArb(market, base, opts);
    if (
      marketCandidate !== null &&
      (candidate === null ||
        marketCandidate.result.guaranteedProfit.gt(candidate.result.guaranteedProfit))
    ) {
      candidate = marketCandidate;
    }

    if (candidate !== null) opportunities.push(candidate);
  }

  opportunities.sort((a, b) => {
    const returnDiff = b.result.returnPct.comparedTo(a.result.returnPct);
    if (returnDiff !== 0) return returnDiff;

    const timeDiff = a.commenceTime.getTime() - b.commenceTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0;
  });

  return opportunities;
}
