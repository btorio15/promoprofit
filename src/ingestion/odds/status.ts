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
import { legacyKeyId, configuredOddsKeys } from "./oddsKeys";
import {
  getLatestCreditUsage,
  getLatestCreditUsageByKey,
  getSpendAttribution,
  latestRowForKey,
} from "./store";

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
  const [oddsFetchedAt, extendedOddsFetchedAt, latest, byKey] = await Promise.all([
    getOddsFreshness(),
    getExtendedOddsFreshness(),
    getLatestCreditUsage(),
    getLatestCreditUsageByKey(),
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
  let remaining = effectiveRemaining(latest, now);
  let total =
    latest && remaining !== null ? latest.requestsRemaining + latest.requestsUsed : FREE_TIER_MONTHLY_CREDITS;
  let level = creditLevel(remaining);

  // Several configured keys (and migration 0013 applied): the meter shows the
  // combined balance. The level follows the balance the NEXT refresh would be
  // gated on (the best key), so it is "blocked" exactly when every key is
  // below the block threshold -- the refresh button is disabled only then.
  // One key, or no key_id column yet: unchanged single-key behavior.
  const keys = configuredOddsKeys();
  if (byKey.keyColumn && keys.length > 1) {
    const legacyId = legacyKeyId();
    let sumRemaining = 0;
    let sumTotal = 0;
    let best = -Infinity;
    for (const k of keys) {
      const row = latestRowForKey(byKey.byKeyId, k.id, legacyId);
      const eff = effectiveRemaining(row, now);
      const keyRemaining = eff ?? FREE_TIER_MONTHLY_CREDITS;
      sumRemaining += keyRemaining;
      sumTotal += eff !== null && row ? row.requestsRemaining + row.requestsUsed : FREE_TIER_MONTHLY_CREDITS;
      best = Math.max(best, keyRemaining);
    }
    remaining = sumRemaining;
    total = sumTotal;
    level = creditLevel(best);
  }

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
    level,
    estimatedRefreshCredits,
    resetsOn: nextMonthlyReset(now).toISOString(),
    extendedOddsFetchedAt: extendedOddsFetchedAt ? extendedOddsFetchedAt.toISOString() : null,
    estimatedExtendedRefreshCredits,
    oddsRefreshedBy,
    extendedSearchedBy,
  };
}
