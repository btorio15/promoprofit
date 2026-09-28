/**
 * quick-260928-kc5: opt-in LIVE smoke run for the Claude Haiku 4.5 promo
 * reader -- makes one real, metered call to the Anthropic API. Lives under
 * scripts/ (not src/) so vitest never collects it and no CI job runs it
 * automatically. Run by hand: `npm run promos:reader-smoke`.
 *
 * Never touches the DB -- uses an in-memory Map cache, never
 * readerCache.ts/promoReadingCache -- so this script is safe to run without
 * DATABASE_URL set.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Decimal from "decimal.js";
import Anthropic from "@anthropic-ai/sdk";
import { draftkingsScraper } from "../src/ingestion/promos/books/draftkings";
import { createPromoReader, type PromoReadingCache } from "../src/ingestion/promos/promoReader";
import { readerText } from "../src/ingestion/promos/promoReading";
import { guardReading } from "../src/ingestion/promos/verbatimGuard";
import { reconcileEntry } from "../src/ingestion/promos/reconcile";

const INPUT_USD_PER_TOKEN = new Decimal("1").dividedBy(1_000_000);
const OUTPUT_USD_PER_TOKEN = new Decimal("5").dividedBy(1_000_000);

function estimatedUsd(inputTokens: number, outputTokens: number): string {
  return new Decimal(inputTokens)
    .times(INPUT_USD_PER_TOKEN)
    .plus(new Decimal(outputTokens).times(OUTPUT_USD_PER_TOKEN))
    .toFixed(4);
}

function inMemoryCache(): PromoReadingCache {
  const store = new Map<string, unknown>();
  return {
    async get(contentHash) {
      return store.get(contentHash) ?? null;
    },
    async put(row) {
      store.set(row.contentHash, row.reading);
    },
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY not set -- skipping live smoke");
    process.exit(0);
  }

  const fixturePath = join(process.cwd(), "src/test/fixtures/promos/draftkings-promos-2026-09-28.json");
  const listBody = readFileSync(fixturePath, "utf-8");
  const sourceUrl = "https://api.draftkings.com/en/api/promotions/v3/promotions/query";
  const now = new Date("2026-09-28T12:00:00.000Z");

  const parseResult = draftkingsScraper.parse({ listBody, detailBodies: {} }, { now, sourceUrl });
  const candidate = parseResult.candidates.find((c) => c.externalId === "1125873");
  if (!candidate) {
    console.error("smoke: candidate 1125873 not found in the fixture -- aborting");
    process.exit(1);
  }

  const text = readerText(candidate.title, candidate.rawText);
  const client = new Anthropic({ timeout: 30_000, maxRetries: 2 });
  const reader = createPromoReader({ client, cache: inMemoryCache(), maxCalls: 2 });

  const first = await reader.read({ bookKey: "draftkings", text });
  console.log("First read source:", first.source);

  if (first.source === "fallback") {
    console.log("Reader fell back:", first.reason);
    process.exit(0);
  }

  console.log("Reading:", JSON.stringify(first.reading, null, 2));

  const guarded = guardReading(first.reading, text);
  console.log("Guard droppedFields:", guarded.droppedFields);

  const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, guarded, sourceUrl);
  console.log("Reconcile outcome:", { kind: outcome.kind, via: "via" in outcome ? outcome.via : undefined, why: "why" in outcome ? outcome.why : undefined });

  if (first.source === "api") {
    console.log(`Usage: ${first.usage.inputTokens} input / ${first.usage.outputTokens} output tokens`);
    console.log(`Estimated cost: $${estimatedUsd(first.usage.inputTokens, first.usage.outputTokens)}`);
  }

  const second = await reader.read({ bookKey: "draftkings", text });
  console.log("Second read source (should be 'cache'):", second.source);
  if (second.source !== "cache") {
    console.error("smoke: expected the second read to be a cache hit");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("promo-reader-smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
