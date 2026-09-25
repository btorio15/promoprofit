import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";

/**
 * Bonus-bet (stake-not-returned) hedge solver. Self-contained: no shared
 * "generic hedge" function with future promo types (profit boosts get
 * their own module in a later phase — see project PITFALLS.md Pitfall 2).
 */
export interface BonusBetHedgeInput {
  bonusAmount: Decimal;
  bonusOddsAmerican: number;
  hedgeOddsAmerican: number;
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
  const bonusPayout = bonusAmount
    .times(bonusDecimalOdds.minus(1))
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  // Exact, unrounded hedge stake: H = B * (Ob - 1) / Oh
  const hedgeStakeExact = bonusAmount.times(bonusDecimalOdds.minus(1)).dividedBy(hedgeDecimalOdds);

  const roundedCandidates = [
    hedgeStakeExact.toDecimalPlaces(2, Decimal.ROUND_DOWN),
    hedgeStakeExact.toDecimalPlaces(2, Decimal.ROUND_UP),
  ];
  // Dedupe: the two roundings are equal whenever H is already cent-exact.
  const candidateStakes = roundedCandidates.filter(
    (stake, index) => roundedCandidates.findIndex((other) => other.equals(stake)) === index,
  );

  let best: Candidate | null = null;
  for (const hedgeStake of candidateStakes) {
    const hedgePayout = hedgeStake.times(hedgeDecimalOdds).toDecimalPlaces(2, Decimal.ROUND_DOWN);
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
