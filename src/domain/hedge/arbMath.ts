import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";

/**
 * Two-leg arbitrage stake-split + rounding solver (D-01, D-02, D-04, D-05).
 * Self-contained: mirrors bonusBet.ts's candidate-and-maximize discipline,
 * generalized from one rounded leg to two independently-rounded legs.
 */
export type StakePrecision = "whole" | "cents";

export interface ArbInput {
  totalStake: Decimal;
  oddsAmericanA: number;
  oddsAmericanB: number;
  precision: StakePrecision;
}

export interface ArbResult {
  impliedSum: Decimal; // 1/Da + 1/Db, < 1 for a true arb
  stakeA: Decimal;
  stakeB: Decimal;
  totalLaid: Decimal; // stakeA + stakeB <= totalStake
  payoutA: Decimal; // floored to cents
  payoutB: Decimal; // floored to cents
  netIfAWins: Decimal; // payoutA - totalLaid
  netIfBWins: Decimal; // payoutB - totalLaid
  guaranteedProfit: Decimal; // min(netIfAWins, netIfBWins), > 0
  returnPct: Decimal; // guaranteedProfit / totalLaid * 100, 2dp ROUND_DOWN
}

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

// American odds like -300 (1 + 1/3) or -275 (1 + 4/11) have no exact base-10
// representation, so every division/multiplication through them carries an
// unavoidable truncation of a few units in the ~38th-40th decimal place
// (see americanOdds.ts). A value that is mathematically cent-exact (e.g.
// 217.5) can come out as 217.50000000000000000054 or 219.99999999999999999996
// as a result. Snapping to 20 decimal places with normal rounding erases
// that noise — it is many orders of magnitude below a cent — while leaving
// genuine sub-cent content (e.g. 109.63414634146341463415, which needs a
// real floor/ceiling decision) untouched.
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}

interface Candidate {
  stakeA: Decimal;
  stakeB: Decimal;
  totalLaid: Decimal;
  payoutA: Decimal;
  payoutB: Decimal;
  netIfAWins: Decimal;
  netIfBWins: Decimal;
  guaranteedProfit: Decimal;
}

export function calculateArb(input: ArbInput): ArbResult | null {
  const totalStake = new LocalDecimal(input.totalStake);

  if (totalStake.lte(0)) {
    throw new RangeError(`totalStake must be greater than 0, got ${totalStake.toString()}`);
  }
  if (totalStake.decimalPlaces() > 2) {
    throw new RangeError(
      `totalStake must have at most 2 decimal places, got ${totalStake.toString()}`,
    );
  }

  const oddsA = new LocalDecimal(americanToDecimal(input.oddsAmericanA));
  const oddsB = new LocalDecimal(americanToDecimal(input.oddsAmericanB));

  const pA = new LocalDecimal(1).dividedBy(oddsA);
  const pB = new LocalDecimal(1).dividedBy(oddsB);
  const rawImpliedSum = pA.plus(pB);
  const impliedSum = clean(rawImpliedSum);

  // No epsilon and no minimum-return threshold (D-04, D-05): a true arb is
  // strictly below 1, an exact break-even (== 1) is not shown.
  if (!impliedSum.lt(1)) {
    return null;
  }

  // D-01: the entered total is a CAP, not a target. The best whole-dollar
  // (or whole-cent) allocation frequently lays noticeably less than the cap,
  // because a smaller pair can land much closer to the balanced ratio
  // (e.g. -150/+200 at $10: the $10 split has no positive pair, but 5/3
  // lays $8 and guarantees $0.33). So this is an exact search over every
  // total-laid value L (in precision units) from the cap downward:
  //
  // * For a fixed L, f(a) = floor_c(a * Da) is strictly increasing in a and
  //   g(a) = floor_c((L - a) * Db) is strictly decreasing (each unit step
  //   moves a payout by more than one cent because Da, Db > 1). So
  //   min(f, g) is maximized at the discrete crossing, which provably lies
  //   within two units of the continuous balance point a* = L * pA / sum
  //   (one unit of a moves f - g by unit * (Da + Db) > 2 cents, more than
  //   the two cent-floors can absorb). Checking a* +/- 2 units plus the
  //   legal endpoints (both legs >= one unit) is therefore exhaustive for L.
  // * Across L the profit is not monotone, but it is bounded above by the
  //   unrounded balanced profit L / sum - L. Once that bound drops below
  //   the best profit found so far (or below one cent when nothing positive
  //   has been found — profit is always a whole number of cents), no
  //   smaller L can win or tie, so the scan stops.
  //
  // The comparator is order-independent (more profit, then less laid, then
  // smaller stakeA), so the result equals an exhaustive search over every
  // (stakeA, stakeB) with stakeA + stakeB <= totalStake.
  const dp = input.precision === "whole" ? 0 : 2;
  const unit = dp === 0 ? new LocalDecimal(1) : new LocalDecimal("0.01");
  const twoUnits = unit.times(2);
  const oneCent = new LocalDecimal("0.01");

  // Held in an object so TypeScript does not narrow it across the closure.
  const search: { best: Candidate | null } = { best: null };

  const consider = (stakeA: Decimal, stakeB: Decimal): void => {
    if (stakeA.lte(0) || stakeB.lte(0)) return;

    const totalLaid = stakeA.plus(stakeB);
    // Never lay more than the user actually put in (D-01).
    if (totalLaid.gt(totalStake)) return;

    // Books pay whole cents; flooring is the conservative assumption.
    const payoutA = clean(stakeA.times(oddsA)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const payoutB = clean(stakeB.times(oddsB)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const netIfAWins = payoutA.minus(totalLaid);
    const netIfBWins = payoutB.minus(totalLaid);
    const guaranteedProfit = Decimal.min(netIfAWins, netIfBWins);

    const best = search.best;
    const isBetter =
      best === null ||
      guaranteedProfit.gt(best.guaranteedProfit) ||
      (guaranteedProfit.equals(best.guaranteedProfit) && totalLaid.lt(best.totalLaid)) ||
      (guaranteedProfit.equals(best.guaranteedProfit) &&
        totalLaid.equals(best.totalLaid) &&
        stakeA.lt(best.stakeA));

    if (isBetter) {
      search.best = {
        stakeA,
        stakeB,
        totalLaid,
        payoutA,
        payoutB,
        netIfAWins,
        netIfBWins,
        guaranteedProfit,
      };
    }
  };

  for (
    let laid = totalStake.toDecimalPlaces(dp, Decimal.ROUND_DOWN);
    laid.gte(twoUnits);
    laid = laid.minus(unit)
  ) {
    const current = search.best;
    const threshold =
      current !== null && current.guaranteedProfit.gt(oneCent) ? current.guaranteedProfit : oneCent;
    // Uses the 40-digit sum, not the 20dp display value: rounding the sum
    // can nudge an exactly-tight bound (e.g. $0.04) just under the threshold.
    const upperBound = clean(laid.dividedBy(rawImpliedSum).minus(laid));
    if (upperBound.lt(threshold)) break;

    const maxA = laid.minus(unit);
    const aStar = clean(laid.times(pA).dividedBy(rawImpliedSum));
    const lo = Decimal.max(aStar.toDecimalPlaces(dp, Decimal.ROUND_DOWN).minus(twoUnits), unit);
    const hi = Decimal.min(aStar.toDecimalPlaces(dp, Decimal.ROUND_UP).plus(twoUnits), maxA);

    for (let stakeA = lo; stakeA.lte(hi); stakeA = stakeA.plus(unit)) {
      consider(stakeA, laid.minus(stakeA));
    }
    // Endpoints cover a crossing that falls outside the legal range
    // (e.g. a longshot leg whose balanced stake is below one unit).
    consider(unit, laid.minus(unit));
    consider(maxA, unit);
  }

  const chosen = search.best;

  // No surviving candidate, or rounding erased the arb entirely: never
  // display a "guaranteed profit" that rounding turned into a loss or $0.
  if (chosen === null || chosen.guaranteedProfit.lte(0)) {
    return null;
  }

  const returnPct = chosen.guaranteedProfit
    .dividedBy(chosen.totalLaid)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    impliedSum,
    stakeA: chosen.stakeA,
    stakeB: chosen.stakeB,
    totalLaid: chosen.totalLaid,
    payoutA: chosen.payoutA,
    payoutB: chosen.payoutB,
    netIfAWins: chosen.netIfAWins,
    netIfBWins: chosen.netIfBWins,
    guaranteedProfit: chosen.guaranteedProfit,
    returnPct,
  };
}
