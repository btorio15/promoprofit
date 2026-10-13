/**
 * Server-only Postgres cache writer for the odds refresh pipeline
 * (ODDS-01/ODDS-02). commitOddsRefresh, commitSpreadsTotalsRefresh and
 * commitPromoSportsRefresh are the only cache writers; each commits a whole
 * refresh in one transaction. commitSpreadsTotalsRefresh and
 * commitPromoSportsRefresh are the two writers of the spreads/totals cache,
 * cached_extended_odds (D-16). The promo commit replaces only the refreshed
 * sports and leaves every other sport's rows and fetched_at untouched
 * (quick-261001-jbc D-06).
 * recordCreditUsage/getLatestCreditUsage are the only reader/writer pair for
 * the persisted credit meter (D-11's thresholds read the latest row, never
 * a fresh API call).
 */
import { and, desc, eq, lt, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db/client";
import { isUndefinedColumnErrorFor } from "@/db/undefinedColumn";
import { cachedExtendedOdds, cachedOdds, creditUsage, refreshLock, users } from "@/db/schema";
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
  /**
   * The user who triggered this spend (D-21, closes 01.1 review WR-05),
   * sourced only from the server-side session in the calling action --
   * never from client input (T-02-20). Null for CLI-triggered runs
   * (scripts/refresh-odds.ts) and legacy rows recorded before this column
   * existed.
   */
  triggeredByUserId?: number | null;
  /**
   * 8-hex sha256 fingerprint of the Odds API key that spent these credits
   * (never the key). Null/absent = legacy row (belongs to legacyKeyId).
   */
  keyId?: string | null;
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
  return [db.delete(table).where(lt(table.fetchedAt, fetchedAt)), purgeStartedStatement(db, table, fetchedAt)];
}

/** Deletes events that have already started (commence_time <= fetchedAt). */
function purgeStartedStatement(db: Db, table: CacheTable, fetchedAt: Date): Statement {
  return db.delete(table).where(lte(table.commenceTime, fetchedAt));
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

/**
 * quick-261001-jbc (D-06): commits a promo-sports refresh in ONE batch.
 * Replaces ONLY the given sports in cached_extended_odds and cached_odds and
 * purges only already-started events -- it must never purge by fetched_at,
 * which would delete every sport not refreshed. Other sports keep their rows
 * and their original fetched_at (readers report each row's own time).
 */
export async function commitPromoSportsRefresh(
  sports: ExtendedSportOddsWrite[],
  fetchedAt: Date,
): Promise<void> {
  if (sports.length === 0) return;
  const db = getDb();
  const [first, ...rest]: Statement[] = [
    ...sports.flatMap((s) =>
      replaceSportStatements(db, cachedExtendedOdds, s.sportKey, s.extendedEvents, fetchedAt),
    ),
    ...sports.flatMap((s) => replaceSportStatements(db, cachedOdds, s.sportKey, s.h2hEvents, fetchedAt)),
    purgeStartedStatement(db, cachedExtendedOdds, fetchedAt),
    purgeStartedStatement(db, cachedOdds, fetchedAt),
  ];
  await db.batch([first, ...rest]);
}

/**
 * Persists one row per refresh from the Odds API's own x-requests-* headers.
 * Before migration 0013 (no key_id column) retries once without key_id.
 */
export async function recordCreditUsage(row: CreditUsageRow): Promise<void> {
  const db = getDb();
  try {
    await db.insert(creditUsage).values({
      requestsRemaining: row.requestsRemaining,
      requestsUsed: row.requestsUsed,
      refreshCost: row.refreshCost,
      sportsFetched: row.sportsFetched,
      recordedAt: row.recordedAt,
      triggeredByUserId: row.triggeredByUserId ?? null,
      keyId: row.keyId ?? null,
    });
  } catch (err) {
    if (!isUndefinedColumnErrorFor(err, "key_id")) throw err;
    await db.execute(
      sql`insert into credit_usage (requests_remaining, requests_used, refresh_cost, sports_fetched, recorded_at, triggered_by_user_id) values (${row.requestsRemaining}, ${row.requestsUsed}, ${row.refreshCost}, ${row.sportsFetched}, ${row.recordedAt.toISOString()}, ${row.triggeredByUserId ?? null})`,
    );
  }
}

function toCreditRow(row: {
  requestsRemaining: number;
  requestsUsed: number;
  refreshCost: number;
  sportsFetched: number;
  recordedAt: Date | string;
  keyId?: string | null;
}): CreditUsageRow {
  return {
    requestsRemaining: row.requestsRemaining,
    requestsUsed: row.requestsUsed,
    refreshCost: row.refreshCost,
    sportsFetched: row.sportsFetched,
    recordedAt: row.recordedAt instanceof Date ? row.recordedAt : new Date(row.recordedAt),
    ...(row.keyId !== undefined ? { keyId: row.keyId } : {}),
  };
}

/**
 * Most recent credit_usage row across ALL keys (the global confirm window and
 * sports estimate), or null if no refresh has ever run. Explicit columns so
 * it keeps working before migration 0013.
 */
export async function getLatestCreditUsage(): Promise<CreditUsageRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      requestsRemaining: creditUsage.requestsRemaining,
      requestsUsed: creditUsage.requestsUsed,
      refreshCost: creditUsage.refreshCost,
      sportsFetched: creditUsage.sportsFetched,
      recordedAt: creditUsage.recordedAt,
    })
    .from(creditUsage)
    .orderBy(desc(creditUsage.recordedAt))
    .limit(1);
  const row = rows[0];
  return row ? toCreditRow(row) : null;
}

export type LatestCreditUsageByKey =
  | { keyColumn: true; byKeyId: Map<string | null, CreditUsageRow> }
  | { keyColumn: false };

/**
 * Latest credit_usage row per key fingerprint (null key = legacy rows).
 * Returns { keyColumn: false } when migration 0013 has not been applied.
 */
export async function getLatestCreditUsageByKey(): Promise<LatestCreditUsageByKey> {
  const db = getDb();
  try {
    const rows = await db
      .selectDistinctOn([creditUsage.keyId], {
        requestsRemaining: creditUsage.requestsRemaining,
        requestsUsed: creditUsage.requestsUsed,
        refreshCost: creditUsage.refreshCost,
        sportsFetched: creditUsage.sportsFetched,
        recordedAt: creditUsage.recordedAt,
        keyId: creditUsage.keyId,
      })
      .from(creditUsage)
      .orderBy(creditUsage.keyId, desc(creditUsage.recordedAt));
    const byKeyId = new Map<string | null, CreditUsageRow>();
    for (const r of rows) byKeyId.set(r.keyId, toCreditRow(r));
    return { keyColumn: true, byKeyId };
  } catch (err) {
    if (isUndefinedColumnErrorFor(err, "key_id")) return { keyColumn: false };
    throw err;
  }
}

/**
 * The latest row for key `id`. When id is the legacy key, legacy null-key
 * rows count too (whichever is more recent).
 */
export function latestRowForKey(
  byKeyId: Map<string | null, CreditUsageRow>,
  id: string,
  legacyId: string | null,
): CreditUsageRow | null {
  const own = byKeyId.get(id) ?? null;
  if (id !== legacyId) return own;
  const legacy = byKeyId.get(null) ?? null;
  if (!own) return legacy;
  if (!legacy) return own;
  return legacy.recordedAt.getTime() > own.recordedAt.getTime() ? legacy : own;
}

/**
 * The display name of whoever triggered the credit_usage row recorded at
 * exactly `recordedAt` (D-21) -- the same `now` a refresh commits its cache
 * rows' fetched_at with (see refresh.ts/refreshExtended.ts), so this names
 * the user who produced the odds/spreads-totals currently on screen. Never
 * selects email or password_hash (T-02-19). Returns null when there's no
 * matching row or it has no attributed user (CLI runs, legacy rows).
 */
export async function getSpendAttribution(recordedAt: Date): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ displayName: users.displayName })
    .from(creditUsage)
    .innerJoin(users, eq(creditUsage.triggeredByUserId, users.id))
    .where(eq(creditUsage.recordedAt, recordedAt))
    .orderBy(desc(creditUsage.id))
    .limit(1);
  return rows[0]?.displayName ?? null;
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
