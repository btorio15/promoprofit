/**
 * Live-DB smoke check for the promos/scrape_runs tables (T-03-03-03,
 * T-03-03-05). Confirms migration 0004 landed, then prints per-book scrape
 * status, live-promo count, per-status/review-reason breakdowns, and the 5
 * most recent scrape_runs rows. Never prints the DB connection secret.
 *
 * Usage: npm run promos:check
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { promos, scrapeRuns } from "../src/db/schema";
import { getActivePromos, getScrapeStatus } from "../src/db/promos";
import { SCRAPE_TARGET_BOOK_KEYS } from "../src/config/scrapeTargets";

async function main() {
  const db = getDb();

  const tableRows = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('promos', 'scrape_runs')`,
  );
  const foundTables = new Set(tableRows.rows.map((row) => String(row.table_name)));
  const hasPromos = foundTables.has("promos");
  const hasScrapeRuns = foundTables.has("scrape_runs");

  console.log(`promos table exists: ${hasPromos}`);
  console.log(`scrape_runs table exists: ${hasScrapeRuns}`);

  if (!hasPromos || !hasScrapeRuns) {
    console.error("promos:check failed -- one or both tables are missing. Has migration 0004 run?");
    process.exit(1);
  }

  const statusByBook = await getScrapeStatus(SCRAPE_TARGET_BOOK_KEYS);
  console.log(`Scrape status for ${SCRAPE_TARGET_BOOK_KEYS.length} target book(s):`);
  for (const bookKey of SCRAPE_TARGET_BOOK_KEYS) {
    const row = statusByBook.get(bookKey) ?? { lastOkAt: null, lastStatus: null };
    console.log(
      `  - ${bookKey}: lastOkAt=${row.lastOkAt ? row.lastOkAt.toISOString() : "none"}, lastStatus=${row.lastStatus ?? "none"}`,
    );
  }

  const activePromos = await getActivePromos(new Date());
  console.log(`Active (hedgeable) promos: ${activePromos.length}`);

  const statusCounts = await db
    .select({
      status: promos.status,
      reviewReason: promos.reviewReason,
      count: sql<string>`count(*)`,
    })
    .from(promos)
    .groupBy(promos.status, promos.reviewReason);
  console.log(`Promo counts by status/review_reason (${statusCounts.length} groups):`);
  for (const row of statusCounts) {
    console.log(`  - status=${row.status}, review_reason=${row.reviewReason ?? "none"}: ${row.count}`);
  }

  const recentRuns = await db
    .select({
      bookKey: scrapeRuns.bookKey,
      ranAt: scrapeRuns.ranAt,
      status: scrapeRuns.status,
      promosFound: scrapeRuns.promosFound,
      promosKept: scrapeRuns.promosKept,
      errorMessage: scrapeRuns.errorMessage,
    })
    .from(scrapeRuns)
    .orderBy(sql`${scrapeRuns.ranAt} desc`)
    .limit(5);
  console.log(`Most recent scrape_runs rows (${recentRuns.length}):`);
  for (const run of recentRuns) {
    console.log(
      `  - ${run.bookKey} @ ${run.ranAt.toISOString()}: ${run.status}, found=${run.promosFound}, kept=${run.promosKept}${run.errorMessage ? `, error=${run.errorMessage}` : ""}`,
    );
  }
}

main().catch((err) => {
  console.error("promos:check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
