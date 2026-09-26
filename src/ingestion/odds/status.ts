/**
 * Server-only odds-status loader (ODDS-02, ODDS-03) combining the age of
 * the cached odds with the last real refresh's credit usage, plus the
 * independent spreads/totals cache's age and a dynamic 3x credit estimate
 * (D-16, D-14). Only counts/timestamps are returned -- never the API key or
 * DB connection string (T-01-19).
 */
import { getExtendedOddsFreshness, getOddsFreshness } from "@/db/queries";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";
import {
  creditLevel,
  effectiveRemaining,
  estimateRefreshCredits,
  nextMonthlyReset,
  FREE_TIER_MONTHLY_CREDITS,
  type CreditLevel,
} from "./quota";
import { getLatestCreditUsage } from "./store";

/** h2h + spreads + totals -- matches refreshExtended.ts's EXTENDED_MARKETS.length (D-13/D-14). */
const EXTENDED_MARKET_COUNT = 3;

export interface OddsStatus {
  oddsFetchedAt: string | null;
  lastRefreshAt: string | null;
  remaining: number | null;
  total: number;
  level: CreditLevel;
  estimatedRefreshCredits: number;
  resetsOn: string;
  extendedOddsFetchedAt: string | null;
  estimatedExtendedRefreshCredits: number;
}

export async function getOddsStatus(now: Date = new Date()): Promise<OddsStatus> {
  const [oddsFetchedAt, extendedOddsFetchedAt, latest] = await Promise.all([
    getOddsFreshness(),
    getExtendedOddsFreshness(),
    getLatestCreditUsage(),
  ]);

  // A row from before the last monthly reset is last month's balance --
  // show it as unknown (not blocked) once the quota has reset (CR-01).
  const remaining = effectiveRemaining(latest, now);
  const total =
    latest && remaining !== null ? latest.requestsRemaining + latest.requestsUsed : FREE_TIER_MONTHLY_CREDITS;

  // Never hardcode the estimate: use the last refresh's real cost when it
  // spent credits, otherwise the pure upper-bound formula (research
  // pitfall -- never a literal like "10 credits").
  const estimatedRefreshCredits =
    latest && latest.refreshCost > 0
      ? latest.refreshCost
      : estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length);

  // The credit_usage ledger is shared between the normal and extended
  // refresh (there is only one Odds API balance), so re-derive the
  // extended estimate from the latest row's sport count with marketCount 3
  // rather than reusing its refreshCost verbatim (that cost may reflect
  // whichever fetch path last ran, not necessarily the extended one).
  const estimatedExtendedRefreshCredits =
    latest && latest.sportsFetched > 0
      ? estimateRefreshCredits(latest.sportsFetched, usableOddsBooks().length, EXTENDED_MARKET_COUNT)
      : estimateRefreshCredits(SPORT_KEYS.length, usableOddsBooks().length, EXTENDED_MARKET_COUNT);

  return {
    oddsFetchedAt: oddsFetchedAt ? oddsFetchedAt.toISOString() : null,
    lastRefreshAt: latest ? latest.recordedAt.toISOString() : null,
    remaining,
    total,
    level: creditLevel(remaining),
    estimatedRefreshCredits,
    resetsOn: nextMonthlyReset(now).toISOString(),
    extendedOddsFetchedAt: extendedOddsFetchedAt ? extendedOddsFetchedAt.toISOString() : null,
    estimatedExtendedRefreshCredits,
  };
}
