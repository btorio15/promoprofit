/**
 * Server-only Postgres cache writer for the odds refresh pipeline
 * (ODDS-01/ODDS-02). replaceSportOdds remains the only writer of
 * cached_odds; replaceExtendedSportOdds is the only writer of the
 * independent spreads/totals cache, cached_extended_odds (D-16).
 * recordCreditUsage/getLatestCreditUsage are the only reader/writer pair for
 * the persisted credit meter (D-11's thresholds read the latest row, never
 * a fresh API call).
 */
import { and, desc, eq, lt, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cachedExtendedOdds, cachedOdds, creditUsage, refreshLock } from "@/db/schema";
import type { OddsEvent } from "@/domain/odds/schemas";

export interface CreditUsageRow {
  requestsRemaining: number;
  requestsUsed: number;
  refreshCost: number;
  sportsFetched: number;
  recordedAt: Date;
}

/**
 * Atomically deletes every cached_odds row for sportKey and inserts the
 * freshly-fetched (already Zod-validated) events in its place. Skips the
 * insert half of the batch when events is empty -- Drizzle rejects an empty
 * `values([])` array.
 */
export async function replaceSportOdds(sportKey: string, events: OddsEvent[], fetchedAt: Date): Promise<void> {
  const db = getDb();
  const deleteStmt = db.delete(cachedOdds).where(eq(cachedOdds.sportKey, sportKey));

  if (events.length === 0) {
    await db.batch([deleteStmt]);
    return;
  }

  const insertStmt = db.insert(cachedOdds).values(
    events.map((event) => ({
      eventId: event.id,
      sportKey: event.sport_key,
      commenceTime: new Date(event.commence_time),
      rawResponse: event,
      fetchedAt,
    })),
  );

  await db.batch([deleteStmt, insertStmt]);
}

/** Removes cached events that have already started (commence_time <= now). */
export async function purgeStartedEvents(now: Date): Promise<void> {
  const db = getDb();
  await db.delete(cachedOdds).where(lte(cachedOdds.commenceTime, now));
}

/**
 * After a fully successful refresh, removes every cached row that this run
 * did not write (fetched_at before the run's timestamp) -- e.g. sports that
 * are no longer in season -- so days-old odds never linger in the cache
 * (WR-01).
 */
export async function purgeUnrefreshedEvents(refreshFetchedAt: Date): Promise<void> {
  const db = getDb();
  await db.delete(cachedOdds).where(lt(cachedOdds.fetchedAt, refreshFetchedAt));
}

/**
 * Atomically deletes every cached_extended_odds row for sportKey and inserts
 * the freshly-fetched (already Zod-validated) events in its place. Skips the
 * insert half of the batch when events is empty -- Drizzle rejects an empty
 * `values([])` array. This is a structural copy of replaceSportOdds against
 * the independent spreads/totals cache table (D-16); it never touches
 * cached_odds.
 */
export async function replaceExtendedSportOdds(sportKey: string, events: OddsEvent[], fetchedAt: Date): Promise<void> {
  const db = getDb();
  const deleteStmt = db.delete(cachedExtendedOdds).where(eq(cachedExtendedOdds.sportKey, sportKey));

  if (events.length === 0) {
    await db.batch([deleteStmt]);
    return;
  }

  const insertStmt = db.insert(cachedExtendedOdds).values(
    events.map((event) => ({
      eventId: event.id,
      sportKey: event.sport_key,
      commenceTime: new Date(event.commence_time),
      rawResponse: event,
      fetchedAt,
    })),
  );

  await db.batch([deleteStmt, insertStmt]);
}

/** Removes cached extended events that have already started (commence_time <= now). */
export async function purgeStartedExtendedEvents(now: Date): Promise<void> {
  const db = getDb();
  await db.delete(cachedExtendedOdds).where(lte(cachedExtendedOdds.commenceTime, now));
}

/**
 * After a fully successful extended refresh, removes every cached_extended_odds
 * row that this run did not write (fetched_at before the run's timestamp),
 * mirroring purgeUnrefreshedEvents but scoped to the independent
 * spreads/totals table only (D-16).
 */
export async function purgeUnrefreshedExtendedEvents(refreshFetchedAt: Date): Promise<void> {
  const db = getDb();
  await db.delete(cachedExtendedOdds).where(lt(cachedExtendedOdds.fetchedAt, refreshFetchedAt));
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
