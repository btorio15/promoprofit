import Decimal from "decimal.js";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import { floorCents } from "@/domain/hedge/noSweat";
import type { NoSweatCorrection } from "@/domain/promos/noSweatSnapshot";
import { formatKickoff, formatUsd } from "@/lib/format";

/**
 * Phase 9 (D-02..D-07, A-09): pure copy + preview helpers for the tracked
 * no-sweat card. Display-only: the server validates and recomputes every
 * figure (T-09-48); nothing here is trusted or stored.
 */

export const WAITING_COPY = "Still waiting on this one. It counts as $0.00 until you tell us how it went.";
export const PUSH_COPY = "No money changes hands, so this counts as $0.00.";

const D = Decimal.clone({ precision: 40 });

export function statusLine(card: { commenceTime: string }): string {
  return `Game starts ${formatKickoff(card.commenceTime)}. Come back after it ends.`;
}

export function awaitingHeading(card: { refundAmount: string }): string {
  return `Your bet lost. Turn your ${formatUsd(card.refundAmount)} bonus bet into cash.`;
}

export type SettleOutcome = "won" | "lost" | "push" | "void";

const CHIPS: Record<SettleOutcome, string> = {
  won: "Won",
  lost: "Lost, refund converted",
  push: "Push",
  void: "Voided",
};

export function outcomeChip(outcome: SettleOutcome): string {
  return CHIPS[outcome];
}

/** "+150" / "-160" / "150" -> integer; anything shorter than +/-100 or non-integer -> null. */
export function parseOddsInput(raw: string): number | null {
  const t = raw.trim().replace(/^−/, "-");
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  if (!Number.isSafeInteger(n) || (n < 100 && n > -100)) return null;
  return n;
}

/** "25", "25.5", "25.00" -> "25.00"; empty / junk / zero -> null. */
export function parseMoneyInput(raw: string): string | null {
  const t = raw.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const v = new D(t);
  if (v.lte(0)) return null;
  return v.toFixed(2);
}

/** Same pattern as the server override: signed whole-cent amount, "" -> null. */
export function parseSignedMoneyInput(raw: string): string | null {
  const t = raw.trim().replace(/^\$/, "").replace(/^−/, "-");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return new D(t).toFixed(2);
}

export interface CorrectionInput {
  qualifyingStake: string;
  qualifyingOdds: string;
  hedgeStake: string;
  hedgeOdds: string;
}

export function toCorrection(input: CorrectionInput): NoSweatCorrection | null {
  const qualifyingStake = parseMoneyInput(input.qualifyingStake);
  const hedgeStake = parseMoneyInput(input.hedgeStake);
  const qualifyingOddsAmerican = parseOddsInput(input.qualifyingOdds);
  const hedgeOddsAmerican = parseOddsInput(input.hedgeOdds);
  if (qualifyingStake === null || hedgeStake === null) return null;
  if (qualifyingOddsAmerican === null || hedgeOddsAmerican === null) return null;
  return { qualifyingStake, qualifyingOddsAmerican, hedgeStake, hedgeOddsAmerican };
}

/** Preview for "Bet won" with the member's amounts: "Profit would be +$17.50". Null if inputs are invalid or outcome isn't won. */
export function correctionPreview(
  _snapshotLike: unknown,
  input: CorrectionInput,
  outcome: SettleOutcome,
): string | null {
  if (outcome !== "won") return null;
  const c = toCorrection(input);
  if (c === null) return null;
  const winnings = floorCents(
    new D(c.qualifyingStake).times(americanToDecimal(c.qualifyingOddsAmerican).minus(1)),
  );
  const profit = new D(winnings).minus(c.hedgeStake);
  return `Profit would be ${profit.isNegative() ? "−" : "+"}$${profit.abs().toFixed(2)}`;
}

/** "You'd get back $25.00." = min(actual stake, cap). Null if the stake is invalid. */
export function refundPreview(cap: string, stake: string): string | null {
  const s = parseMoneyInput(stake);
  if (s === null) return null;
  return `You'd get back ${formatUsd(D.min(new D(s), new D(cap)).toFixed(2))}.`;
}
