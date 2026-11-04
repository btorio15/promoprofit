import Decimal from "decimal.js";
import { americanToDecimal } from "../hedge/americanOdds";
import type { StakePrecision } from "../hedge/arbMath";
import type { BoostLegInput, PairLegResult } from "../hedge/pairMath";
import {
  clean,
  effectiveBoostedDecimal,
  floorCents,
  kinkStake,
  promoPayoutRaw,
  type WinningsCap,
} from "../hedge/profitBoost";
import { marketCost, toMarketFill, type MarketFill, type MarketLeg } from "./marketLeg";

/**
 * Boost + boost pair with a prediction-market top-up leg (Phase 12, D-10/D-11,
 * MKT-05). The two promos sit on opposite sides; N whole contracts (each pays
 * $1 if its side wins) are added on one side to balance the payouts, priced
 * with the exact venue fee.
 *
 * With top-up on B's side and T = sA + sB + outlay(N):
 *   A wins: PA(sA) - T          B wins: PB(sB) + N - T
 * Profit is nondecreasing in N up to the balance point N0 = PA - PB and
 * nonincreasing beyond, so only N in [floor(N0) - 3, ceil(N0) + 3] is scanned
 * (the margin absorbs the fee's cent rounding). Promo stakes follow the boost
 * stake rule: floored max stake, plus the cap kink floored/ceiled when the
 * winnings cap binds before the max stake.
 *
 * pairMath.ts does not export its leg validation, so the identical checks are
 * replicated locally in prepareBoost (RangeErrors, D-17 minimum odds). All
 * money math is decimal.js.
 */

export interface PairMarketTopUpResult {
  legA: PairLegResult;
  legB: PairLegResult;
  topUpSide: "A" | "B";
  market: MarketFill;
  /** Cash at risk including the market outlay (cost + fee). */
  totalStaked: Decimal;
  netIfAWins: Decimal;
  netIfBWins: Decimal;
  guaranteedProfit: Decimal;
  roiPct: Decimal;
}

const LocalDecimal = Decimal.clone({ precision: 40 });

/** Contracts scanned on each side of the balance point. */
const N_MARGIN = 3;

interface PreparedBoost {
  odds: Decimal;
  base: Decimal | null;
  cap: WinningsCap | null;
  max: Decimal;
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

/** Mirrors pairMath.prepareBoost: validation, min-odds gate, max stake floor. */
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

function capBoundOf(leg: PreparedBoost, stake: Decimal): "max_stake" | "max_winnings" | null {
  if (stake.equals(leg.max)) return "max_stake";
  if (leg.kink !== null && stake.gte(leg.kink)) return "max_winnings";
  return null;
}

interface StakeCandidate {
  stake: Decimal;
  payout: Decimal;
}

function stakeCandidates(leg: PreparedBoost, p: Precision): StakeCandidate[] {
  // The unit stake is also a breakpoint: when the market contract is a better
  // price than the promo, the optimum shrinks that promo leg to the minimum
  // (the book top-up solver seeds p.unit for the same reason).
  const stakes: Decimal[] = [leg.max, p.unit];
  if (leg.kink !== null && leg.kink.lt(leg.max)) {
    const clampStake = (v: Decimal) => Decimal.min(leg.max, Decimal.max(p.unit, v));
    stakes.push(
      clampStake(leg.kink.dividedBy(p.unit).floor().times(p.unit)),
      clampStake(leg.kink.dividedBy(p.unit).ceil().times(p.unit)),
    );
  }
  const unique = stakes.filter((s, i) => stakes.findIndex((o) => o.equals(s)) === i);
  return unique.map((stake) => ({
    stake,
    payout: floorCents(promoPayoutRaw(stake, leg.odds, leg.base, leg.cap)),
  }));
}

/** Pure function of (venue, price, n), so a module-level memo is safe. */
const outlayMemo = new Map<string, Decimal>();

/** Market outlay (cost + fee) for n contracts. */
function outlayOf(leg: MarketLeg, n: number): Decimal {
  const key = `${leg.venueKey}|${leg.priceCents}|${n}`;
  let hit = outlayMemo.get(key);
  if (hit === undefined) {
    hit = marketCost(leg, n).outlay;
    outlayMemo.set(key, hit);
  }
  return hit;
}

/** Stakes searched on each side of a cross-seed, in units. */
const CROSS_WINDOW = 1;
/** Balance gaps (contracts) cross-seeded for the over-paying leg. */
const CROSS_GAPS = 8;

/**
 * Stakes around the largest stake whose cent-floored payout is <= target
 * (payout is nondecreasing in stake, so a binary search over units is exact).
 */
function windowStakes(leg: PreparedBoost, target: Decimal, p: Precision): StakeCandidate[] {
  const payoutAt = (k: number) =>
    floorCents(promoPayoutRaw(p.unit.times(k), leg.odds, leg.base, leg.cap));
  const maxK = leg.max.dividedBy(p.unit).toNumber();
  if (payoutAt(1).gt(target)) return [];
  let lo = 1;
  let hi = maxK;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (payoutAt(mid).lte(target)) lo = mid;
    else hi = mid - 1;
  }
  const out: StakeCandidate[] = [];
  for (let k = Math.max(1, lo - CROSS_WINDOW); k <= Math.min(maxK, lo + CROSS_WINDOW); k += 1) {
    out.push({ stake: p.unit.times(k), payout: payoutAt(k) });
  }
  return out;
}

interface Best {
  profit: Decimal;
  total: Decimal;
  maxOutcome: Decimal;
  side: "A" | "B";
  a: StakeCandidate;
  b: StakeCandidate;
  contracts: number;
  leg: MarketLeg;
  netA: Decimal;
  netB: Decimal;
}

/** Ties: larger max outcome, then smaller T, then side "B" before "A". */
function beats(next: Best, best: Best | null): boolean {
  if (best === null) return true;
  if (!next.profit.equals(best.profit)) return next.profit.gt(best.profit);
  if (!next.maxOutcome.equals(best.maxOutcome)) return next.maxOutcome.gt(best.maxOutcome);
  if (!next.total.equals(best.total)) return next.total.lt(best.total);
  return next.side === "B" && best.side === "A";
}

export function solveBoostBoostPairWithMarketTopUp(i: {
  legA: BoostLegInput;
  legB: BoostLegInput;
  marketOnA: MarketLeg | null;
  marketOnB: MarketLeg | null;
  precision: StakePrecision;
}): PairMarketTopUpResult | null {
  const p = precisionOf(i.precision);
  const legA = prepareBoost(i.legA, p);
  const legB = prepareBoost(i.legB, p);
  if (legA === null || legB === null) return null;

  const candA = stakeCandidates(legA, p);
  const candB = stakeCandidates(legB, p);
  let best: Best | null = null;

  const pairs: Array<[StakeCandidate, StakeCandidate]> = [];
  const seen = new Set<string>();
  const addPair = (a: StakeCandidate, b: StakeCandidate) => {
    const key = `${a.stake.toFixed()}|${b.stake.toFixed()}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  };
  for (const a of candA) for (const b of candB) addPair(a, b);
  // Cross-seeds: the over-paying leg is shrunk so the top-up side keeps a
  // balance gap of at least one contract (N0 >= 1).
  for (const a of candA) {
    for (let g = 1; g <= CROSS_GAPS; g += 1) {
      for (const b of [...windowStakes(legB, a.payout.minus(g), p), ...windowStakes(legB, a.payout.plus(g), p)]) addPair(a, b);
    }
  }
  for (const b of candB) {
    for (let g = 1; g <= CROSS_GAPS; g += 1) {
      for (const a of [...windowStakes(legA, b.payout.minus(g), p), ...windowStakes(legA, b.payout.plus(g), p)]) addPair(a, b);
    }
  }

  for (const [a, b] of pairs) {
    {
      const sides: Array<["A" | "B", MarketLeg | null, Decimal]> = [
        ["B", i.marketOnB, a.payout.minus(b.payout)],
        ["A", i.marketOnA, b.payout.minus(a.payout)],
      ];
      for (const [side, leg, n0] of sides) {
        if (leg === null || n0.lt(1)) continue;
        const available = leg.availableContracts;
        if (available !== null && available < 1) continue;
        let hi = n0.ceil().toNumber() + N_MARGIN;
        let lo = Math.max(1, n0.floor().toNumber() - N_MARGIN);
        if (available !== null) {
          hi = Math.min(hi, available);
          lo = Math.min(lo, hi);
        }
        for (let n = lo; n <= hi; n += 1) {
          const total = a.stake.plus(b.stake).plus(outlayOf(leg, n));
          const netA = a.payout.plus(side === "A" ? n : 0).minus(total);
          const netB = b.payout.plus(side === "B" ? n : 0).minus(total);
          const profit = Decimal.min(netA, netB);
          if (profit.lte(0)) continue;
          const next: Best = {
            profit,
            total,
            maxOutcome: Decimal.max(netA, netB),
            side,
            a,
            b,
            contracts: n,
            leg,
            netA,
            netB,
          };
          if (beats(next, best)) best = next;
        }
      }
    }
  }

  if (best === null) return null;

  return {
    legA: {
      stake: best.a.stake,
      payout: best.a.payout,
      oddsDecimal: legA.odds,
      priceSource: legA.priceSource,
      capBound: capBoundOf(legA, best.a.stake),
    },
    legB: {
      stake: best.b.stake,
      payout: best.b.payout,
      oddsDecimal: legB.odds,
      priceSource: legB.priceSource,
      capBound: capBoundOf(legB, best.b.stake),
    },
    topUpSide: best.side,
    market: toMarketFill(best.leg, best.contracts),
    totalStaked: best.total,
    netIfAWins: best.netA,
    netIfBWins: best.netB,
    guaranteedProfit: best.profit,
    roiPct: best.profit.dividedBy(best.total).times(100).toDecimalPlaces(2, Decimal.ROUND_DOWN),
  };
}
