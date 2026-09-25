/**
 * CLI wrapper for runOddsRefresh -- an explicit, user-run command, never a
 * schedule (ODDS-01). Mirrors the refreshOdds server action's outcome
 * handling for use outside the browser.
 *
 * Usage: npm run odds:refresh [-- --yes]
 */
import { runOddsRefresh } from "../src/ingestion/odds/refresh";

async function main() {
  const confirmed = process.argv.includes("--yes");
  const outcome = await runOddsRefresh({ confirmed });

  console.log(JSON.stringify(outcome, null, 2));

  switch (outcome.status) {
    case "ok":
      process.exit(0);
      break;
    case "confirm_required":
      console.error(
        `Refreshed ${outcome.minutesSinceLastRefresh} min ago; re-run with --yes to spend ~${outcome.estimatedCredits} credits`,
      );
      process.exit(2);
      break;
    case "busy":
      console.error(outcome.message);
      process.exit(1);
      break;
    case "blocked":
    case "error":
      process.exit(1);
      break;
  }
}

main().catch((err) => {
  console.error("odds:refresh failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
