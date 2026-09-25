/**
 * Upserts the Colorado book config (src/config/books.ts) into the books
 * table. With `--fixtures`, also upserts buildFixtureEvents(now) into
 * cached_odds so the finder works end-to-end before an Odds API key exists.
 *
 * Usage: npm run db:seed [-- --fixtures]
 */
import { getDb } from "../src/db/client";
import { books, cachedOdds } from "../src/db/schema";
import { COLORADO_BOOKS } from "../src/config/books";
import { buildFixtureEvents } from "../src/test/fixtures/oddsEvents";

async function seedBooks(): Promise<number> {
  const db = getDb();
  let count = 0;

  for (const book of COLORADO_BOOKS) {
    await db
      .insert(books)
      .values({
        key: book.key,
        displayName: book.displayName,
        region: book.region,
        apiCoverage: book.apiCoverage,
        tier: book.tier,
        sortOrder: book.sortOrder,
        note: book.note,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: books.key,
        set: {
          displayName: book.displayName,
          region: book.region,
          apiCoverage: book.apiCoverage,
          tier: book.tier,
          sortOrder: book.sortOrder,
          note: book.note,
          updatedAt: new Date(),
        },
      });
    count += 1;
  }

  return count;
}

async function seedFixtureOdds(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const events = buildFixtureEvents(now);
  let count = 0;

  for (const event of events) {
    await db
      .insert(cachedOdds)
      .values({
        eventId: event.id,
        sportKey: event.sport_key,
        commenceTime: new Date(event.commence_time),
        rawResponse: event,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cachedOdds.eventId,
        set: {
          sportKey: event.sport_key,
          commenceTime: new Date(event.commence_time),
          rawResponse: event as unknown as object,
          fetchedAt: now,
        },
      });
    count += 1;
  }

  return count;
}

async function main() {
  const withFixtures = process.argv.includes("--fixtures");

  const bookCount = await seedBooks();
  console.log(`Seeded ${bookCount} books.`);

  if (withFixtures) {
    const eventCount = await seedFixtureOdds();
    console.log(`Seeded ${eventCount} fixture odds events.`);
  } else {
    console.log("Skipped fixture odds seed (pass --fixtures to include demo odds).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
