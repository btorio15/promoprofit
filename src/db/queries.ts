import { and, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "./client";
import { cachedExtendedOdds, cachedOdds, userBooks } from "./schema";
import { usableOddsBooks } from "@/config/books";
import { OddsEventSchema, type OddsEvent } from "@/domain/odds/schemas";

export interface BookOption {
  key: string;
  displayName: string;
}

/**
 * Books usable in the bonus-book dropdown (D-14, D-13): API-covered,
 * free-tier, sort_order ASC. Read from src/config/books.ts via
 * usableOddsBooks() -- the SAME list runOddsRefresh fetches odds for --
 * never from the DB `books` mirror, so the dropdown, the hedge venues and
 * the refresh can't drift apart when the config changes without a re-seed
 * (WR-05). The DB `books` table is display/seed metadata only.
 *
 * When `allowedKeys` is provided (a user's saved book_key set), the result
 * is further restricted to usable ∩ allowed, still in config order -- this
 * is how D-13 scopes the bonus-book dropdown and hedge-book search to only
 * the books a user actually has, superseding Phase 1's D-14 "every usable
 * book" when a set is passed. Omitting the argument preserves the original
 * "every usable book" behavior unchanged.
 */
export async function getBonusBooks(allowedKeys?: ReadonlySet<string>): Promise<BookOption[]> {
  const usable = usableOddsBooks();
  const scoped = allowedKeys ? usable.filter((b) => allowedKeys.has(b.key)) : usable;
  return scoped.map((b) => ({ key: b.key, displayName: b.displayName }));
}

/**
 * Every hedge-book key usable as a hedge venue (D-15), optionally scoped to
 * a user's allowed keys the same way getBonusBooks is (D-14 superseded by
 * D-13 when a set is passed).
 */
export async function getHedgeBookKeys(allowedKeys?: ReadonlySet<string>): Promise<string[]> {
  const bonusBooks = await getBonusBooks(allowedKeys);
  return bonusBooks.map((b) => b.key);
}

/** A user's saved book_key selection (D-12), in whatever order Postgres returns rows. */
export async function getUserBookKeys(userId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ bookKey: userBooks.bookKey })
    .from(userBooks)
    .where(eq(userBooks.userId, userId));
  return rows.map((r) => r.bookKey);
}

/**
 * Replaces a user's entire book selection in one all-or-nothing db.batch
 * (a single Postgres transaction, following store.ts's
 * replaceSportStatements/db.batch idiom): delete every existing row for
 * userId, then insert the new set in the given order. The insert is
 * omitted when bookKeys is empty -- Drizzle rejects an empty `values([])`
 * array -- though SaveBooksInputSchema's min(1) means saveBooks never
 * calls this with an empty array in practice (D-09).
 */
export async function saveUserBooks(userId: number, bookKeys: readonly string[]): Promise<void> {
  const db = getDb();
  type Statement = BatchItem<"pg">;
  const statements: Statement[] = [db.delete(userBooks).where(eq(userBooks.userId, userId))];
  if (bookKeys.length > 0) {
    statements.push(db.insert(userBooks).values(bookKeys.map((bookKey) => ({ userId, bookKey }))));
  }
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
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
 * refresh -- e.g. a sport that dropped out of season -- are excluded rather
 * than ranked under a "just updated" label (WR-01). Refreshes commit
 * all-or-nothing, so a failed run never moves only some sports forward. The returned fetchedAt is therefore the true age of every
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

async function getMaxExtendedFetchedAt(): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({ maxFetchedAt: sql<string | Date | null>`max(${cachedExtendedOdds.fetchedAt})` })
    .from(cachedExtendedOdds);
  const raw = rows[0]?.maxFetchedAt ?? null;
  // neon-http returns raw sql`` aggregate values as strings, not Date
  // instances (unlike typed column selects) — normalize explicitly.
  if (raw === null) return null;
  return raw instanceof Date ? raw : new Date(raw);
}

/**
 * Cached spreads/totals events with commence_time in the future, restricted
 * to the most recent extended-refresh batch (fetched_at = max(fetched_at)
 * on cached_extended_odds only). This is a structural copy of
 * getCachedEvents against the independent D-16 table; it never reads or
 * writes cached_odds. Rows that fail OddsEventSchema parsing are dropped
 * (and logged), never passed to the arb engine. Returns
 * { events: [], fetchedAt: null } when the table is empty.
 */
export async function getCachedExtendedEvents(): Promise<{ events: OddsEvent[]; fetchedAt: Date | null }> {
  const fetchedAt = await getMaxExtendedFetchedAt();
  if (fetchedAt === null) {
    return { events: [], fetchedAt: null };
  }

  const db = getDb();
  const rows = await db
    .select({ eventId: cachedExtendedOdds.eventId, rawResponse: cachedExtendedOdds.rawResponse })
    .from(cachedExtendedOdds)
    .where(
      and(
        gt(cachedExtendedOdds.commenceTime, new Date()),
        sql`${cachedExtendedOdds.fetchedAt} = (select max(${cachedExtendedOdds.fetchedAt}) from ${cachedExtendedOdds})`,
      ),
    );

  const events: OddsEvent[] = [];
  for (const row of rows) {
    const parsed = OddsEventSchema.safeParse(row.rawResponse);
    if (!parsed.success) {
      console.warn(`getCachedExtendedEvents: dropping invalid cached_extended_odds row, event_id=${row.eventId}`);
      continue;
    }
    events.push(parsed.data);
  }

  return { events, fetchedAt };
}

/** max(fetched_at) from cached_extended_odds; null if the table is empty (D-16). */
export async function getExtendedOddsFreshness(): Promise<Date | null> {
  return getMaxExtendedFetchedAt();
}
