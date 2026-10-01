/**
 * CLI entry for the GitHub backup schedule's "did the morning run already
 * happen?" check (phase 05.1, D-07/D-08). Writes scrape_done / observe_done
 * to $GITHUB_OUTPUT so the workflow can gate its steps. Read-only: only
 * scrape_runs and credit_usage are read; no Odds API credits are spent.
 * Fails open (both false, exit 0) so the backup run proceeds as normal.
 *
 * Usage: npm run scrape:already-ran-today
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { appendFileSync } from "node:fs";
import { getDailyRunStatus } from "../src/db/dailyRunStatus";

function emit(scrapeDone: boolean, observeDone: boolean) {
  console.log(`already-ran-today: scrape_done=${scrapeDone}`);
  console.log(`already-ran-today: observe_done=${observeDone}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `scrape_done=${scrapeDone}\nobserve_done=${observeDone}\n`);
  }
}

async function main() {
  const { scrapeDone, observeDone } = await getDailyRunStatus();
  emit(scrapeDone, observeDone);
  process.exit(0);
}

main().catch((err) => {
  console.error("already-ran-today failed:", err instanceof Error ? err.message : err);
  emit(false, false);
  process.exit(0);
});
