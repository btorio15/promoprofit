/**
 * CLI entry for the scheduled promo scraper (PROMO-03, D-07, D-08). Run by
 * .github/workflows/scrape-promos.yml on a schedule and by hand
 * (`npm run scrape:promos`). Loads `.env.local` via dotenv (a no-op when the
 * file doesn't exist, e.g. in CI where DATABASE_URL is already set from
 * `secrets.DATABASE_URL`) rather than `tsx --env-file`, since Node's
 * --env-file errors when the file is missing -- CI never has one.
 *
 * quick-260928-kc5: `--no-reader` disables the Claude Haiku 4.5 promo
 * reader for this run (pattern parsers only); otherwise a reader is built
 * only when ANTHROPIC_API_KEY is set (createDefaultPromoReader), so a repo
 * with no key configured behaves exactly as before this quick task.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import Decimal from "decimal.js";
import { runPromoScrape, scrapeExitCode } from "../src/ingestion/promos/run";
import { createDefaultPromoReader } from "../src/ingestion/promos/promoReader";
import { PROMO_READER_PROMPT_VERSION } from "../src/ingestion/promos/promoReading";

const READER_MAX_CALLS = 60;
/** $1/MTok input, $5/MTok output -- Claude Haiku 4.5 published pricing. */
const INPUT_USD_PER_TOKEN = new Decimal("1").dividedBy(1_000_000);
const OUTPUT_USD_PER_TOKEN = new Decimal("5").dividedBy(1_000_000);

function estimatedUsd(inputTokens: number, outputTokens: number): string {
  const cost = new Decimal(inputTokens)
    .times(INPUT_USD_PER_TOKEN)
    .plus(new Decimal(outputTokens).times(OUTPUT_USD_PER_TOKEN));
  return cost.toFixed(4);
}

async function main() {
  const noReader = process.argv.includes("--no-reader");

  const reader = noReader ? null : createDefaultPromoReader({ maxCalls: READER_MAX_CALLS });
  if (noReader) {
    console.log("promo reader: disabled (--no-reader) -- pattern parsers only");
  } else if (reader === null) {
    console.log("promo reader: disabled (ANTHROPIC_API_KEY not set) -- pattern parsers only");
  } else {
    console.log(`promo reader: claude-haiku-4-5, prompt ${PROMO_READER_PROMPT_VERSION}, cap ${READER_MAX_CALLS} calls`);
  }

  const outcomes = await runPromoScrape({ reader });

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

  // quick-260928-kc5: a total reader-usage line, only when a reader ran --
  // scrapeExitCode never looks at any of this, so a reader-heavy run can
  // never turn an otherwise-green Actions run red.
  if (reader) {
    const totals = outcomes.reduce(
      (acc, outcome) => {
        const stats = outcome.reader;
        if (!stats) return acc;
        return {
          calls: acc.calls + stats.calls,
          cacheHits: acc.cacheHits + stats.cacheHits,
          fallbacks: acc.fallbacks + stats.fallbacks,
          disagreements: acc.disagreements + stats.disagreements,
          clearSkipOverrides: acc.clearSkipOverrides + stats.clearSkipOverrides,
          rescuesWithoutAmount: acc.rescuesWithoutAmount + stats.rescuesWithoutAmount,
          inputTokens: acc.inputTokens + stats.inputTokens,
          outputTokens: acc.outputTokens + stats.outputTokens,
        };
      },
      {
        calls: 0,
        cacheHits: 0,
        fallbacks: 0,
        disagreements: 0,
        clearSkipOverrides: 0,
        rescuesWithoutAmount: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    );
    console.log(
      `promo reader usage: calls=${totals.calls} cacheHits=${totals.cacheHits} fallbacks=${totals.fallbacks} disagreements=${totals.disagreements} clearSkipOverrides=${totals.clearSkipOverrides} rescuesWithoutAmount=${totals.rescuesWithoutAmount} inputTokens=${totals.inputTokens} outputTokens=${totals.outputTokens} estCost=$${estimatedUsd(totals.inputTokens, totals.outputTokens)}`,
    );
  }

  process.exit(scrapeExitCode(outcomes));
}

main().catch((err) => {
  console.error("scrape:promos failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
