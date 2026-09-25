/**
 * Prints the current bonus-book list and cached-odds freshness/count.
 * Exits 1 if there are 0 books (i.e. `npm run db:seed` has not run yet).
 *
 * Usage: npm run db:check
 */
import { getDb } from "../src/db/client";
import { books as booksTable } from "../src/db/schema";
import { getBonusBooks, getCachedEvents } from "../src/db/queries";

async function main() {
  // getBonusBooks reads the config (WR-05); count the DB mirror directly
  // so this still detects an un-seeded database.
  const seededRows = await getDb().select({ key: booksTable.key }).from(booksTable);
  const books = await getBonusBooks();
  console.log(`Bonus books (${books.length}), seeded books rows: ${seededRows.length}:`);
  for (const book of books) {
    console.log(`  - ${book.key}: ${book.displayName}`);
  }

  const { events, fetchedAt } = await getCachedEvents();
  console.log(
    `Cached events (commence_time in future): ${events.length}, fetched_at: ${
      fetchedAt ? fetchedAt.toISOString() : "none (table empty)"
    }`,
  );

  if (seededRows.length === 0) {
    console.error("No books found — run `npm run db:seed` first.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("db:check failed:", err);
  process.exit(1);
});
