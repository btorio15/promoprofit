import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import { solveNoSweat, type NoSweatSolution } from "@/domain/hedge/noSweat";
import type {
  ConversionRate,
  ConversionRateFor,
} from "@/domain/hedge/conversionRate";
import {
  enumerateScopeSelections,
  type ResolvedSelection,
  type SelectionQuote,
} from "./selection";
import type { PromoScope } from "./scope";
import type { PromoMarketType, PromoSide } from "./types";
import { bestHedgeQuote } from "./rankPromoHedges";

/**
 * No-sweat candidate search (Phase 8, NSB-03). Standalone module, deliberately
 * NOT a branch inside rankPromoHedges.ts (Phase 9 owns the exhaustive
 * switches). Events and the conversion-rate function are injected, so this
 * module spends 0 Odds API credits and does zero I/O. Results are estimates.
 */

export interface NoSweatPromo {
  id: string | number;
  bookKey: string;
  refundCap: Decimal;
  minOddsAmerican: number | null;
  scope: PromoScope;
}

export interface NoSweatRankOptions {
  moneylineEvents: OddsEvent[];
  extendedEvents: OddsEvent[];
  now: Date;
  hedgeBookKeys: ReadonlySet<string>;
  precision: StakePrecision;
  conversionRateFor: ConversionRateFor;
}

export interface NoSweatOpportunity {
  promoId: string | number;
  selection: ResolvedSelection;
  qualifying: SelectionQuote;
  hedge: SelectionQuote;
  sameBook: boolean;
  tieRisk: boolean;
  conversion: ConversionRate;
  solution: NoSweatSolution;
}

export type NoSweatRankResult =
  | { kind: "ok"; opportunity: NoSweatOpportunity; candidatesEvaluated: number }
  | { kind: "cant_price"; reason: "no_refund_book_odds"; refundBookKey: string }
  | {
      kind: "invalid_promo";
      reason: "bad_refund_cap" | "bad_min_odds";
      promoId: string | number;
    }
  | { kind: "no_qualifying_line"; candidatesEvaluated: number };

const MARKET_ORDER: Record<PromoMarketType, number> = {
  moneyline: 0,
  spread: 1,
  total: 2,
};
const SIDE_ORDER: Record<PromoSide, number> = {
  home: 0,
  away: 1,
  over: 2,
  under: 3,
};

/** Sport limit as a PromoScope (D-06): null = every game; else every future game of that sport. */
export function noSweatScope(sportKey: string | null, now: Date): PromoScope {
  if (sportKey === null) return { kind: "any" };
  return {
    kind: "sport_window",
    sportKey,
    windowStart: now,
    windowEnd: new Date(8.64e15),
  };
}

/**
 * Promo-level validation, run once before any pricing. A malformed promo row
 * (e.g. a manual entry with a $0 cap or -50 min odds) would otherwise throw a
 * RangeError from the conversion-rate function or the min-odds filter and take
 * down the whole ranking; instead it gets a typed result.
 */
function validatePromo(
  promo: NoSweatPromo,
): "bad_refund_cap" | "bad_min_odds" | null {
  if (promo.refundCap.lte(0) || promo.refundCap.decimalPlaces() > 2) {
    return "bad_refund_cap";
  }
  if (promo.minOddsAmerican !== null) {
    try {
      americanToDecimal(promo.minOddsAmerican);
    } catch (err) {
      if (err instanceof RangeError) return "bad_min_odds";
      throw err;
    }
  }
  return null;
}

function meetsMinOdds(
  quote: SelectionQuote,
  minOddsAmerican: number | null,
): boolean {
  if (minOddsAmerican === null) return true;
  return americanToDecimal(quote.oddsAmerican).gte(
    americanToDecimal(minOddsAmerican),
  );
}

interface Candidate {
  selection: ResolvedSelection;
  qualifying: SelectionQuote;
  hedge: SelectionQuote;
  solution: NoSweatSolution;
}

function isBetterNoSweat(a: Candidate, b: Candidate | null): boolean {
  if (!b) return true;

  const profitDiff = a.solution.estimatedProfit.comparedTo(
    b.solution.estimatedProfit,
  );
  if (profitDiff !== 0) return profitDiff > 0;

  const worstDiff = a.solution.worstCaseProfit.comparedTo(
    b.solution.worstCaseProfit,
  );
  if (worstDiff !== 0) return worstDiff > 0;

  const timeDiff =
    a.selection.commenceTime.getTime() - b.selection.commenceTime.getTime();
  if (timeDiff !== 0) return timeDiff < 0;

  if (a.selection.eventId !== b.selection.eventId)
    return a.selection.eventId < b.selection.eventId;

  const marketDiff =
    MARKET_ORDER[a.selection.marketType] - MARKET_ORDER[b.selection.marketType];
  if (marketDiff !== 0) return marketDiff < 0;

  const aLine = a.selection.line ?? 0;
  const bLine = b.selection.line ?? 0;
  if (aLine !== bLine) return aLine < bLine;

  return SIDE_ORDER[a.selection.side] - SIDE_ORDER[b.selection.side] < 0;
}

export function rankNoSweat(
  promo: NoSweatPromo,
  opts: NoSweatRankOptions,
): NoSweatRankResult {
  const invalid = validatePromo(promo);
  if (invalid) {
    return { kind: "invalid_promo", reason: invalid, promoId: promo.id };
  }

  const stake = promo.refundCap; // D-09
  const refundAmount = Decimal.min(stake, promo.refundCap);

  const conversion = opts.conversionRateFor(promo.bookKey, refundAmount);
  if (!conversion) {
    return {
      kind: "cant_price",
      reason: "no_refund_book_odds",
      refundBookKey: promo.bookKey,
    }; // D-04
  }

  const selections = enumerateScopeSelections(
    { moneyline: opts.moneylineEvents, extended: opts.extendedEvents },
    promo.scope,
    {
      now: opts.now,
      eligibleMarketTypes: ["moneyline", "spread", "total"],
      altSpreadBookKey: promo.bookKey,
    },
  );

  let best: Candidate | null = null;
  let candidatesEvaluated = 0;

  for (const selection of selections) {
    const qualifying = selection.promoSideQuotes.find(
      (q) => q.bookKey === promo.bookKey,
    );
    if (!qualifying) continue;
    if (!meetsMinOdds(qualifying, promo.minOddsAmerican)) continue;
    const hedge = bestHedgeQuote(
      selection.oppositeSideQuotes,
      opts.hedgeBookKeys,
    );
    if (!hedge) continue;

    let solution: NoSweatSolution;
    try {
      solution = solveNoSweat({
        stake,
        refundCap: promo.refundCap,
        refundValue: conversion.profit,
        qualifyingOddsAmerican: qualifying.oddsAmerican,
        hedgeOddsAmerican: hedge.oddsAmerican,
        precision: opts.precision,
      });
    } catch (err) {
      if (err instanceof RangeError) {
        console.warn(
          `rankNoSweat: promo ${promo.id} candidate raised RangeError: ${err.message}`,
        );
        continue;
      }
      throw err;
    }

    candidatesEvaluated++;
    const candidate: Candidate = { selection, qualifying, hedge, solution };
    if (isBetterNoSweat(candidate, best)) best = candidate;
  }

  if (!best) return { kind: "no_qualifying_line", candidatesEvaluated };

  return {
    kind: "ok",
    candidatesEvaluated,
    opportunity: {
      promoId: promo.id,
      selection: best.selection,
      qualifying: best.qualifying,
      hedge: best.hedge,
      sameBook: best.hedge.bookKey === promo.bookKey,
      tieRisk: best.selection.tieRisk,
      conversion,
      solution: best.solution,
    },
  };
}
