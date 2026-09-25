/**
 * Server-only odds-status loader (ODDS-02, ODDS-03) combining the age of
 * the cached odds with the last real refresh's credit usage. Only
 * counts/timestamps are returned -- never the API key or DB connection
 * string (T-01-19).
 */
import { getOddsFreshness } from "@/db/queries";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";
import {
  creditLevel,
  estimateRefreshCredits,
  nextMonthlyReset,
  FREE_TIER_MONTHLY_CREDITS,
  type CreditLevel,
} from "./quota";
import { getLatestCreditUsage } from "./store";

export interface OddsStatus {
  oddsFetchedAt: string | null;
  lastRefreshAt: string | null;
  remaining: number | null;
  total: number;
  level: CreditLevel;
  estimatedRefreshCredits: number;
  resetsOn: string;
}

export async function getOddsStatus(now: Date = new Date()): Promise<OddsStatus> {
  const [oddsFetchedAt, latest] = await Promise.all([
    getOddsFreshness(),
    getLatestCreditUsage(),
  ]);

  const remaining = latest?.requestsRemaining ?? null;
  const total = latest ? latest.requestsRemaining + latest.requestsUsed : FREE_TIER_MONTHLY_CREDITS;

  // Never hardcode the estimate: use the last refresh's real cost when it
  // spent credits, otherwise the pure upper-bound formula (research
  // pitfall -- never a literal like "10 credits").
  const estimatedRefreshCredits =
    latest && latest.refreshCost > 0
      ? latest.refreshCost
      : estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length);

  return {
    oddsFetchedAt: oddsFetchedAt ? oddsFetchedAt.toISOString() : null,
    lastRefreshAt: latest ? latest.recordedAt.toISOString() : null,
    remaining,
    total,
    level: creditLevel(remaining),
    estimatedRefreshCredits,
    resetsOn: nextMonthlyReset(now).toISOString(),
  };
}
