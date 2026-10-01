import { desc, eq, isNull, max } from "drizzle-orm";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { denverDate } from "@/domain/promos/profitTotals";
import { getDb } from "./client";
import { creditUsage, scrapeRuns } from "./schema";

/**
 * Phase 05.1 (D-07, D-08): "did today's morning work already happen?" for the
 * GitHub backup schedule. Reads only existing tables (scrape_runs,
 * credit_usage) -- no new table, no migration, no Odds API credits.
 *
 * Scheduled morning refreshes write credit_usage rows with a NULL user while
 * user-clicked refreshes carry a user id, so only NULL-user rows mean "the
 * morning observe already ran". A manual owner CLI odds:refresh (also NULL
 * user) would also count, which is acceptable.
 *
 * "Today" is the America/Denver calendar day, compared in JS via denverDate
 * (never timezone math in SQL).
 */
export type DailyRunStatus = { scrapeDone: boolean; observeDone: boolean };

export function decideDailyRunStatus(input: {
  targetBookKeys: readonly string[];
  latestOkScrapeAtByBook: Readonly<Record<string, Date>>;
  latestScheduledRefreshAt: Date | null;
  now: Date;
}): DailyRunStatus {
  const today = denverDate(input.now);
  // Skip the scrape only when EVERY targeted book scraped ok today; a partial
  // failure leaves this false so the backup re-scrapes all books.
  const scrapeDone =
    input.targetBookKeys.length > 0 &&
    input.targetBookKeys.every((key) => {
      const at = input.latestOkScrapeAtByBook[key];
      return at !== undefined && denverDate(at) === today;
    });
  const observeDone =
    input.latestScheduledRefreshAt !== null && denverDate(input.latestScheduledRefreshAt) === today;
  return { scrapeDone, observeDone };
}

export async function getDailyRunStatus(now: Date = new Date()): Promise<DailyRunStatus> {
  const db = getDb();

  const scrapeRows = await db
    .select({ bookKey: scrapeRuns.bookKey, ranAt: max(scrapeRuns.ranAt) })
    .from(scrapeRuns)
    .where(eq(scrapeRuns.status, "ok"))
    .groupBy(scrapeRuns.bookKey);

  const latestOkScrapeAtByBook: Record<string, Date> = {};
  for (const row of scrapeRows) {
    if (row.ranAt === null || row.ranAt === undefined) continue;
    latestOkScrapeAtByBook[row.bookKey] = row.ranAt instanceof Date ? row.ranAt : new Date(row.ranAt);
  }

  const refreshRows = await db
    .select({ recordedAt: creditUsage.recordedAt })
    .from(creditUsage)
    .where(isNull(creditUsage.triggeredByUserId))
    .orderBy(desc(creditUsage.recordedAt))
    .limit(1);

  return decideDailyRunStatus({
    targetBookKeys: SCRAPE_TARGET_BOOK_KEYS,
    latestOkScrapeAtByBook,
    latestScheduledRefreshAt: refreshRows[0]?.recordedAt ?? null,
    now,
  });
}
