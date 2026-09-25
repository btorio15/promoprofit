import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { books, cachedOdds } from "./schema";
import { OddsEventSchema, type OddsEvent } from "@/domain/odds/schemas";

export interface BookOption {
  key: string;
  displayName: string;
}

/** Books usable in the bonus-book dropdown (D-14): API-covered, free-tier, sort_order ASC. */
export async function getBonusBooks(): Promise<BookOption[]> {
  const db = getDb();
  const rows = await db
    .select({ key: books.key, displayName: books.displayName })
    .from(books)
    .where(and(eq(books.apiCoverage, true), eq(books.tier, "free")))
    .orderBy(books.sortOrder);
  return rows;
}

/** Every API-covered free-tier CO book key, usable as a hedge book (D-15). */
export async function getHedgeBookKeys(): Promise<string[]> {
  const bonusBooks = await getBonusBooks();
  return bonusBooks.map((b) => b.key);
}

async function getMaxFetchedAt(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ maxFetchedAt: sql<Date | null>`max(${cachedOdds.fetchedAt})` })
    .from(cachedOdds);
  return rows[0]?.maxFetchedAt ?? null;
}

/**
 * Cached events with commence_time in the future. fetchedAt is the max
 * fetched_at over ALL cached_odds rows (not just the filtered ones), so the
 * odds-age display reflects the last refresh even if every upcoming event
 * happens to share the same fetch batch. Rows that fail OddsEventSchema
 * parsing are dropped (and logged), never passed to the hedge engine.
 */
export async function getCachedEvents(): Promise<{ events: OddsEvent[]; fetchedAt: Date | null }> {
  const fetchedAt = await getMaxFetchedAt();
  if (fetchedAt === null) {
    return { events: [], fetchedAt: null };
  }

  const db = getDb();
  const rows = await db
    .select({ eventId: cachedOdds.eventId, rawResponse: cachedOdds.rawResponse })
    .from(cachedOdds)
    .where(gt(cachedOdds.commenceTime, new Date()));

  const events: OddsEvent[] = [];
  for (const row of rows) {
    const parsed = OddsEventSchema.safeParse(row.rawResponse);
    if (!parsed.success) {
      console.warn(`getCachedEvents: dropping invalid cached_odds row, event_id=${row.eventId}`);
      continue;
    }
    events.push(parsed.data);
  }

  return { events, fetchedAt };
}

/** max(fetched_at) from cached_odds; null if the table is empty. */
export async function getOddsFreshness(): Promise<Date | null> {
  return getMaxFetchedAt();
}
