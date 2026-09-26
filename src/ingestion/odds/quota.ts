/**
 * Pure credit-guard logic for refreshOdds (ODDS-02, D-10, D-11). No I/O:
 * every value the caller needs (remaining credits, last refresh time) is
 * read from Postgres by the caller and passed in as plain data.
 */

export const CREDIT_WARN_THRESHOLD = 100;
export const CREDIT_BLOCK_THRESHOLD = 20;
export const CONFIRM_WINDOW_MINUTES = 15;
export const FREE_TIER_MONTHLY_CREDITS = 500;

export type CreditLevel = "unknown" | "normal" | "warning" | "blocked";

/** unknown when no refresh has ever run; otherwise normal/warning/blocked per D-11's thresholds. */
export function creditLevel(remaining: number | null): CreditLevel {
  if (remaining === null) return "unknown";
  if (remaining < CREDIT_BLOCK_THRESHOLD) return "blocked";
  if (remaining < CREDIT_WARN_THRESHOLD) return "warning";
  return "normal";
}

/**
 * sports * ceil(bookmakers / 10) region-groups * marketCount. The Odds API
 * bills every group of 10 bookmakers as one region; cost = markets x
 * regions. marketCount defaults to 1 (h2h only, D-02) to preserve the
 * existing normal-refresh call site untouched (SC1); the extended
 * spreads/totals refresh passes marketCount: 3 (D-13/D-14).
 */
export function estimateRefreshCredits(
  inSeasonSportCount: number,
  bookmakerCount: number,
  marketCount: number = 1,
): number {
  const regionGroups = Math.ceil(bookmakerCount / 10);
  return inSeasonSportCount * regionGroups * marketCount;
}

export type RefreshGate =
  | { action: "proceed" }
  | { action: "confirm"; minutesSinceLastRefresh: number; estimatedCredits: number }
  | {
      action: "block";
      reason: "low_credits" | "insufficient_credits";
      remaining: number;
      estimatedCredits: number;
    };

export interface EvaluateRefreshGateInput {
  remaining: number | null;
  lastRefreshAt: Date | null;
  estimatedCredits: number;
  now: Date;
  confirmed: boolean;
}

/**
 * Gate order (D-10/D-11): low_credits block first, then insufficient_credits
 * block, then the 15-minute confirmation window, else proceed. `remaining`
 * null (no refresh has ever run) never blocks -- there is nothing to block
 * against yet.
 */
export function evaluateRefreshGate(i: EvaluateRefreshGateInput): RefreshGate {
  const { remaining, lastRefreshAt, estimatedCredits, now, confirmed } = i;

  if (remaining !== null && remaining < CREDIT_BLOCK_THRESHOLD) {
    return { action: "block", reason: "low_credits", remaining, estimatedCredits };
  }

  if (remaining !== null && estimatedCredits > remaining) {
    return { action: "block", reason: "insufficient_credits", remaining, estimatedCredits };
  }

  if (lastRefreshAt !== null) {
    const minutesSince = (now.getTime() - lastRefreshAt.getTime()) / 60000;
    if (minutesSince < CONFIRM_WINDOW_MINUTES && !confirmed) {
      return {
        action: "confirm",
        minutesSinceLastRefresh: Math.floor(minutesSince),
        estimatedCredits,
      };
    }
  }

  return { action: "proceed" };
}

/** 1st of next month, 00:00:00 UTC -- when the Odds API's monthly credit count resets. */
export function nextMonthlyReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * The Odds API resets its monthly credit count on the 1st (UTC). A
 * credit_usage row recorded before the most recent reset describes last
 * month's balance, so it must be treated as unknown -- otherwise a month
 * that ended below the block threshold would lock refresh out forever
 * (only a successful refresh writes a new row, and a blocked refresh never
 * runs). Returns null when there is no row or the row predates a reset.
 */
export function effectiveRemaining(
  latest: { requestsRemaining: number; recordedAt: Date } | null,
  now: Date,
): number | null {
  if (!latest) return null;
  return isFromEarlierBillingMonth(latest.recordedAt, now) ? null : latest.requestsRemaining;
}

/** True when a monthly reset (1st, 00:00Z) has happened between recordedAt and now. */
export function isFromEarlierBillingMonth(recordedAt: Date, now: Date): boolean {
  return nextMonthlyReset(recordedAt).getTime() <= now.getTime();
}
