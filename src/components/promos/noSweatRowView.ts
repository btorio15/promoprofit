import type { LowProfileWarning } from "@/domain/promos/lowProfile";
import type { NoSweatNoteRowDTO, NoSweatRowDTO } from "@/domain/promos/noSweatRowDto";
import { formatUsd } from "@/lib/format";

/**
 * Phase 9 (FEED-03): all copy for the no-sweat feed row lives here as pure,
 * tested helpers. Strings come verbatim from 09-UI-SPEC.md. Nothing here may
 * say "guaranteed" or mention multiple accounts, VPNs or location.
 */

/** Account-risk line (D-20), shown beside every Track action and in the expanded panel. */
export const NO_SWEAT_RISK_COPY =
  "You only get one shot at this at each book. Mix in some normal bets and skip very long odds so your account looks like a regular customer.";

export const NO_SWEAT_EST_TOOLTIP =
  "An estimate. It assumes you turn the refund bonus bet into cash at today's best rate, so it can change.";

export const TRACK_HELPER_COPY = "Track bet pins this to the top so you can finish it after the game.";

export const TRACK_ODDS_CHANGED_COPY =
  "Odds changed, so the numbers were updated. Check them and tap Track bet again.";

export const TRACK_FAILED_COPY = "Couldn't track this one. Try again.";

/** "at 78% · worst case −$3.10" (U+2212 minus on negatives, via formatUsd of the magnitude). */
export function estimateSecondaryLine(dto: Pick<NoSweatRowDTO, "ratePct" | "worstCaseProfit">): string {
  const rate = Number.isInteger(Number(dto.ratePct)) ? Number(dto.ratePct).toFixed(0) : dto.ratePct;
  return `at ${rate}% · worst case ${signedUsd(dto.worstCaseProfit)}`;
}

/** formatUsd with U+2212 for negatives, to match formatAmerican's typography. */
export function signedUsd(value: string): string {
  const formatted = formatUsd(value);
  return formatted.startsWith("-") ? `−${formatted.slice(1)}` : formatted;
}

const WARNING_COPY: Record<LowProfileWarning, string> = {
  long_odds: "Long odds. A bet this far out is easy for the book to notice.",
  alternate_line: "This is an alternate line, not the main one. Books watch for those.",
  exact_cent_stake: "This stake has cents in it. Real bettors usually bet whole dollars.",
};

export function warningCopy(warning: LowProfileWarning): string {
  return WARNING_COPY[warning];
}

export function hiddenLinesNote(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? "line" : "lines"} hidden by your Low-profile settings.`;
}

export function noteCopy(note: NoSweatNoteRowDTO["note"], bookName: string): string {
  switch (note) {
    case "cant_price":
      return `Can't price - no odds at ${bookName}.`;
    case "not_worth_it":
      return "Not worth it right now.";
    case "low_profile_blocked":
      return "No line fits your Low-profile settings right now.";
  }
}
