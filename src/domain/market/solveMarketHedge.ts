import Decimal from "decimal.js";
import { americanToDecimal } from "../hedge/americanOdds";
import {
  clean,
  effectiveBoostedDecimal,
  floorCents,
  kinkStake,
  promoPayoutRaw,
  type ProfitBoostInput,
  type ProfitBoostResult,
  type WinningsCap,
} from "../hedge/profitBoost";
import type { BonusBetHedgeResult } from "../hedge/bonusBet";
import { marketCost, toMarketFill, type MarketFill, type MarketLeg } from "./marketLeg";

export type { MarketFill } from "./marketLeg";

/**
 * Whole-contract market-hedge solvers (D-10, D-11, MKT-05). A market leg pays
 * $1 per contract and costs price + a nonlinear exact fee, so the shown
 * profit is always computed from the rounded contract buy plus fee, never
 * from a continuous stake. All money is decimal.js (CLAUDE.md).
 */

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

function toInt(value: Decimal): number {
  return parseInt(value.toFixed(0), 10);
}

export interface MarketPayoutSolution {
  fill: MarketFill;
  netIfBookWins: Decimal;
  netIfMarketWins: Decimal;
  guaranteedProfit: Decimal;
}

/**
 * Given what the book returns if its bet wins (bookWinsGross, cent-floored)
 * and the cash staked at the book (bookCashOutlay, 0 for a bonus bet), pick
 * the whole number of contracts that maximizes worst-case profit.
 *
 *   netIfBookWins(N)   = G - S - outlay(N)
 *   netIfMarketWins(N) = N - S - outlay(N)
 *
 * min(G, N) - S - outlay(N): the outlay is nondecreasing in N and N - outlay
 * is nondecreasing too (each extra contract nets 100 - p cents against a
 * fee step of at most one cent), so profit rises up to N = G and only falls
 * beyond it. A window of a few contracts either side of G is therefore exact
 * (the oracle proves it); the window also absorbs fee-rounding steps.
 * Ties: larger best-case, then fewer contracts.
 */
export function solveMarketHedgeForPayout(i: {
  bookWinsGross: Decimal;
  bookCashOutlay: Decimal;
  leg: MarketLeg;
}): MarketPayoutSolution | null {
  const gross = new LocalDecimal(i.bookWinsGross);
  const cash = new LocalDecimal(i.bookCashOutlay);
  if (gross.lte(0)) return null;

  let lo = Math.max(1, toInt(gross.floor()) - 3);
  let hi = toInt(gross.ceil()) + 3;
  if (i.leg.availableContracts !== null) {
    hi = Math.min(hi, i.leg.availableContracts);
  }
  if (hi < 1) return null;
  lo = Math.min(lo, hi);

  let best: {
    n: number;
    min: Decimal;
    max: Decimal;
    netBook: Decimal;
    netMarket: Decimal;
  } | null = null;

  for (let n = lo; n <= hi; n++) {
    const { outlay } = marketCost(i.leg, n);
    const netBook = gross.minus(cash).minus(outlay);
    const netMarket = new LocalDecimal(n).minus(cash).minus(outlay);
    const min = Decimal.min(netBook, netMarket);
    const max = Decimal.max(netBook, netMarket);
    const isBetter =
      best === null ||
      min.gt(best.min) ||
      (min.equals(best.min) && max.gt(best.max)) ||
      (min.equals(best.min) && max.equals(best.max) && n < best.n);
    if (isBetter) best = { n, min, max, netBook, netMarket };
  }

  if (best === null || best.n < 1 || best.min.lte(0)) return null;
  return {
    fill: toMarketFill(i.leg, best.n),
    netIfBookWins: best.netBook,
    netIfMarketWins: best.netMarket,
    guaranteedProfit: best.min,
  };
}

export function solveBonusBetMarketHedge(i: {
  bonusAmount: Decimal;
  bonusOddsAmerican: number;
  leg: MarketLeg;
}): (BonusBetHedgeResult & { market: MarketFill }) | null {
  const bonusAmount = new LocalDecimal(i.bonusAmount);
  if (bonusAmount.lte(0)) {
    throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
  }
  if (bonusAmount.decimalPlaces() > 2) {
    throw new RangeError(
      `bonusAmount must have at most 2 decimal places, got ${bonusAmount.toString()}`,
    );
  }

  const bonusDecimalOdds = new LocalDecimal(americanToDecimal(i.bonusOddsAmerican));
  // Stake not returned for a bonus bet; books pay whole cents (floor).
  const bonusPayout = clean(bonusAmount.times(bonusDecimalOdds.minus(1))).toDecimalPlaces(
    2,
    Decimal.ROUND_DOWN,
  );

  const solved = solveMarketHedgeForPayout({
    bookWinsGross: bonusPayout,
    bookCashOutlay: new LocalDecimal(0),
    leg: i.leg,
  });
  if (solved === null) return null;

  const conversionPct = solved.guaranteedProfit
    .dividedBy(bonusAmount)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    hedgeStake: solved.fill.outlay,
    bonusPayout,
    hedgePayout: new LocalDecimal(solved.fill.contracts),
    netIfBonusWins: solved.netIfBookWins,
    netIfHedgeWins: solved.netIfMarketWins,
    guaranteedProfit: solved.guaranteedProfit,
    conversionPct,
    market: solved.fill,
  };
}

export function solveProfitBoostMarketHedge(
  i: Omit<ProfitBoostInput, "hedgeOddsAmerican"> & { leg: MarketLeg },
): (ProfitBoostResult & { market: MarketFill }) | null {
  const maxStake = new LocalDecimal(i.maxStake);
  if (maxStake.lte(0)) {
    throw new RangeError(`maxStake must be greater than 0, got ${maxStake.toString()}`);
  }
  if (maxStake.decimalPlaces() > 2) {
    throw new RangeError(
      `maxStake must have at most 2 decimal places, got ${maxStake.toString()}`,
    );
  }

  const { decimal: boostedDecimalOdds, source: priceSource } = effectiveBoostedDecimal(i);

  const baseDecimalOdds =
    i.baseOddsAmerican !== null ? new LocalDecimal(americanToDecimal(i.baseOddsAmerican)) : null;

  let winningsCap: WinningsCap | null = null;
  if (i.winningsCap) {
    const capAmount = new LocalDecimal(i.winningsCap.amount);
    if (capAmount.lte(0)) {
      throw new RangeError(
        `winningsCap.amount must be greater than 0, got ${capAmount.toString()}`,
      );
    }
    if (i.winningsCap.kind === "boost_extra" && baseDecimalOdds === null) {
      throw new RangeError('winningsCap.kind "boost_extra" requires baseOddsAmerican');
    }
    winningsCap = { kind: i.winningsCap.kind, amount: capAmount };
  }

  // D-17: eligibility gate on the boosted price, before any stake search.
  if (i.minOddsAmerican !== null) {
    const minDecimalOdds = new LocalDecimal(americanToDecimal(i.minOddsAmerican));
    if (boostedDecimalOdds.lt(minDecimalOdds)) return null;
  }

  const dp = i.precision === "whole" ? 0 : 2;
  const unit = dp === 0 ? new LocalDecimal(1) : new LocalDecimal("0.01");
  const flooredMaxStake = maxStake.toDecimalPlaces(dp, Decimal.ROUND_DOWN);

  // Key Decision: the promo stake defaults to the max allowed by the caps.
  let capBound: "max_stake" | "max_winnings" = "max_stake";
  const stakeCandidates: Decimal[] = [flooredMaxStake];
  if (winningsCap) {
    const sStar = clean(kinkStake(boostedDecimalOdds, baseDecimalOdds, winningsCap));
    if (sStar.lt(flooredMaxStake)) {
      capBound = "max_winnings";
      const clamp = (v: Decimal): Decimal =>
        v.lt(unit) ? unit : v.gt(flooredMaxStake) ? flooredMaxStake : v;
      stakeCandidates.push(
        clamp(sStar.toDecimalPlaces(dp, Decimal.ROUND_DOWN)),
        clamp(sStar.toDecimalPlaces(dp, Decimal.ROUND_UP)),
      );
    }
  }
  const uniqueStakes = stakeCandidates
    .filter((s, idx) => stakeCandidates.findIndex((o) => o.equals(s)) === idx)
    .filter((s) => s.gt(0));

  let best: {
    promoStake: Decimal;
    promoPayout: Decimal;
    solved: MarketPayoutSolution;
    totalStaked: Decimal;
  } | null = null;

  for (const promoStake of uniqueStakes) {
    const promoPayout = floorCents(
      promoPayoutRaw(promoStake, boostedDecimalOdds, baseDecimalOdds, winningsCap),
    );
    const solved = solveMarketHedgeForPayout({
      bookWinsGross: promoPayout,
      bookCashOutlay: promoStake,
      leg: i.leg,
    });
    if (solved === null) continue;
    const totalStaked = promoStake.plus(solved.fill.outlay);
    const isBetter =
      best === null ||
      solved.guaranteedProfit.gt(best.solved.guaranteedProfit) ||
      (solved.guaranteedProfit.equals(best.solved.guaranteedProfit) &&
        totalStaked.lt(best.totalStaked));
    if (isBetter) best = { promoStake, promoPayout, solved, totalStaked };
  }

  if (best === null) return null;

  const roiPct = best.solved.guaranteedProfit
    .dividedBy(best.totalStaked)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    boostedDecimalOdds,
    priceSource,
    promoStake: best.promoStake,
    hedgeStake: best.solved.fill.outlay,
    totalStaked: best.totalStaked,
    promoPayout: best.promoPayout,
    hedgePayout: new LocalDecimal(best.solved.fill.contracts),
    netIfPromoWins: best.solved.netIfBookWins,
    netIfHedgeWins: best.solved.netIfMarketWins,
    guaranteedProfit: best.solved.guaranteedProfit,
    roiPct,
    capBound,
    market: best.solved.fill,
  };
}
