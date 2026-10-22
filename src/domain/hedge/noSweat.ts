import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";
import { clean, floorCents } from "./profitBoost";

/**
 * No-sweat (refund-as-bonus-bet) single-line solver. Self-contained: no shared
 * generic hedge function (mirrors bonusBet.ts).
 *
 * Results are ESTIMATES because the refund value is an estimate (D-01): if the
 * qualifying bet loses, the book pays a bonus bet worth `refundValue` dollars
 * in expectation. The worst case assumes that refund is worth $0 (D-02).
 *
 * Pushes/voids on the qualifying leg pay no refund and are not modelled; the
 * enumeration only offers half-point lines and 2-way moneylines, and tieRisk
 * is carried by the ranker.
 */
export interface NoSweatInput {
  stake: Decimal;
  refundCap: Decimal;
  /** Dollar value of the refund bonus bet, computed by the caller at min(stake, refundCap). */
  refundValue: Decimal;
  qualifyingOddsAmerican: number;
  hedgeOddsAmerican: number;
  precision?: StakePrecision;
}

export interface NoSweatSolution {
  estimated: true;
  qualifyingStake: Decimal;
  qualifyingOddsAmerican: number;
  /** Net winnings if the qualifying cash bet wins (stake returned separately). */
  qualifyingWinnings: Decimal;
  refundAmount: Decimal;
  refundValue: Decimal;
  hedgeStake: Decimal;
  hedgeOddsAmerican: number;
  /** Total return of the hedge incl. stake, floored to the cent. */
  hedgePayout: Decimal;
  profitIfWin: Decimal;
  profitIfLose: Decimal;
  estimatedProfit: Decimal;
  worstCaseProfit: Decimal;
}

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

function assertMoney(name: string, value: Decimal, allowZero: boolean): void {
  if (allowZero ? value.lt(0) : value.lte(0)) {
    throw new RangeError(
      `${name} must be ${allowZero ? "at least 0" : "greater than 0"}, got ${value.toString()}`,
    );
  }
  if (value.decimalPlaces() > 2) {
    throw new RangeError(
      `${name} must have at most 2 decimal places, got ${value.toString()}`,
    );
  }
}

export function solveNoSweat(input: NoSweatInput): NoSweatSolution {
  const S = new LocalDecimal(input.stake);
  const cap = new LocalDecimal(input.refundCap);
  const V = new LocalDecimal(input.refundValue);

  assertMoney("stake", S, false);
  assertMoney("refundCap", cap, false);
  assertMoney("refundValue", V, true);

  const refundAmount = LocalDecimal.min(S, cap);
  // A bonus bet's cash value can never exceed its face amount, so a value
  // above min(stake, refundCap) means the caller valued the wrong refund
  // (e.g. at the full stake instead of the cap) and would overstate the
  // lose-side profit and the hedge stake.
  if (V.gt(refundAmount)) {
    throw new RangeError(
      `refundValue ${V.toString()} cannot exceed refundAmount ${refundAmount.toString()} (min of stake and refundCap)`,
    );
  }
  const Oa = new LocalDecimal(americanToDecimal(input.qualifyingOddsAmerican));
  const Oh = new LocalDecimal(americanToDecimal(input.hedgeOddsAmerican));

  const qualifyingWinnings = floorCents(S.times(Oa.minus(1)));
  const hedgePayoutOf = (H: Decimal): Decimal => floorCents(H.times(Oh));
  const winNet = (H: Decimal): Decimal => qualifyingWinnings.minus(H);
  const loseNet = (H: Decimal, v: Decimal): Decimal =>
    hedgePayoutOf(H).minus(H).minus(S).plus(v);

  // Exact equal-outcome stake at the estimated refund value.
  const exact = clean(S.times(Oa).minus(V).dividedBy(Oh));

  const dp = input.precision === "whole" ? 0 : 2;
  const unit = new LocalDecimal(dp === 0 ? 1 : "0.01");

  const bases = [
    exact.toDecimalPlaces(dp, Decimal.ROUND_DOWN),
    exact.toDecimalPlaces(dp, Decimal.ROUND_UP),
  ];
  const raw: Decimal[] = [unit];
  for (const base of bases) {
    for (const k of [-2, -1, 0, 1, 2]) raw.push(base.plus(unit.times(k)));
  }
  const candidates = raw.filter(
    (c, i) => c.gt(0) && raw.findIndex((o) => o.equals(c)) === i,
  );

  let best: { H: Decimal; score: Decimal } | null = null;
  for (const H of candidates) {
    const score = Decimal.min(winNet(H), loseNet(H, V));
    if (
      best === null ||
      score.gt(best.score) ||
      (score.equals(best.score) && H.lt(best.H))
    ) {
      best = { H, score };
    }
  }
  const H = (best as { H: Decimal; score: Decimal }).H;

  const profitIfWin = winNet(H);
  const profitIfLose = loseNet(H, V);

  return {
    estimated: true,
    qualifyingStake: S,
    qualifyingOddsAmerican: input.qualifyingOddsAmerican,
    qualifyingWinnings,
    refundAmount,
    refundValue: V,
    hedgeStake: H,
    hedgeOddsAmerican: input.hedgeOddsAmerican,
    hedgePayout: hedgePayoutOf(H),
    profitIfWin,
    profitIfLose,
    estimatedProfit: Decimal.min(profitIfWin, profitIfLose),
    worstCaseProfit: Decimal.min(profitIfWin, loseNet(H, new LocalDecimal(0))),
  };
}
