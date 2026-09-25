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
 * sports * ceil(bookmakers / 10) region-groups * 1 market (h2h only, D-02).
 * The Odds API bills every group of 10 bookmakers as one region.
 */
export function estimateRefreshCredits(inSeasonSportCount: number, bookmakerCount: number): number {
  const regionGroups = Math.ceil(bookmakerCount / 10);
  return inSeasonSportCount * regionGroups;
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
