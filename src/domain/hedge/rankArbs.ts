import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateArb, type ArbResult, type StakePrecision } from "./arbMath";
import type { TwoWayMoneylineMarket } from "./marketFilter";

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

export function rankArbs(
  markets: ArbMarket[],
  opts: { totalStake: Decimal; precision: StakePrecision },
): ArbOpportunity[] {
  const opportunities: ArbOpportunity[] = [];

  for (const market of markets) {
    const pair = findBestArbPair(market.sideA.quotes, market.sideB.quotes);
    if (pair === null) continue;
    if (!pair.impliedSum.lt(1)) continue;

    const result = calculateArb({
      totalStake: opts.totalStake,
      oddsAmericanA: pair.sideA.oddsAmerican,
      oddsAmericanB: pair.sideB.oddsAmerican,
      precision: opts.precision,
    });
    if (result === null) continue; // rounding erased the arb

    const rowKey = `${market.eventId}:${market.marketType}:${market.line ?? "ml"}`;

    opportunities.push({
      rowKey,
      eventId: market.eventId,
      sportKey: market.sportKey,
      commenceTime: market.commenceTime,
      homeTeam: market.homeTeam,
      awayTeam: market.awayTeam,
      marketType: market.marketType,
      line: market.line,
      tieRisk: market.tieRisk,
      sideA: {
        bookKey: pair.sideA.bookKey,
        selection: market.sideA.selection,
        point: market.sideA.point,
        oddsAmerican: pair.sideA.oddsAmerican,
        tiedBookKeys: pair.tiedBooksA,
      },
      sideB: {
        bookKey: pair.sideB.bookKey,
        selection: market.sideB.selection,
        point: market.sideB.point,
        oddsAmerican: pair.sideB.oddsAmerican,
        tiedBookKeys: pair.tiedBooksB,
      },
      result,
    });
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
