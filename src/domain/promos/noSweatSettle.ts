import Decimal from "decimal.js";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import { floorCents } from "@/domain/hedge/noSweat";
import type { BonusBetOpportunity } from "@/domain/hedge/rankBonusBetHedges";
import type {
  NoSweatCorrection,
  RefundConversion,
  TrackedNoSweatSnapshot,
} from "./noSweatSnapshot";

/**
 * Phase 9 (D-04, D-05, A-09): cent-exact settle math for a tracked no-sweat.
 * Works from the Track snapshot or the member's corrected stakes/odds. All
 * money in and out is a 2dp string; arithmetic is Decimal only.
 */

const D = Decimal.clone({ precision: 40 });

export const PUSH_OR_VOID_PROFIT = "0.00";
const OVERRIDE_RE = /^-?\d+\.\d{2}$/;
const MAX_ABS_OVERRIDE = new D("10000.00");

export interface EffectiveBets {
  qualifyingStake: Decimal;
  qualifyingOddsAmerican: number;
  hedgeStake: Decimal;
  hedgeOddsAmerican: number;
}

export function effectiveBets(
  snapshot: TrackedNoSweatSnapshot,
  correction: NoSweatCorrection | null,
): EffectiveBets {
  if (correction) {
    return {
      qualifyingStake: new D(correction.qualifyingStake),
      qualifyingOddsAmerican: correction.qualifyingOddsAmerican,
      hedgeStake: new D(correction.hedgeStake),
      hedgeOddsAmerican: correction.hedgeOddsAmerican,
    };
  }
  return {
    qualifyingStake: new D(snapshot.qualifying.stake),
    qualifyingOddsAmerican: snapshot.qualifying.oddsAmerican,
    hedgeStake: new D(snapshot.hedge.stake),
    hedgeOddsAmerican: snapshot.hedge.oddsAmerican,
  };
}

/** Refund = min(actual qualifying stake, promo cap) (A-09). */
export function refundAmountFor(
  snapshot: TrackedNoSweatSnapshot,
  correction: NoSweatCorrection | null,
): string {
  const { qualifyingStake } = effectiveBets(snapshot, correction);
  return D.min(qualifyingStake, new D(snapshot.promo.refundCap)).toFixed(2);
}

/** Qualifying bet wins: winnings minus the hedge stake. */
export function wonProfit(
  snapshot: TrackedNoSweatSnapshot,
  correction: NoSweatCorrection | null,
): string {
  if (!correction) return snapshot.estimate.profitIfWin;
  const b = effectiveBets(snapshot, correction);
  const winnings = floorCents(b.qualifyingStake.times(americanToDecimal(b.qualifyingOddsAmerican).minus(1)));
  return new D(winnings).minus(b.hedgeStake).toFixed(2);
}

/** Qualifying bet loses: hedge pays, stake is lost, refund converts to `refundProfit`. */
export function lostTotal(
  snapshot: TrackedNoSweatSnapshot,
  correction: NoSweatCorrection | null,
  refundProfit: string,
): string {
  const b = effectiveBets(snapshot, correction);
  const hedgePayout = floorCents(b.hedgeStake.times(americanToDecimal(b.hedgeOddsAmerican)));
  return new D(hedgePayout)
    .minus(b.hedgeStake)
    .minus(b.qualifyingStake)
    .plus(new D(refundProfit))
    .toFixed(2);
}

export type SettleProfitSource = "computed" | "corrected" | "override";

export function settleProfit(args: {
  outcome: "won" | "push" | "void";
  snapshot: TrackedNoSweatSnapshot;
  correction: NoSweatCorrection | null;
  overrideProfit?: string | null;
}): { profit: string; profitSource: SettleProfitSource } {
  const { outcome, snapshot, correction, overrideProfit } = args;
  if (correction) {
    // Reject out-of-range odds up front (T-09-20), even if unused by this outcome.
    americanToDecimal(correction.qualifyingOddsAmerican);
    americanToDecimal(correction.hedgeOddsAmerican);
  }
  if (overrideProfit != null) {
    if (!OVERRIDE_RE.test(overrideProfit) || new D(overrideProfit).abs().gt(MAX_ABS_OVERRIDE)) {
      throw new RangeError(`override profit must be 2dp and within +/-10000.00, got ${overrideProfit}`);
    }
    return { profit: overrideProfit, profitSource: "override" };
  }
  if (outcome === "won") {
    return { profit: wonProfit(snapshot, correction), profitSource: correction ? "corrected" : "computed" };
  }
  return { profit: PUSH_OR_VOID_PROFIT, profitSource: "computed" };
}

/** Maps a ranked opportunity to the stored RefundConversion shape. */
export function toRefundConversion(opp: BonusBetOpportunity, amount: string): RefundConversion {
  const bonusLabel = `${opp.bonus.team} ML`;
  return {
    optionKey: `${opp.eventId}|${bonusLabel}|${opp.hedge.bookKey}`,
    eventId: opp.eventId,
    refundBookKey: opp.bonus.bookKey,
    amount,
    bonusSelectionLabel: bonusLabel,
    bonusOddsAmerican: opp.bonus.oddsAmerican,
    hedgeBookKey: opp.hedge.bookKey,
    hedgeSelectionLabel: `${opp.hedge.team} ML`,
    hedgeOddsAmerican: opp.hedge.oddsAmerican,
    hedgeStake: opp.result.hedgeStake.toFixed(2),
    profit: opp.result.guaranteedProfit.toFixed(2),
  };
}
