/**
 * CLI entry for the once-daily morning odds refresh + profit-observation
 * recording (quick-260927-n12 owner scope change B). Run as its own step
 * in .github/workflows/scrape-promos.yml, gated to the 8am America/Denver
 * scheduled run (the workflow's other two runs, noon/5pm, must not spend a
 * refresh). Loads .env.local via dotenv (a no-op when the file doesn't
 * exist, e.g. in CI) rather than `tsx --env-file`, mirroring
 * scripts/scrape-promos.ts.
 *
 * Usage: npm run odds:morning-observe [-- --force]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { runMorningObservation } from "../src/ingestion/odds/morningObserve";

async function main() {
  const force = process.argv.includes("--force");
  const result = await runMorningObservation({ force });

  if (result.status === "skipped") {
    console.log(`odds:morning-observe: skipped (${result.reason})`);
    process.exit(0);
  }

  console.log("odds:morning-observe: refresh outcome", JSON.stringify(result.refreshOutcome));
  console.log("odds:morning-observe: recorded profit observations from cached odds");
  process.exit(0);
}

main().catch((err) => {
  console.error("odds:morning-observe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
