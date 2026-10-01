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
import { withTimeout } from "../src/lib/withTimeout";

function emit(scrapeDone: boolean, observeDone: boolean) {
  console.log(`already-ran-today: scrape_done=${scrapeDone}`);
  console.log(`already-ran-today: observe_done=${observeDone}`);
  if (process.env.GITHUB_OUTPUT) {
    try {
      appendFileSync(process.env.GITHUB_OUTPUT, `scrape_done=${scrapeDone}\nobserve_done=${observeDone}\n`);
    } catch (err) {
      // Fail open: a missing output just means the workflow treats both as not done.
      console.error("already-ran-today: could not write GITHUB_OUTPUT:", err instanceof Error ? err.message : err);
    }
  }
}

const STATUS_TIMEOUT_MS = 30_000;

async function main() {
  let scrapeDone = false;
  let observeDone = false;
  try {
    ({ scrapeDone, observeDone } = await withTimeout(getDailyRunStatus(), STATUS_TIMEOUT_MS, "getDailyRunStatus"));
  } catch (err) {
    console.error("already-ran-today failed:", err instanceof Error ? err.message : err);
  }
  // Emit exactly once, outside the try, so a failure never duplicates output keys.
  emit(scrapeDone, observeDone);
  process.exit(0);
}

void main();
