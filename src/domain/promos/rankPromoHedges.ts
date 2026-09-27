import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import {
  calculateProfitBoostHedge,
  calculateProfitBoostHedgeUnfiltered,
  decimalToAmericanDisplay,
  type ProfitBoostResult,
} from "@/domain/hedge/profitBoost";
import { calculateBonusBetHedge, type BonusBetHedgeResult } from "@/domain/hedge/bonusBet";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import { enumerateScopeSelections, resolveSelection, type ResolvedSelection, type SelectionQuote } from "./selection";
import { eventInScope, type PromoScope } from "./scope";
import type { PromoMarketType, PromoSelection, PromoSide, PromoType, WinningsCapKind } from "./types";

/**
 * Per-promo best-candidate search and ranking (D-02..D-05, D-16, D-17, D-18,
 * CALC-05; 03-RECON.md Design Implications 1 and 3). Pure, zero-I/O: the
 * caller supplies the cached events, the member's hedge books, "now", and
 * stake precision. For each promo this evaluates either its single pinned
 * selection or every candidate inside its scope (selection.ts), keeps the
 * most profitable one at the member's allowed hedge books, and returns one
 * opportunity per promo sorted by guaranteed profit.
 */

export interface RankablePromo {
  id: number;
  bookKey: string;
  promoType: PromoType;
  scope: PromoScope;
  pinned: PromoSelection | null;
  eligibleMarketTypes: readonly PromoMarketType[];
  boostPercent: string | null;
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  bonusAmount: string | null;
  maxStake: string | null;
  winningsCap: { kind: WinningsCapKind; amount: string } | null;
  minOddsAmerican: number | null;
}

export interface PromoOpportunity<P extends RankablePromo = RankablePromo> {
  promo: P;
  selection: ResolvedSelection;
  promoOddsAmerican: number;
  promoOddsDerived: boolean;
  hedge: SelectionQuote;
  sameBook: boolean;
  candidatesEvaluated: number;
  result: { kind: "boost"; boost: ProfitBoostResult } | { kind: "bonus"; bonus: BonusBetHedgeResult };
}

export interface RankOptions {
  moneylineEvents: OddsEvent[];
  extendedEvents: OddsEvent[];
  hedgeBookKeys: ReadonlySet<string>;
  precision: StakePrecision;
  now: Date;
}

interface EvaluatedCandidate {
  selection: ResolvedSelection;
  promoOddsAmerican: number;
  promoOddsDerived: boolean;
  hedge: SelectionQuote;
  sameBook: boolean;
  result: { kind: "boost"; boost: ProfitBoostResult } | { kind: "bonus"; bonus: BonusBetHedgeResult };
}

const MARKET_ORDER: Record<PromoMarketType, number> = { moneyline: 0, spread: 1, total: 2 };
const SIDE_ORDER: Record<PromoSide, number> = { home: 0, away: 1, over: 2, under: 3 };

/** Highest-decimal-odds quote among hedgeBookKeys; ties broken alphabetically by bookKey (copied from rankBonusBetHedges.ts's bestHedgeQuote). */
function bestHedgeQuote(quotes: SelectionQuote[], hedgeBookKeys: ReadonlySet<string>): SelectionQuote | null {
  const candidates = quotes.filter((q) => hedgeBookKeys.has(q.bookKey));
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDecimal = americanToDecimal(best.oddsAmerican);

  for (const candidate of candidates.slice(1)) {
    const candidateDecimal = americanToDecimal(candidate.oddsAmerican);
    if (candidateDecimal.gt(bestDecimal) || (candidateDecimal.equals(bestDecimal) && candidate.bookKey < best.bookKey)) {
      best = candidate;
      bestDecimal = candidateDecimal;
    }
  }

  return best;
}

function getPinnedCandidates(
  promo: RankablePromo,
  moneylineEvents: OddsEvent[],
  extendedEvents: OddsEvent[],
): ResolvedSelection[] {
  const pinned = promo.pinned;
  if (!pinned) return [];

  const descriptor = extendedEvents.find((e) => e.id === pinned.eventId) ?? moneylineEvents.find((e) => e.id === pinned.eventId);
  if (!descriptor) return [];

  if (
    !eventInScope(
      { id: descriptor.id, sport_key: descriptor.sport_key, commence_time: descriptor.commence_time },
      promo.scope,
    )
  ) {
    return [];
  }

  const sourceEvents =
    pinned.marketType === "moneyline"
      ? moneylineEvents.some((e) => e.id === pinned.eventId)
        ? moneylineEvents
        : extendedEvents
      : extendedEvents;

  const resolved = resolveSelection(sourceEvents, pinned);
  return resolved ? [resolved] : [];
}

/**
 * D-17: books apply the minimum-odds rule to the bet's own (base) odds,
 * before the boost. WR-06: the base price is the live promo-book quote, or
 * -- for a pinned promo with no live quote -- the published base price the
 * solver itself falls back on, so the rule is never skipped for a price the
 * solver actually uses.
 */
function passesBaseMinOdds(
  promo: RankablePromo,
  promoBookQuote: SelectionQuote | null,
): boolean {
  if (promo.minOddsAmerican === null) return true;
  const baseOddsAmerican = promoBookQuote?.oddsAmerican ?? (promo.pinned !== null ? promo.baseOddsAmerican : null);
  if (baseOddsAmerican === null) return true;
  return americanToDecimal(baseOddsAmerican).gte(americanToDecimal(promo.minOddsAmerican));
}

function evaluateBoostCandidate(
  promo: RankablePromo,
  selection: ResolvedSelection,
  promoBookQuote: SelectionQuote | null,
  hedge: SelectionQuote,
  sameBook: boolean,
  opts: RankOptions,
  allowNonPositive: boolean,
): EvaluatedCandidate | null {
  if (promo.maxStake === null) return null; // D-18, defensive re-check

  const isPinned = promo.pinned !== null;

  // D-02/D-03: an unpinned candidate with no live quote from the promo's own
  // book has no base price to boost and no published price to fall back on.
  if (!isPinned && !promoBookQuote) return null;

  const baseOddsAmerican = promoBookQuote?.oddsAmerican ?? (isPinned ? promo.baseOddsAmerican : null);
  // D-03: a published boosted price is only honored for a pinned candidate.
  const boostedOddsAmerican = isPinned ? promo.boostedOddsAmerican : null;
  const boostPercent = promo.boostPercent !== null ? new Decimal(promo.boostPercent) : null;
  const winningsCap = promo.winningsCap
    ? { kind: promo.winningsCap.kind, amount: new Decimal(promo.winningsCap.amount) }
    : null;

  let result: ProfitBoostResult | null;
  try {
    const solve = allowNonPositive ? calculateProfitBoostHedgeUnfiltered : calculateProfitBoostHedge;
    result = solve({
      boostedOddsAmerican,
      baseOddsAmerican,
      boostPercent,
      hedgeOddsAmerican: hedge.oddsAmerican,
      maxStake: new Decimal(promo.maxStake),
      winningsCap,
      minOddsAmerican: promo.minOddsAmerican,
      precision: opts.precision,
    });
  } catch (err) {
    if (err instanceof RangeError) {
      console.warn(`rankPromoHedges: promo ${promo.id} candidate raised RangeError: ${err.message}`);
      return null;
    }
    throw err;
  }

  if (!result) return null;

  const promoOddsAmerican = boostedOddsAmerican ?? decimalToAmericanDisplay(result.boostedDecimalOdds);
  const promoOddsDerived = result.priceSource === "derived";

  return {
    selection,
    promoOddsAmerican,
    promoOddsDerived,
    hedge,
    sameBook,
    result: { kind: "boost", boost: result },
  };
}

function evaluateBonusCandidate(
  promo: RankablePromo,
  selection: ResolvedSelection,
  promoBookQuote: SelectionQuote | null,
  hedge: SelectionQuote,
  sameBook: boolean,
  opts: RankOptions,
  allowNonPositive: boolean,
): EvaluatedCandidate | null {
  if (!promoBookQuote || promo.bonusAmount === null) return null;

  const bonus = calculateBonusBetHedge({
    bonusAmount: new Decimal(promo.bonusAmount),
    bonusOddsAmerican: promoBookQuote.oddsAmerican,
    hedgeOddsAmerican: hedge.oddsAmerican,
    precision: opts.precision,
  });

  if (!allowNonPositive && bonus.guaranteedProfit.lte(0)) return null;

  return {
    selection,
    promoOddsAmerican: promoBookQuote.oddsAmerican,
    promoOddsDerived: false,
    hedge,
    sameBook,
    result: { kind: "bonus", bonus },
  };
}

function evaluateCandidate(
  promo: RankablePromo,
  selection: ResolvedSelection,
  opts: RankOptions,
  allowNonPositive: boolean = false,
): EvaluatedCandidate | null {
  const promoBookQuote = selection.promoSideQuotes.find((q) => q.bookKey === promo.bookKey) ?? null;

  if (!passesBaseMinOdds(promo, promoBookQuote)) return null;

  const hedge = bestHedgeQuote(selection.oppositeSideQuotes, opts.hedgeBookKeys);
  if (!hedge) return null;

  const sameBook = hedge.bookKey === promo.bookKey;

  return promo.promoType === "profit_boost"
    ? evaluateBoostCandidate(promo, selection, promoBookQuote, hedge, sameBook, opts, allowNonPositive)
    : evaluateBonusCandidate(promo, selection, promoBookQuote, hedge, sameBook, opts, allowNonPositive);
}

function guaranteedProfitOf(candidate: EvaluatedCandidate): Decimal {
  return candidate.result.kind === "boost" ? candidate.result.boost.guaranteedProfit : candidate.result.bonus.guaranteedProfit;
}

/** ROI-like secondary tie-break rank: roiPct for boosts, conversionPct for bonus bets. */
function secondaryRankOf(candidate: EvaluatedCandidate): Decimal {
  return candidate.result.kind === "boost" ? candidate.result.boost.roiPct : candidate.result.bonus.conversionPct;
}

/** Deterministic best-candidate tie-break: guaranteedProfit desc, roiPct/conversionPct desc, commence asc, eventId, market, line asc, side. */
function isBetterCandidate(a: EvaluatedCandidate, b: EvaluatedCandidate | null): boolean {
  if (!b) return true;

  const profitDiff = guaranteedProfitOf(a).comparedTo(guaranteedProfitOf(b));
  if (profitDiff !== 0) return profitDiff > 0;

  const secondaryDiff = secondaryRankOf(a).comparedTo(secondaryRankOf(b));
  if (secondaryDiff !== 0) return secondaryDiff > 0;

  const timeDiff = a.selection.commenceTime.getTime() - b.selection.commenceTime.getTime();
  if (timeDiff !== 0) return timeDiff < 0;

  if (a.selection.eventId !== b.selection.eventId) return a.selection.eventId < b.selection.eventId;

  const marketDiff = MARKET_ORDER[a.selection.marketType] - MARKET_ORDER[b.selection.marketType];
  if (marketDiff !== 0) return marketDiff < 0;

  const aLine = a.selection.line ?? 0;
  const bLine = b.selection.line ?? 0;
  if (aLine !== bLine) return aLine < bLine;

  return SIDE_ORDER[a.selection.side] - SIDE_ORDER[b.selection.side] < 0;
}

/** Candidate selections for a promo: its single pinned selection, or every 2-way selection inside its scope. */
function candidatesFor(promo: RankablePromo, opts: RankOptions): ResolvedSelection[] {
  return promo.pinned
    ? getPinnedCandidates(promo, opts.moneylineEvents, opts.extendedEvents)
    : enumerateScopeSelections(
        { moneyline: opts.moneylineEvents, extended: opts.extendedEvents },
        promo.scope,
        { now: opts.now, eligibleMarketTypes: promo.eligibleMarketTypes },
      );
}

function evaluatePromo<P extends RankablePromo>(promo: P, opts: RankOptions): PromoOpportunity<P> | null {
  if (promo.promoType === "profit_boost" && promo.maxStake === null) return null; // D-18

  const candidates = candidatesFor(promo, opts);

  let best: EvaluatedCandidate | null = null;
  let candidatesEvaluated = 0;

  for (const selection of candidates) {
    const evaluated = evaluateCandidate(promo, selection, opts, false);
    if (!evaluated) continue;
    candidatesEvaluated++;
    if (isBetterCandidate(evaluated, best)) best = evaluated;
  }

  if (!best) return null;

  return {
    promo,
    selection: best.selection,
    promoOddsAmerican: best.promoOddsAmerican,
    promoOddsDerived: best.promoOddsDerived,
    hedge: best.hedge,
    sameBook: best.sameBook,
    candidatesEvaluated,
    result: best.result,
  };
}

function guaranteedProfitOfOpportunity(opp: PromoOpportunity): Decimal {
  return opp.result.kind === "boost" ? opp.result.boost.guaranteedProfit : opp.result.bonus.guaranteedProfit;
}

/**
 * Per promo, evaluates every eligible candidate (its pinned selection, or
 * every 2-way selection inside its scope) at the member's hedge books,
 * keeps the most profitable, and returns one opportunity per promo sorted
 * by guaranteed profit desc, then commence asc, then promo id asc.
 */
export function rankPromoHedges<P extends RankablePromo>(promos: P[], opts: RankOptions): PromoOpportunity<P>[] {
  const opportunities: PromoOpportunity<P>[] = [];

  for (const promo of promos) {
    const opportunity = evaluatePromo(promo, opts);
    if (opportunity) opportunities.push(opportunity);
  }

  opportunities.sort((a, b) => {
    const profitDiff = guaranteedProfitOfOpportunity(b).comparedTo(guaranteedProfitOfOpportunity(a));
    if (profitDiff !== 0) return profitDiff;

    const timeDiff = a.selection.commenceTime.getTime() - b.selection.commenceTime.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.promo.id - b.promo.id;
  });

  return opportunities;
}

export interface UnprofitablePromo<P extends RankablePromo = RankablePromo> {
  promo: P;
  bestGuaranteedProfit: Decimal | null;
  candidatesEvaluated: number;
}

/**
 * quick-260927-edt: purely informational companion to rankPromoHedges.
 * For every active promo that rankPromoHedges excludes (its best hedge is
 * not strictly profitable, or nothing could be evaluated at all), reports
 * the single best (maximum) guaranteed profit found across every candidate
 * -- including zero/negative ones -- or null when no candidate could be
 * evaluated. Callers must never derive stakes or hedge instructions from
 * this: "opportunity" continues to mean strictly-profitable only, and
 * rankPromoHedges' own output is completely unaffected by this function.
 */
export function findUnprofitablePromos<P extends RankablePromo>(
  promos: P[],
  opts: RankOptions,
): UnprofitablePromo<P>[] {
  const profitableIds = new Set(rankPromoHedges(promos, opts).map((opp) => opp.promo.id));

  const results: UnprofitablePromo<P>[] = [];

  for (const promo of promos) {
    if (profitableIds.has(promo.id)) continue;

    if (promo.promoType === "profit_boost" && promo.maxStake === null) {
      // D-18: never evaluated by evaluatePromo either -- nothing to solve.
      results.push({ promo, bestGuaranteedProfit: null, candidatesEvaluated: 0 });
      continue;
    }

    const candidates = candidatesFor(promo, opts);

    let bestGuaranteedProfit: Decimal | null = null;
    let candidatesEvaluated = 0;

    for (const selection of candidates) {
      const evaluated = evaluateCandidate(promo, selection, opts, true);
      if (!evaluated) continue;
      candidatesEvaluated++;

      const profit = guaranteedProfitOf(evaluated);
      if (bestGuaranteedProfit === null || profit.comparedTo(bestGuaranteedProfit) > 0) {
        bestGuaranteedProfit = profit;
      }
    }

    results.push({ promo, bestGuaranteedProfit, candidatesEvaluated });
  }

  results.sort((a, b) => {
    if (a.bestGuaranteedProfit === null && b.bestGuaranteedProfit === null) {
      return a.promo.id - b.promo.id;
    }
    if (a.bestGuaranteedProfit === null) return 1;
    if (b.bestGuaranteedProfit === null) return -1;

    const profitDiff = b.bestGuaranteedProfit.comparedTo(a.bestGuaranteedProfit);
    if (profitDiff !== 0) return profitDiff;

    return a.promo.id - b.promo.id;
  });

  return results;
}
