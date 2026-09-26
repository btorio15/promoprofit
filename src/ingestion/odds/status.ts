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
import { getLatestCreditUsage, getSpendAttribution } from "./store";

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
  oddsRefreshedBy: string | null;
  extendedSearchedBy: string | null;
}

export async function getOddsStatus(now: Date = new Date()): Promise<OddsStatus> {
  const [oddsFetchedAt, extendedOddsFetchedAt, latest] = await Promise.all([
    getOddsFreshness(),
    getExtendedOddsFreshness(),
    getLatestCreditUsage(),
  ]);

  // Each cache's fetched_at IS the recorded_at of the credit_usage row that
  // produced it (see refresh.ts/refreshExtended.ts's shared `now`), so
  // looking each up by its own timestamp names the right user even when the
  // two caches were last written by different runs (D-21). Skipped entirely
  // when a cache has never been fetched -- never a placeholder lookup.
  const [oddsRefreshedBy, extendedSearchedBy] = await Promise.all([
    oddsFetchedAt ? getSpendAttribution(oddsFetchedAt) : Promise.resolve(null),
    extendedOddsFetchedAt ? getSpendAttribution(extendedOddsFetchedAt) : Promise.resolve(null),
  ]);

  // A row from before the last monthly reset is last month's balance --
  // show it as unknown (not blocked) once the quota has reset (CR-01).
  const remaining = effectiveRemaining(latest, now);
  const total =
    latest && remaining !== null ? latest.requestsRemaining + latest.requestsUsed : FREE_TIER_MONTHLY_CREDITS;

  // Never hardcode the estimate (research pitfall -- never a literal like
  // "10 credits"). Both estimates use the same exact formula the server-side
  // gate uses, from the latest row's in-season sport count, so neither
  // depends on which fetch path ran last (01.1 review WR-03): reusing
  // latest.refreshCost quoted ~3x after a spreads/totals search, and a
  // partial run's fetched count under-stated the extended cost. The
  // credit_usage ledger is shared (one Odds API balance) and each run
  // records its full in-season count even when it fails mid-way.
  const inSeasonSportCount =
    latest && latest.sportsFetched > 0 ? latest.sportsFetched : SPORT_KEYS.length;
  const estimatedRefreshCredits = estimateRefreshCredits(inSeasonSportCount, usableOddsBooks().length);
  const estimatedExtendedRefreshCredits = estimateRefreshCredits(
    inSeasonSportCount,
    usableOddsBooks().length,
    EXTENDED_MARKET_COUNT,
  );

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
    oddsRefreshedBy,
    extendedSearchedBy,
  };
}
