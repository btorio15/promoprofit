/**
 * Server-only Postgres cache writer for the odds refresh pipeline
 * (ODDS-01/ODDS-02). replaceSportOdds is the only writer of cached_odds;
 * recordCreditUsage/getLatestCreditUsage are the only reader/writer pair for
 * the persisted credit meter (D-11's thresholds read the latest row, never
 * a fresh API call).
 */
import { desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cachedOdds, creditUsage } from "@/db/schema";
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
