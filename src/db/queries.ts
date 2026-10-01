import { eq, gt, sql } from "drizzle-orm";
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
 * THE single "usable saved books" predicate (CR-02, WR-01): the user's
 * saved keys intersected with usableOddsBooks(), in config order. /,
 * /onboarding/books and /settings must all call this (not getUserBookKeys
 * directly) so their redirect/seed decisions can never disagree with each
 * other -- a saved key that has lost API/free-tier coverage (a "stale" key)
 * is silently excluded here rather than left to strand the user between
 * pages that disagree about whether they have usable books.
 */
export async function getUsableUserBooks(userId: number): Promise<BookOption[]> {
  const savedKeys = await getUserBookKeys(userId);
  return getBonusBooks(new Set(savedKeys));
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

/**
 * quick-261001-jbc: normalizes a raw sql`` aggregate value to a Date.
 * neon-http returns raw aggregate values as strings, not Date instances
 * (unlike typed column selects).
 */
export function toDateOrNull(raw: string | Date | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;
  return raw instanceof Date ? raw : new Date(raw);
}

/**
 * Pure: parses cached rows into events plus each event's OWN fetched_at.
 * Rows failing OddsEventSchema are dropped (and logged) and absent from the
 * map, never passed to the hedge engine.
 */
export function collectCachedEventRows(
  rows: { eventId: string; rawResponse: unknown; fetchedAt: Date | string }[],
  label: string,
): { events: OddsEvent[]; fetchedAtByEventId: Map<string, Date> } {
  const events: OddsEvent[] = [];
  const fetchedAtByEventId = new Map<string, Date>();
  for (const row of rows) {
    const parsed = OddsEventSchema.safeParse(row.rawResponse);
    if (!parsed.success) {
      console.warn(`${label}: dropping invalid cached row, event_id=${row.eventId}`);
      continue;
    }
    events.push(parsed.data);
    const at = toDateOrNull(row.fetchedAt);
    if (at !== null) fetchedAtByEventId.set(row.eventId, at);
  }
  return { events, fetchedAtByEventId };
}

export interface CachedEventsResult {
  events: OddsEvent[];
  fetchedAt: Date | null;
  /** Each event's own fetched_at (optional so existing mocks keep compiling). */
  fetchedAtByEventId?: ReadonlyMap<string, Date>;
}

/**
 * The OLDEST live (not yet started) row's fetched_at, falling back to the
 * table-wide max so it is null only when the table is empty. After a full
 * refresh this equals max(fetched_at); after a per-sport promo refresh it
 * honestly reports the oldest prices still on screen. `now()` is evaluated
 * in SQL -- no JS Date is interpolated into the neon-http template.
 */
async function getOldestLiveFetchedAt(table: typeof cachedOdds | typeof cachedExtendedOdds): Promise<Date | null> {
  const db = getDb();
  const rows = await db
    .select({
      age: sql<
        string | Date | null
      >`coalesce(min(${table.fetchedAt}) filter (where ${table.commenceTime} > now()), max(${table.fetchedAt}))`,
    })
    .from(table);
  return toDateOrNull(rows[0]?.age);
}

/**
 * Cached events with commence_time in the future. Full commits (commitOddsRefresh,
 * commitSpreadsTotalsRefresh) purge older rows atomically, so the cache holds a
 * single batch after a full refresh; per-sport promo refreshes deliberately
 * leave other sports' rows with their own fetched_at, reported per event in
 * fetchedAtByEventId. fetchedAt is the OLDEST live row's time. Rows that fail
 * OddsEventSchema parsing are dropped (and logged), never passed to the hedge
 * engine.
 */
export async function getCachedEvents(): Promise<CachedEventsResult> {
  const fetchedAt = await getOldestLiveFetchedAt(cachedOdds);
  if (fetchedAt === null) {
    return { events: [], fetchedAt: null };
  }

  const db = getDb();
  const rows = await db
    .select({ eventId: cachedOdds.eventId, rawResponse: cachedOdds.rawResponse, fetchedAt: cachedOdds.fetchedAt })
    .from(cachedOdds)
    .where(gt(cachedOdds.commenceTime, new Date()));

  const { events, fetchedAtByEventId } = collectCachedEventRows(rows, "getCachedEvents");
  return { events, fetchedAt, fetchedAtByEventId };
}

/** Oldest live row's fetched_at from cached_odds; null if the table is empty. */
export async function getOddsFreshness(): Promise<Date | null> {
  return getOldestLiveFetchedAt(cachedOdds);
}

/**
 * Cached spreads/totals events with commence_time in the future: a structural
 * copy of getCachedEvents against the independent D-16 table; it never reads
 * or writes cached_odds. Returns { events: [], fetchedAt: null } when the
 * table is empty.
 */
export async function getCachedExtendedEvents(): Promise<CachedEventsResult> {
  const fetchedAt = await getOldestLiveFetchedAt(cachedExtendedOdds);
  if (fetchedAt === null) {
    return { events: [], fetchedAt: null };
  }

  const db = getDb();
  const rows = await db
    .select({
      eventId: cachedExtendedOdds.eventId,
      rawResponse: cachedExtendedOdds.rawResponse,
      fetchedAt: cachedExtendedOdds.fetchedAt,
    })
    .from(cachedExtendedOdds)
    .where(gt(cachedExtendedOdds.commenceTime, new Date()));

  const { events, fetchedAtByEventId } = collectCachedEventRows(rows, "getCachedExtendedEvents");
  return { events, fetchedAt, fetchedAtByEventId };
}

/** Oldest live row's fetched_at from cached_extended_odds; null if the table is empty (D-16). */
export async function getExtendedOddsFreshness(): Promise<Date | null> {
  return getOldestLiveFetchedAt(cachedExtendedOdds);
}
