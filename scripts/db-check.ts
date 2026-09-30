/**
 * Prints the current bonus-book list and cached-odds freshness/count.
 * Exits 1 if there are 0 books (i.e. `npm run db:seed` has not run yet).
 *
 * Usage: npm run db:check
 */
import { isNotNull, count } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { books as booksTable, users, invites, userBooks, promos } from "../src/db/schema";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents } from "../src/db/queries";

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

  const { events: extendedEvents, fetchedAt: extendedFetchedAt } = await getCachedExtendedEvents();
  console.log(
    `Cached spreads/totals events (commence_time in future): ${extendedEvents.length}, fetched_at: ${
      extendedFetchedAt ? extendedFetchedAt.toISOString() : "none (table empty)"
    }`,
  );

  if (seededRows.length === 0) {
    console.error("No books found — run `npm run db:seed` first.");
    process.exit(1);
  }

  // Phase 2: proves the 0003 migration's tables exist on the live DB.
  const userRows = await getDb().select({ id: users.id }).from(users);
  console.log(`Users: ${userRows.length}`);

  const inviteRows = await getDb().select({ id: invites.id }).from(invites);
  console.log(`Invites: ${inviteRows.length}`);

  const userBookRows = await getDb().select({ userId: userBooks.userId }).from(userBooks);
  console.log(`User books: ${userBookRows.length}`);

  // Phase 5: proves the 0010 migration's promos.added_by_user_id column exists.
  await getDb()
    .select({ id: promos.id, addedByUserId: promos.addedByUserId })
    .from(promos)
    .limit(1);
  console.log("promos.added_by_user_id: ok");
  const [owned] = await getDb()
    .select({ n: count() })
    .from(promos)
    .where(isNotNull(promos.addedByUserId));
  console.log(`Promos with added_by_user_id set: ${owned?.n ?? 0}`);
}

main().catch((err) => {
  console.error("db:check failed:", err);
  process.exit(1);
});
