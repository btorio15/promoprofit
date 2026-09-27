"use server";

import { requireUser } from "@/lib/session";
import { COLORADO_BOOKS } from "@/config/books";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { PromosInputSchema } from "@/domain/promos/promosInput";
import type { GetPromosResponse, ScrapeStatusLineDTO } from "@/domain/promos/dto";
import { countLivePromos, getScrapeStatus } from "@/db/promos";

/**
 * Per-book scrape status and the Promos tab's empty-state variant (D-08,
 * T-03-03-01/02). requireUser() is the literal first statement -- a
 * logged-out call redirects before any DB read, mirroring
 * save-books.ts's "user id comes ONLY from the session" discipline --
 * before PromosInputSchema.safeParse, before getScrapeStatus/countLivePromos.
 */
export async function getPromos(input: unknown): Promise<GetPromosResponse> {
  await requireUser();

  const parsed = PromosInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const targetBooks = COLORADO_BOOKS.filter((book) => SCRAPE_TARGET_BOOK_KEYS.includes(book.key)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const statusByBook = await getScrapeStatus(SCRAPE_TARGET_BOOK_KEYS);

  const scrapeStatus: ScrapeStatusLineDTO[] = targetBooks.map((book) => {
    const row = statusByBook.get(book.key) ?? { lastOkAt: null, lastStatus: null };
    return {
      bookKey: book.key,
      bookName: book.displayName,
      lastOkAt: row.lastOkAt ? row.lastOkAt.toISOString() : null,
      lastRunFailed: row.lastStatus === "failed",
    };
  });

  const hasAnyOkRun = scrapeStatus.some((line) => line.lastOkAt !== null);
  const liveCount = await countLivePromos(new Date());

  const emptyVariant = liveCount > 0 ? null : hasAnyOkRun ? "no-active" : "none-scraped";

  return { status: "ok", scrapeStatus, emptyVariant };
}
