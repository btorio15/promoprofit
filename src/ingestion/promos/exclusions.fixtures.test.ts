import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { draftkingsScraper } from "./books/draftkings";
import { fanduelScraper } from "./books/fanduel";
import { ballybetScraper } from "./books/ballybet";

/**
 * Phase 9 (09-03, A-06) guard: tightening the bare "first bet" new-customer
 * rule must not lose any fixture entry that classified new_customer before.
 * The expected JSON is a superset check -- later changes may add entries.
 * Regenerate (only deliberately) with UPDATE_FIXTURE_MAP=1.
 */
const DIR = join(process.cwd(), "src/test/fixtures/promos");
const EXPECTED_PATH = join(process.cwd(), "src/ingestion/promos/exclusions.fixtures.expected.json");

function read(name: string): string {
  return readFileSync(join(DIR, name), "utf-8");
}

const CTX = { now: new Date("2026-09-27T12:00:00.000Z"), sourceUrl: "https://example.test/ignored" };

type Parsed = { skipped: Array<{ externalId?: string | null; title?: string; reason: string }> };

const SOURCES: Array<{ fixture: string; parse: () => Parsed }> = [
  ...["draftkings-promos.json", "draftkings-promos-2026-09-27.json", "draftkings-promos-2026-09-28.json"].map(
    (f) => ({
      fixture: f,
      parse: (): Parsed => draftkingsScraper.parse({ listBody: read(f), detailBodies: {} }, CTX),
    }),
  ),
  ...["fanduel-promos.json", "fanduel-promos-2026-09-28.json"].map((f) => ({
    fixture: f,
    parse: (): Parsed => fanduelScraper.parse({ listBody: read(f), detailBodies: {} }, CTX),
  })),
  {
    fixture: "ballybet-promos.json",
    parse: (): Parsed => ballybetScraper.parse({ listBody: read("ballybet-promos.json"), detailBodies: {} }, CTX),
  },
];

function collect(): string[] {
  const keys: string[] = [];
  for (const { fixture, parse } of SOURCES) {
    for (const s of parse().skipped) {
      if (s.reason === "new_customer") keys.push(`${fixture}#${s.externalId ?? s.title ?? "?"}`);
    }
  }
  return [...new Set(keys)].sort();
}

describe("new_customer fixture sweep (A-06 guard)", () => {
  if (process.env.UPDATE_FIXTURE_MAP === "1" || !existsSync(EXPECTED_PATH)) {
    writeFileSync(EXPECTED_PATH, JSON.stringify(collect(), null, 2) + "\n");
  }

  it("every previously new_customer fixture entry still classifies new_customer", () => {
    const expected = JSON.parse(readFileSync(EXPECTED_PATH, "utf-8")) as string[];
    expect(expected.length).toBeGreaterThan(0);
    const actual = new Set(collect());
    const lost = expected.filter((k) => !actual.has(k));
    expect(lost).toEqual([]);
  });
});
