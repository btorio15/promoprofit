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

import { runPromoScrape } from "../src/ingestion/promos/run";

async function main() {
  const outcomes = await runPromoScrape();

  for (const outcome of outcomes) {
    console.log(JSON.stringify(outcome));
  }

  const anyFailed = outcomes.some((o) => o.status === "failed");
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("scrape:promos failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
