import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import { promos, scrapeRuns } from "./schema";

export interface ScrapeStatusRow {
  lastOkAt: Date | null;
  lastStatus: "ok" | "failed" | null;
}

/**
 * Per-book scrape freshness (D-08): for each of `bookKeys`, the most recent
 * OK run's ran_at and the latest run's own status (which may itself be a
 * failure even when an earlier run succeeded). Books with no scrape_runs
 * rows at all map to { lastOkAt: null, lastStatus: null } -- the
 * "never scraped" state getPromos turns into "not scraped yet".
 */
export async function getScrapeStatus(
  bookKeys: readonly string[],
): Promise<Map<string, ScrapeStatusRow>> {
  const result = new Map<string, ScrapeStatusRow>();
  for (const key of bookKeys) {
    result.set(key, { lastOkAt: null, lastStatus: null });
  }
  if (bookKeys.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      bookKey: scrapeRuns.bookKey,
      lastOkAt: sql<string | Date | null>`max(${scrapeRuns.ranAt}) filter (where ${scrapeRuns.status} = 'ok')`,
      lastStatus: sql<string | null>`(array_agg(${scrapeRuns.status} order by ${scrapeRuns.ranAt} desc))[1]`,
    })
    .from(scrapeRuns)
    .where(inArray(scrapeRuns.bookKey, [...bookKeys]))
    .groupBy(scrapeRuns.bookKey);

  for (const row of rows) {
    // neon-http returns raw sql`` aggregate values as strings, not Date
    // instances (mirrors src/db/queries.ts's getMaxFetchedAt normalization).
    const lastOkAt =
      row.lastOkAt === null ? null : row.lastOkAt instanceof Date ? row.lastOkAt : new Date(row.lastOkAt);
    const lastStatus = row.lastStatus === "ok" || row.lastStatus === "failed" ? row.lastStatus : null;
    result.set(row.bookKey, { lastOkAt, lastStatus });
  }

  return result;
}

/**
 * Count of promos currently hedgeable: status active, not past its own
 * expires_at (when set), and not past its matched event's commence_time
 * (when set). Drives getPromos's "none-scraped" vs "no-active" empty-state
 * split.
 */
export async function countLivePromos(now: Date): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(promos)
    .where(
      and(
        eq(promos.status, "active"),
        or(isNull(promos.expiresAt), gt(promos.expiresAt, now)),
        or(isNull(promos.eventCommenceTime), gt(promos.eventCommenceTime, now)),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}
