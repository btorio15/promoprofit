import { and, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import { cachedOdds } from "./schema";
import { usableOddsBooks } from "@/config/books";
import { OddsEventSchema, type OddsEvent } from "@/domain/odds/schemas";

export interface BookOption {
  key: string;
  displayName: string;
}

/**
 * Books usable in the bonus-book dropdown (D-14): API-covered, free-tier,
 * sort_order ASC. Read from src/config/books.ts via usableOddsBooks() --
 * the SAME list runOddsRefresh fetches odds for -- never from the DB
 * `books` mirror, so the dropdown, the hedge venues and the refresh can't
 * drift apart when the config changes without a re-seed (WR-05). The DB
 * `books` table is display/seed metadata only.
 */
export async function getBonusBooks(): Promise<BookOption[]> {
  return usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
}

/** Every API-covered free-tier CO book key, usable as a hedge book (D-15). */
export async function getHedgeBookKeys(): Promise<string[]> {
  const bonusBooks = await getBonusBooks();
  return bonusBooks.map((b) => b.key);
}

async function getMaxFetchedAt(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ maxFetchedAt: sql<string | Date | null>`max(${cachedOdds.fetchedAt})` })
    .from(cachedOdds);
  const raw = rows[0]?.maxFetchedAt ?? null;
  // neon-http returns raw sql`` aggregate values as strings, not Date
  // instances (unlike typed column selects) — normalize explicitly.
  if (raw === null) return null;
  return raw instanceof Date ? raw : new Date(raw);
}

/**
 * Cached events with commence_time in the future, restricted to the most
 * recent refresh batch (fetched_at = max(fetched_at)). Every row a refresh
 * writes shares that run's timestamp, so rows left over from an earlier
 * refresh -- a sport whose fetch failed mid-run, or one that dropped out of
 * season -- are excluded rather than ranked under a "just updated" label
 * (WR-01). The returned fetchedAt is therefore the true age of every
 * returned event. Rows that fail OddsEventSchema parsing are dropped (and
 * logged), never passed to the hedge engine.
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
    .where(
      and(
        gt(cachedOdds.commenceTime, new Date()),
        sql`${cachedOdds.fetchedAt} = (select max(${cachedOdds.fetchedAt}) from ${cachedOdds})`,
      ),
    );

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
