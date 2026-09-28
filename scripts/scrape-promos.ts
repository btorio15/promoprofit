/**
 * CLI entry for the scheduled promo scraper (PROMO-03, D-07, D-08). Run by
 * .github/workflows/scrape-promos.yml on a schedule and by hand
 * (`npm run scrape:promos`). Loads `.env.local` via dotenv (a no-op when the
 * file doesn't exist, e.g. in CI where DATABASE_URL is already set from
 * `secrets.DATABASE_URL`) rather than `tsx --env-file`, since Node's
 * --env-file errors when the file is missing -- CI never has one.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runPromoScrape, scrapeExitCode } from "../src/ingestion/promos/run";

async function main() {
  const outcomes = await runPromoScrape();

  for (const outcome of outcomes) {
    console.log(JSON.stringify(outcome));
  }

  // quick-260928-it1: a per-book breakdown of how many uncertain entries
  // landed in the review queue this run, summed into a total summary line.
  const totalSentToReview = outcomes.reduce((sum, outcome) => sum + outcome.sentToReview, 0);
  console.log(`promos sent to review: ${totalSentToReview}`);
  for (const outcome of outcomes) {
    if (outcome.sentToReview > 0) {
      console.log(`  ${outcome.bookKey}: ${outcome.sentToReview}`);
    }
  }

  process.exit(scrapeExitCode(outcomes));
}

main().catch((err) => {
  console.error("scrape:promos failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
