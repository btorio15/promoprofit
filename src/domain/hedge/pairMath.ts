import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";
import {
  clean,
  effectiveBoostedDecimal,
  floorCents,
  kinkStake,
  promoPayoutRaw,
  type WinningsCap,
} from "./profitBoost";

/**
 * Two-promo pair solver (CALC-07): boost + boost and boost + bonus bet on
 * opposite outcomes of the same market at two different books. Bonus + bonus
 * is intentionally not supported (D-09).
 *
 * Math (04-RESEARCH Pattern 1): each boost leg's return R(s) is piecewise
 * linear in the stake s (max-stake limit plus an optional winnings-cap kink),
 * so guaranteed profit is concave and its maximum sits at a breakpoint: a
 * leg's max stake, a leg's cap kink, or the stake on the other leg that
 * balances the two payouts (the inverse of R). The solver therefore
 * enumerates breakpoint seeds, cross-seeds the other leg through the inverse
 * payout, and evaluates a small +/- window of stakes around every seed with
 * cent-floored payouts (cent flooring is what makes the exact optimum land a
 * few units off the real-valued breakpoint). The search is bounded: a fixed
 * seed set times a fixed window, never a grid scan.
 *
 * All arithmetic is decimal.js (CLAUDE.md: no native number math on money).
 */

export interface BoostLegInput {
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  boostPercent: Decimal | null;
  maxStake: Decimal;
  winningsCap: WinningsCap | null;
  minOddsAmerican: number | null;
}

export interface BonusLegInput {
  bonusAmount: Decimal;
  /** The book's plain quote on that side. */
  oddsAmerican: number;
}

export interface PairLegResult {
  stake: Decimal;
  payout: Decimal;
  oddsDecimal: Decimal;
  priceSource: "published" | "derived" | "quote";
  capBound: "max_stake" | "max_winnings" | null;
}

export interface PairResult {
  legA: PairLegResult;
  legB: PairLegResult;
  /** Cash at risk only: a bonus bet costs $0. */
  totalStaked: Decimal;
  netIfAWins: Decimal;
  netIfBWins: Decimal;
  guaranteedProfit: Decimal;
  roiPct: Decimal;
}

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

function dedupe(values: Decimal[]): Decimal[] {
  return values.filter(
    (value, index) => values.findIndex((other) => other.equals(value)) === index,
  );
}

function clamp(value: Decimal, min: Decimal, max: Decimal): Decimal {
  if (value.lt(min)) return min;
  if (value.gt(max)) return max;
  return value;
}

/** Stakes searched on each side of every seed, in units ($1 whole, $0.01 cents). */
const WINDOW_UNITS = 4;

interface PreparedBoost {
  odds: Decimal;
  base: Decimal | null;
  cap: WinningsCap | null;
  /** Max stake floored to the precision unit. */
  max: Decimal;
  /** Stake where the winnings cap starts to bind, when a cap exists. */
  kink: Decimal | null;
  priceSource: "published" | "derived";
}

interface Precision {
  dp: number;
  unit: Decimal;
}

function precisionOf(precision: StakePrecision): Precision {
  return precision === "whole"
    ? { dp: 0, unit: new LocalDecimal(1) }
    : { dp: 2, unit: new LocalDecimal("0.01") };
}

/**
 * Validates a boost leg (RangeError, mirroring calculateProfitBoostHedge)
 * and resolves its effective price. Returns null when the leg is ineligible:
 * boosted price below its minimum odds, or no whole stake unit fits under its
 * max stake.
 */
function prepareBoost(input: BoostLegInput, p: Precision): PreparedBoost | null {
  const maxStake = new LocalDecimal(input.maxStake);
  if (maxStake.lte(0)) {
    throw new RangeError(`maxStake must be greater than 0, got ${maxStake.toString()}`);
  }
  if (maxStake.decimalPlaces() > 2) {
    throw new RangeError(`maxStake must have at most 2 decimal places, got ${maxStake.toString()}`);
  }

  const { decimal: odds, source } = effectiveBoostedDecimal(input);
  const base =
    input.baseOddsAmerican !== null
      ? new LocalDecimal(americanToDecimal(input.baseOddsAmerican))
      : null;

  let cap: WinningsCap | null = null;
  if (input.winningsCap) {
    const amount = new LocalDecimal(input.winningsCap.amount);
    if (amount.lte(0)) {
      throw new RangeError(`winningsCap.amount must be greater than 0, got ${amount.toString()}`);
    }
    if (input.winningsCap.kind === "boost_extra") {
      if (base === null) {
        throw new RangeError('winningsCap.kind "boost_extra" requires baseOddsAmerican');
      }
      if (odds.lte(base)) {
        throw new RangeError('winningsCap.kind "boost_extra" requires boosted odds above the base odds');
      }
    }
    cap = { kind: input.winningsCap.kind, amount };
  }

  if (input.minOddsAmerican !== null) {
    const minDecimal = new LocalDecimal(americanToDecimal(input.minOddsAmerican));
    if (odds.lt(minDecimal)) return null;
  }

  const max = maxStake.toDecimalPlaces(p.dp, Decimal.ROUND_DOWN);
  if (max.lt(p.unit)) return null;

  const kink = cap ? clean(kinkStake(odds, base, cap)) : null;
  return { odds, base, cap, max, kink, priceSource: source };
}

function rawPayout(leg: PreparedBoost, stake: Decimal): Decimal {
  return promoPayoutRaw(stake, leg.odds, leg.base, leg.cap);
}

/** Smallest real stake whose raw payout is T, or null when the cap makes T unreachable. */
function inversePayout(leg: PreparedBoost, target: Decimal): Decimal | null {
  const s0 = clean(target.dividedBy(leg.odds));
  if (!leg.cap || leg.kink === null || s0.lte(leg.kink)) return s0;

  if (leg.cap.kind === "net_winnings") return clean(target.minus(leg.cap.amount));
  if (leg.cap.kind === "boost_extra") {
    return clean(target.minus(leg.cap.amount).dividedBy(leg.base as Decimal));
  }
  return null; // total_payout: the leg can never pay more than the cap
}

/** Breakpoint stakes for one boost leg: its max stake and (when it binds earlier) its cap kink. */
function stakeSeeds(leg: PreparedBoost): Decimal[] {
  const seeds = [leg.max];
  if (leg.kink !== null && leg.kink.lt(leg.max)) seeds.push(leg.kink);
  return seeds;
}

function windowAround(center: Decimal, p: Precision, min: Decimal, max: Decimal): Decimal[] {
  const anchor = clamp(center.toDecimalPlaces(p.dp, Decimal.ROUND_DOWN), min, max);
  const stakes: Decimal[] = [];
  for (let i = -WINDOW_UNITS; i <= WINDOW_UNITS; i += 1) {
    stakes.push(clamp(anchor.plus(p.unit.times(i)), min, max));
  }
  return dedupe(stakes);
}

function capBoundOf(leg: PreparedBoost, stake: Decimal): "max_stake" | "max_winnings" | null {
  if (stake.equals(leg.max)) return "max_stake";
  if (leg.kink !== null && stake.gte(leg.kink)) return "max_winnings";
  return null;
}

function roiOf(profit: Decimal, cash: Decimal): Decimal {
  // D-24: profit / cash staked (a bonus leg costs $0), 2dp ROUND_DOWN.
  return profit.dividedBy(cash).times(100).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

function memoPayout(leg: PreparedBoost): (stake: Decimal) => Decimal {
  const cache = new Map<string, Decimal>();
  return (stake) => {
    const key = stake.toFixed();
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = floorCents(rawPayout(leg, stake));
      cache.set(key, hit);
    }
    return hit;
  };
}

/** Best-first ordering: higher profit, then lower cash staked, then lower leg A stake. */
function beats(
  profit: Decimal,
  total: Decimal,
  stakeA: Decimal,
  best: { profit: Decimal; total: Decimal; stakeA: Decimal } | null,
): boolean {
  if (best === null) return true;
  if (profit.gt(best.profit)) return true;
  if (!profit.equals(best.profit)) return false;
  if (total.lt(best.total)) return true;
  if (!total.equals(best.total)) return false;
  return stakeA.lt(best.stakeA);
}

/**
 * Unfiltered boost + boost solver: the best pair found even when its
 * guaranteed profit is zero or negative (informational only, like
 * calculateProfitBoostHedgeUnfiltered). Null only when a leg fails the
 * minimum-odds gate or cannot fit a single stake unit.
 */
export function solveBoostBoostPairUnfiltered(
  a: BoostLegInput,
  b: BoostLegInput,
  precision: StakePrecision,
): PairResult | null {
  const p = precisionOf(precision);
  const legA = prepareBoost(a, p);
  const legB = prepareBoost(b, p);
  if (legA === null || legB === null) return null;

  // Seeds are (stake A, stake B) pairs.
  const seeds: Array<[Decimal, Decimal]> = [[legA.max, legB.max]];
  for (const sa of stakeSeeds(legA)) {
    const sb = inversePayout(legB, rawPayout(legA, sa));
    if (sb !== null) seeds.push([sa, sb]);
  }
  for (const sb of stakeSeeds(legB)) {
    const sa = inversePayout(legA, rawPayout(legB, sb));
    if (sa !== null) seeds.push([sa, sb]);
  }

  const payoutA = memoPayout(legA);
  const payoutB = memoPayout(legB);

  let best: {
    profit: Decimal;
    total: Decimal;
    stakeA: Decimal;
    stakeB: Decimal;
    pa: Decimal;
    pb: Decimal;
  } | null = null;

  for (const [seedA, seedB] of seeds) {
    const windowA = windowAround(seedA, p, p.unit, legA.max);
    const windowB = windowAround(seedB, p, p.unit, legB.max);
    for (const sa of windowA) {
      const pa = payoutA(sa);
      for (const sb of windowB) {
        const pb = payoutB(sb);
        const total = sa.plus(sb);
        const profit = Decimal.min(pa.minus(total), pb.minus(total));
        if (beats(profit, total, sa, best)) {
          best = { profit, total, stakeA: sa, stakeB: sb, pa, pb };
        }
      }
    }
  }

  if (best === null) return null;

  return {
    legA: {
      stake: best.stakeA,
      payout: best.pa,
      oddsDecimal: legA.odds,
      priceSource: legA.priceSource,
      capBound: capBoundOf(legA, best.stakeA),
    },
    legB: {
      stake: best.stakeB,
      payout: best.pb,
      oddsDecimal: legB.odds,
      priceSource: legB.priceSource,
      capBound: capBoundOf(legB, best.stakeB),
    },
    totalStaked: best.total,
    netIfAWins: best.pa.minus(best.total),
    netIfBWins: best.pb.minus(best.total),
    guaranteedProfit: best.profit,
    roiPct: roiOf(best.profit, best.total),
  };
}

/**
 * Boost + boost pair, shown only when it guarantees a profit. A pair of
 * boosts is only ever profitable when the boosted implied probabilities sum
 * to less than 1 (an arb at boosted prices); any cap only lowers payouts, so
 * that is also a valid up-front prune.
 */
export function solveBoostBoostPair(
  a: BoostLegInput,
  b: BoostLegInput,
  precision: StakePrecision,
): PairResult | null {
  const p = precisionOf(precision);
  const legA = prepareBoost(a, p);
  const legB = prepareBoost(b, p);
  if (legA === null || legB === null) return null;

  const one = new LocalDecimal(1);
  if (clean(one.dividedBy(legA.odds).plus(one.dividedBy(legB.odds))).gte(1)) return null;

  const result = solveBoostBoostPairUnfiltered(a, b, precision);
  if (result === null || result.guaranteedProfit.lte(0)) return null;
  return result;
}

/**
 * Unfiltered boost + bonus bet solver. Leg A is the boost, leg B the bonus
 * bet. The bonus bet is stake-not-returned: it pays W = floor_cents(B *
 * (O - 1)) if it wins and costs $0 if it loses, so
 *   boost side wins: R(s) - s      bonus side wins: W - s
 * and only the boost stake s varies (1-D search).
 */
export function solveBoostBonusPairUnfiltered(
  boost: BoostLegInput,
  bonus: BonusLegInput,
  precision: StakePrecision,
): PairResult | null {
  const p = precisionOf(precision);
  const bonusAmount = new LocalDecimal(bonus.bonusAmount);
  if (bonusAmount.lte(0)) {
    throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
  }

  const leg = prepareBoost(boost, p);
  if (leg === null) return null;

  const bonusOdds = new LocalDecimal(americanToDecimal(bonus.oddsAmerican));
  const w = floorCents(bonusAmount.times(bonusOdds.minus(1)));

  // Balance point (R(s) = W): uncapped W/O, or the inverse through the cap.
  const seeds: Decimal[] = [...stakeSeeds(leg), clean(w.dividedBy(leg.odds))];
  const balanced = inversePayout(leg, w);
  if (balanced !== null) seeds.push(balanced);

  const payout = memoPayout(leg);
  const stakes = dedupe(seeds.flatMap((seed) => windowAround(seed, p, p.unit, leg.max)));

  let best: { profit: Decimal; stake: Decimal; payout: Decimal } | null = null;
  for (const stake of stakes) {
    const boostPayout = payout(stake);
    const profit = Decimal.min(boostPayout.minus(stake), w.minus(stake));
    // Cash at risk is the boost stake alone, so the tie-break "lower total"
    // and "lower leg A stake" coincide: prefer the smallest stake.
    if (beats(profit, stake, stake, best === null ? null : { profit: best.profit, total: best.stake, stakeA: best.stake })) {
      best = { profit, stake, payout: boostPayout };
    }
  }

  if (best === null) return null;

  return {
    legA: {
      stake: best.stake,
      payout: best.payout,
      oddsDecimal: leg.odds,
      priceSource: leg.priceSource,
      capBound: capBoundOf(leg, best.stake),
    },
    legB: {
      stake: bonusAmount,
      payout: w,
      oddsDecimal: bonusOdds,
      priceSource: "quote",
      capBound: null,
    },
    totalStaked: best.stake,
    netIfAWins: best.payout.minus(best.stake),
    netIfBWins: w.minus(best.stake),
    guaranteedProfit: best.profit,
    roiPct: roiOf(best.profit, best.stake),
  };
}

/** Boost + bonus bet pair, shown only when it guarantees a profit. */
export function solveBoostBonusPair(
  boost: BoostLegInput,
  bonus: BonusLegInput,
  precision: StakePrecision,
): PairResult | null {
  const result = solveBoostBonusPairUnfiltered(boost, bonus, precision);
  if (result === null || result.guaranteedProfit.lte(0)) return null;
  return result;
}
