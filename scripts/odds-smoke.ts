/**
 * ODDS-05 live verification: confirms every free-tier Colorado bookmaker key
 * (including espnbet = theScore Bet) actually returns data from a live Odds
 * API call, and that the paid-only keys (williamhill_us/Caesars, fanatics)
 * are absent, confirming D-16.
 *
 * Usage: npm run odds:smoke [--extended] [sportKey]
 * If no sportKey is given, uses the first in-season D-01 sport. --extended
 * requests markets=h2h,spreads,totals (D-13/D-14) against only the 7
 * free-tier books and additionally checks that spreads/totals come back
 * with usable half-point lines (D-08).
 */
import { listSports, fetchSportOdds } from "../src/ingestion/odds/client";
import { COLORADO_BOOKS, smokeTestBookKeys, usableOddsBooks } from "../src/config/books";
import { SPORT_KEYS } from "../src/config/sports";
import { isHalfPoint } from "../src/domain/hedge/spreadsTotalsFilter";

const WINDOW_DAYS = 7;
const EXTENDED_MARKETS = ["h2h", "spreads", "totals"] as const;

async function main() {
  const argv = process.argv.slice(2);
  const extended = argv.includes("--extended");
  const requestedSport = argv.find((a) => !a.startsWith("--"));

  const sports = await listSports();
  const activeD01 = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));

  console.log(`Active D-01 sports (${activeD01.length}/${SPORT_KEYS.length}):`);
  for (const s of activeD01) {
    console.log(`  - ${s.key} (${s.title})`);
  }

  const sportKey = requestedSport ?? activeD01[0]?.key;

  if (!sportKey) {
    console.error(
      "\nNo in-season D-01 sport found and no sportKey given as an argument. Cannot run the smoke test right now.",
    );
    process.exit(1);
    return;
  }

  console.log(`\nFetching odds for sport: ${sportKey}${extended ? " (extended: h2h+spreads+totals)" : ""}`);

  const now = new Date();
  const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  if (extended) {
    const bookmakerKeys = usableOddsBooks().map((b) => b.key); // 7 free-tier keys, 1 region-group, 3 credits/sport
    const { events, quota } = await fetchSportOdds(sportKey, {
      bookmakerKeys,
      commenceTimeFrom: now,
      commenceTimeTo: to,
      markets: EXTENDED_MARKETS,
    });

    console.log(`\nEvents returned: ${events.length}`);

    let spreadsBooks = 0;
    let totalsBooks = 0;
    let spreadsHalfPoint = 0;
    let totalsHalfPoint = 0;

    for (const event of events) {
      for (const bookmaker of event.bookmakers) {
        const spreadsMarket = bookmaker.markets.find((m) => m.key === "spreads");
        if (spreadsMarket) {
          spreadsBooks += 1;
          if (spreadsMarket.outcomes.some((o) => isHalfPoint(o.point))) spreadsHalfPoint += 1;
        }
        const totalsMarket = bookmaker.markets.find((m) => m.key === "totals");
        if (totalsMarket) {
          totalsBooks += 1;
          if (totalsMarket.outcomes.some((o) => isHalfPoint(o.point))) totalsHalfPoint += 1;
        }
      }
    }

    console.log(`\nSpreads: ${spreadsBooks} bookmaker(s) returned the market, ${spreadsHalfPoint} with a half-point line`);
    console.log(`Totals: ${totalsBooks} bookmaker(s) returned the market, ${totalsHalfPoint} with a half-point line`);
    console.log(`\nQuota: remaining=${quota.remaining} used=${quota.used} last=${quota.last}`);

    if (events.length > 0 && spreadsHalfPoint === 0 && totalsHalfPoint === 0) {
      console.error(
        "\nNo bookmaker returned a spreads or totals outcome with a numeric half-point line. Re-run against " +
          "another sport before concluding something is wrong, e.g.:\n" +
          "  npm run odds:smoke -- --extended basketball_nba",
      );
      process.exit(1);
      return;
    }

    console.log("\nExtended smoke test passed.");
    process.exit(0);
    return;
  }

  const bookmakerKeys = smokeTestBookKeys(); // free-tier + paid-only, still 1 credit (<=10 keys)

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
