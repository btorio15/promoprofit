import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";

/**
 * Bonus-bet (stake-not-returned) hedge solver. Self-contained: no shared
 * "generic hedge" function with future promo types (profit boosts have
 * their own module, src/domain/hedge/profitBoost.ts — see 03-RESEARCH.md
 * Pitfall 3).
 *
 * `precision` (D-05) is optional and defaults to "cents": the Promos tab
 * (Phase 3) can request whole-dollar bonus-bet hedges to follow the same
 * stake-precision setting profit boosts use, while every existing caller
 * (the bonus-bet finder, `rankBonusBetHedges.ts`) that omits it keeps its
 * byte-for-byte cent-precision behavior unchanged.
 */
export interface BonusBetHedgeInput {
  bonusAmount: Decimal;
  bonusOddsAmerican: number;
  hedgeOddsAmerican: number;
  precision?: StakePrecision;
}

export interface BonusBetHedgeResult {
  hedgeStake: Decimal;
  bonusPayout: Decimal;
  hedgePayout: Decimal;
  netIfBonusWins: Decimal;
  netIfHedgeWins: Decimal;
  guaranteedProfit: Decimal;
  conversionPct: Decimal;
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
  hedgeStake: Decimal;
  hedgePayout: Decimal;
  netIfBonusWins: Decimal;
  netIfHedgeWins: Decimal;
  guaranteedProfit: Decimal;
}

export function calculateBonusBetHedge(input: BonusBetHedgeInput): BonusBetHedgeResult {
  const bonusAmount = new LocalDecimal(input.bonusAmount);

  if (bonusAmount.lte(0)) {
    throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
  }
  if (bonusAmount.decimalPlaces() > 2) {
    throw new RangeError(
      `bonusAmount must have at most 2 decimal places, got ${bonusAmount.toString()}`,
    );
  }

  const bonusDecimalOdds = new LocalDecimal(americanToDecimal(input.bonusOddsAmerican));
  const hedgeDecimalOdds = new LocalDecimal(americanToDecimal(input.hedgeOddsAmerican));

  // Books pay whole cents; flooring is the conservative assumption everywhere.
  const bonusPayout = clean(bonusAmount.times(bonusDecimalOdds.minus(1))).toDecimalPlaces(
    2,
    Decimal.ROUND_DOWN,
  );

  // Exact, unrounded hedge stake: H = B * (Ob - 1) / Oh
  const hedgeStakeExact = clean(
    bonusAmount.times(bonusDecimalOdds.minus(1)).dividedBy(hedgeDecimalOdds),
  );

  // D-05: precision defaults to "cents" so every existing caller that
  // omits it is unaffected. The Promos tab can pass "whole" to round the
  // hedge stake to the nearest dollar unit instead.
  const dp = input.precision === "whole" ? 0 : 2;

  const roundedCandidates = [
    hedgeStakeExact.toDecimalPlaces(dp, Decimal.ROUND_DOWN),
    hedgeStakeExact.toDecimalPlaces(dp, Decimal.ROUND_UP),
  ];
  // Dedupe: the two roundings are equal whenever H is already cent-exact.
  const candidateStakes = roundedCandidates.filter(
    (stake, index) => roundedCandidates.findIndex((other) => other.equals(stake)) === index,
  );

  let best: Candidate | null = null;
  for (const hedgeStake of candidateStakes) {
    const hedgePayout = clean(hedgeStake.times(hedgeDecimalOdds)).toDecimalPlaces(
      2,
      Decimal.ROUND_DOWN,
    );
    const netIfBonusWins = bonusPayout.minus(hedgeStake);
    const netIfHedgeWins = hedgePayout.minus(hedgeStake);
    const guaranteedProfit = Decimal.min(netIfBonusWins, netIfHedgeWins);

    const isBetter =
      best === null ||
      guaranteedProfit.gt(best.guaranteedProfit) ||
      (guaranteedProfit.equals(best.guaranteedProfit) && hedgeStake.lt(best.hedgeStake));

    if (isBetter) {
      best = { hedgeStake, hedgePayout, netIfBonusWins, netIfHedgeWins, guaranteedProfit };
    }
  }

  // candidateStakes always has at least one entry, so best is always set here.
  const chosen = best as Candidate;

  const conversionPct = chosen.guaranteedProfit
    .dividedBy(bonusAmount)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    hedgeStake: chosen.hedgeStake,
    bonusPayout,
    hedgePayout: chosen.hedgePayout,
    netIfBonusWins: chosen.netIfBonusWins,
    netIfHedgeWins: chosen.netIfHedgeWins,
    guaranteedProfit: chosen.guaranteedProfit,
    conversionPct,
  };
}
