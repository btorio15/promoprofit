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

function roundingCandidates(exact: Decimal, dp: number): Decimal[] {
  const down = exact.toDecimalPlaces(dp, Decimal.ROUND_DOWN);
  const up = exact.toDecimalPlaces(dp, Decimal.ROUND_UP);
  return down.equals(up) ? [down] : [down, up];
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
  const impliedSum = clean(pA.plus(pB));

  // No epsilon and no minimum-return threshold (D-04, D-05): a true arb is
  // strictly below 1, an exact break-even (== 1) is not shown.
  if (!impliedSum.lt(1)) {
    return null;
  }

  const stakeAExact = clean(totalStake.times(pA).dividedBy(impliedSum));
  const stakeBExact = clean(totalStake.minus(stakeAExact));

  const dp = input.precision === "whole" ? 0 : 2;
  const stakeACandidates = roundingCandidates(stakeAExact, dp);
  const stakeBCandidates = roundingCandidates(stakeBExact, dp);

  let best: Candidate | null = null;

  for (const stakeA of stakeACandidates) {
    for (const stakeB of stakeBCandidates) {
      if (stakeA.lte(0) || stakeB.lte(0)) continue;

      const totalLaid = stakeA.plus(stakeB);
      // The entered total stake is a cap, not just a target (D-01) — never
      // lay more than the user actually put in, even if independently
      // rounding each leg up would otherwise look attractive.
      if (totalLaid.gt(totalStake)) continue;

      // Books pay whole cents; flooring is the conservative assumption.
      const payoutA = clean(stakeA.times(oddsA)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const payoutB = clean(stakeB.times(oddsB)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const netIfAWins = payoutA.minus(totalLaid);
      const netIfBWins = payoutB.minus(totalLaid);
      const guaranteedProfit = Decimal.min(netIfAWins, netIfBWins);

      const isBetter =
        best === null ||
        guaranteedProfit.gt(best.guaranteedProfit) ||
        (guaranteedProfit.equals(best.guaranteedProfit) && totalLaid.lt(best.totalLaid)) ||
        (guaranteedProfit.equals(best.guaranteedProfit) &&
          totalLaid.equals(best.totalLaid) &&
          stakeA.lt(best.stakeA));

      if (isBetter) {
        best = {
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
    }
  }

  // No surviving candidate, or rounding erased the arb entirely: never
  // display a "guaranteed profit" that rounding turned into a loss or $0.
  if (best === null || best.guaranteedProfit.lte(0)) {
    return null;
  }

  const returnPct = best.guaranteedProfit
    .dividedBy(best.totalLaid)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    impliedSum,
    stakeA: best.stakeA,
    stakeB: best.stakeB,
    totalLaid: best.totalLaid,
    payoutA: best.payoutA,
    payoutB: best.payoutB,
    netIfAWins: best.netIfAWins,
    netIfBWins: best.netIfBWins,
    guaranteedProfit: best.guaranteedProfit,
    returnPct,
  };
}
