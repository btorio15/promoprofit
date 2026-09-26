/**
 * Server-only Postgres cache writer for the odds refresh pipeline
 * (ODDS-01/ODDS-02). commitOddsRefresh and commitSpreadsTotalsRefresh are
 * the only cache writers; each commits a whole refresh in one transaction.
 * commitSpreadsTotalsRefresh is the only writer of the spreads/totals cache,
 * cached_extended_odds (D-16).
 * recordCreditUsage/getLatestCreditUsage are the only reader/writer pair for
 * the persisted credit meter (D-11's thresholds read the latest row, never
 * a fresh API call).
 */
import { and, desc, eq, lt, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db/client";
import { cachedExtendedOdds, cachedOdds, creditUsage, refreshLock } from "@/db/schema";
import type { OddsEvent } from "@/domain/odds/schemas";

export interface CreditUsageRow {
  requestsRemaining: number;
  requestsUsed: number;
  refreshCost: number;
  /**
   * In-season sport count the run targeted (== sports fetched on a complete
   * run). The basis for every credit estimate in status.ts (WR-03).
   */
  sportsFetched: number;
  recordedAt: Date;
}

/** One sport's freshly-fetched (already Zod-validated) events. */
export interface SportOddsWrite {
  sportKey: string;
  events: OddsEvent[];
}

/**
 * One sport's extended fetch: the full h2h+spreads+totals events for
 * cached_extended_odds plus their h2h-only projection for cached_odds.
 */
export interface ExtendedSportOddsWrite {
  sportKey: string;
  extendedEvents: OddsEvent[];
  h2hEvents: OddsEvent[];
}

type Db = ReturnType<typeof getDb>;
type Statement = BatchItem<"pg">;
type CacheTable = typeof cachedOdds | typeof cachedExtendedOdds;

/**
 * Delete-then-insert statements that replace every row of `table` for
 * sportKey with `events`. Omits the insert when events is empty -- Drizzle
 * rejects an empty `values([])` array.
 */
function replaceSportStatements(
  db: Db,
  table: CacheTable,
  sportKey: string,
  events: OddsEvent[],
  fetchedAt: Date,
): Statement[] {
  const statements: Statement[] = [db.delete(table).where(eq(table.sportKey, sportKey))];
  if (events.length > 0) {
    statements.push(
      db.insert(table).values(
        events.map((event) => ({
          eventId: event.id,
          sportKey: event.sport_key,
          commenceTime: new Date(event.commence_time),
          rawResponse: event,
          fetchedAt,
        })),
      ),
    );
  }
  return statements;
}

/**
 * Purge statements for one cache table: rows this run did not write
 * (fetched_at before the run's timestamp -- e.g. sports no longer in
 * season, WR-01) and events that have already started.
 */
function purgeStatements(db: Db, table: CacheTable, fetchedAt: Date): Statement[] {
  return [
    db.delete(table).where(lt(table.fetchedAt, fetchedAt)),
    db.delete(table).where(lte(table.commenceTime, fetchedAt)),
  ];
}

/**
 * Commits a fully-fetched h2h refresh to cached_odds in ONE neon-http batch
 * (a single Postgres transaction): every sport's delete+insert plus the
 * purges. Either the whole refresh lands or nothing changes, so a failed
 * run can never leave some sports on the new timestamp and hide the rest
 * behind getCachedEvents' latest-batch filter (01.1 review WR-01).
 */
export async function commitOddsRefresh(sports: SportOddsWrite[], fetchedAt: Date): Promise<void> {
  const db = getDb();
  const [first, ...rest]: Statement[] = [
    ...sports.flatMap((s) => replaceSportStatements(db, cachedOdds, s.sportKey, s.events, fetchedAt)),
    ...purgeStatements(db, cachedOdds, fetchedAt),
  ];
  await db.batch([first, ...rest]);
}

/**
 * Commits a fully-fetched spreads/totals search in ONE neon-http batch (a
 * single Postgres transaction): every sport's cached_extended_odds rows,
 * the h2h projection into cached_odds, then both tables' purges. Either
 * both caches move to this run's timestamp together or neither changes
 * (01.1 review WR-01) -- a failed search can no longer shrink the
 * Bonus-bets finder or leave the two caches diverged. This is the ONLY
 * writer/purger of cached_extended_odds (D-16).
 */
export async function commitSpreadsTotalsRefresh(
  sports: ExtendedSportOddsWrite[],
  fetchedAt: Date,
): Promise<void> {
  const db = getDb();
  const [first, ...rest]: Statement[] = [
    ...sports.flatMap((s) =>
      replaceSportStatements(db, cachedExtendedOdds, s.sportKey, s.extendedEvents, fetchedAt),
    ),
    ...sports.flatMap((s) => replaceSportStatements(db, cachedOdds, s.sportKey, s.h2hEvents, fetchedAt)),
    ...purgeStatements(db, cachedExtendedOdds, fetchedAt),
    ...purgeStatements(db, cachedOdds, fetchedAt),
  ];
  await db.batch([first, ...rest]);
}

/** Persists one row per refresh from the Odds API's own x-requests-* headers. */
export async function recordCreditUsage(row: CreditUsageRow): Promise<void> {
  const db = getDb();
  await db.insert(creditUsage).values({
    requestsRemaining: row.requestsRemaining,
    requestsUsed: row.requestsUsed,
    refreshCost: row.refreshCost,
    sportsFetched: row.sportsFetched,
    recordedAt: row.recordedAt,
  });
}

/** Most recent credit_usage row, or null if no refresh has ever run. */
export async function getLatestCreditUsage(): Promise<CreditUsageRow | null> {
  const db = getDb();
  const rows = await db.select().from(creditUsage).orderBy(desc(creditUsage.recordedAt)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    requestsRemaining: row.requestsRemaining,
    requestsUsed: row.requestsUsed,
    refreshCost: row.refreshCost,
    sportsFetched: row.sportsFetched,
    recordedAt: row.recordedAt instanceof Date ? row.recordedAt : new Date(row.recordedAt),
  };
}

const REFRESH_LOCK_ID = 1;

/**
 * Claims the single refresh lock row for `holder` (WR-03). Succeeds when no
 * lock row exists or the existing lock has expired; returns false while
 * another refresh holds an unexpired lock. One atomic statement, so two
 * concurrent callers can never both succeed.
 */
export async function tryAcquireRefreshLock(holder: string, ttlMs: number): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const rows = await db
    .insert(refreshLock)
    .values({ id: REFRESH_LOCK_ID, holder, lockedUntil })
    .onConflictDoUpdate({
      target: refreshLock.id,
      set: { holder, lockedUntil },
      setWhere: lt(refreshLock.lockedUntil, now),
    })
    .returning({ holder: refreshLock.holder });
  return rows.length > 0;
}

/** Releases the refresh lock, but only if `holder` still owns it. */
export async function releaseRefreshLock(holder: string): Promise<void> {
  const db = getDb();
  await db
    .delete(refreshLock)
    .where(and(eq(refreshLock.id, REFRESH_LOCK_ID), eq(refreshLock.holder, holder)));
}
