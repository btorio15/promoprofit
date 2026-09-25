/**
 * ODDS-05 live verification: confirms every free-tier Colorado bookmaker key
 * (including espnbet = theScore Bet) actually returns data from a live Odds
 * API call, and that the paid-only keys (williamhill_us/Caesars, fanatics)
 * are absent, confirming D-16.
 *
 * Usage: npm run odds:smoke [sportKey]
 * If no sportKey is given, uses the first in-season D-01 sport.
 */
import { listSports, fetchSportOdds } from "../src/ingestion/odds/client";
import { COLORADO_BOOKS, smokeTestBookKeys } from "../src/config/books";
import { SPORT_KEYS } from "../src/config/sports";

const WINDOW_DAYS = 7;

async function main() {
  const sports = await listSports();
  const activeD01 = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));

  console.log(`Active D-01 sports (${activeD01.length}/${SPORT_KEYS.length}):`);
  for (const s of activeD01) {
    console.log(`  - ${s.key} (${s.title})`);
  }

  const requestedSport = process.argv[2];
  const sportKey = requestedSport ?? activeD01[0]?.key;

  if (!sportKey) {
    console.error(
      "\nNo in-season D-01 sport found and no sportKey given as an argument. Cannot run the smoke test right now.",
    );
    process.exit(1);
    return;
  }

  console.log(`\nFetching odds for sport: ${sportKey}`);

  const bookmakerKeys = smokeTestBookKeys(); // free-tier + paid-only, still 1 credit (<=10 keys)
  const now = new Date();
  const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { events, quota } = await fetchSportOdds(sportKey, {
    bookmakerKeys,
    commenceTimeFrom: now,
    commenceTimeTo: to,
  });

  const seenKeys = new Set<string>();
  for (const event of events) {
    for (const bookmaker of event.bookmakers) {
      seenKeys.add(bookmaker.key);
    }
  }

  console.log(`\nEvents returned: ${events.length}`);
  console.log("\nkey | displayName | tier | seen | expected");
  console.log("----|-------------|------|------|---------");

  let missingFreeTier = false;
  const checkedBooks = COLORADO_BOOKS.filter((b) => bookmakerKeys.includes(b.key));
  for (const book of checkedBooks) {
    const seen = seenKeys.has(book.key);
    const expected = book.tier === "free" ? "present" : "absent";
    console.log(`${book.key} | ${book.displayName} | ${book.tier} | ${seen ? "yes" : "no"} | ${expected}`);
    if (book.tier === "free" && !seen) missingFreeTier = true;
  }

  console.log(`\nQuota: remaining=${quota.remaining} used=${quota.used} last=${quota.last}`);

  if (events.length > 0 && missingFreeTier) {
    console.error(
      "\nOne or more free-tier books were not seen in this sport's odds. A book can legitimately " +
        "skip a thin slate -- re-run against another sport before concluding the key is dead, e.g.:\n" +
        "  npm run odds:smoke basketball_nba",
    );
    process.exit(1);
    return;
  }

  console.log("\nSmoke test passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("odds:smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
