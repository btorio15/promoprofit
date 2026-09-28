import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyPromoReader } from "./readerPass";
import { isReviewWorthySkip } from "./reviewTriage";
import { ballybetScraper } from "./books/ballybet";
import { draftkingsScraper } from "./books/draftkings";
import { fanduelScraper } from "./books/fanduel";
import type { ParseResult, SkippedEntry } from "@/domain/promos/scraped";
import type { PromoReader, ReaderResult } from "./promoReader";
import type { PromoReading } from "./promoReading";

/**
 * quick-260928-mgi: table-driven coverage of the 6 real-world noise cases
 * from the 2026-09-28 live run (owner decisions 1 and 2) -- a clear parser
 * exclusion always wins over the reader, and a reader rescue with no
 * guard-backed amount is skipped and suppressed rather than sent to review.
 * Every case's real text goes through the REAL guardReading (via
 * applyPromoReader), never a hand-built GuardedReading -- this is what
 * proves the guard's own field-binding rules (e.g. "no 'boost' word near the
 * evidenced percent") actually drop the field, not just an assumption.
 */

const FIXTURES_DIR = join(process.cwd(), "src/test/fixtures/promos");
const NOW = new Date("2026-09-28T12:00:00.000Z");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

function ballybetSkip(externalId: string): SkippedEntry {
  const result = ballybetScraper.parse(
    { listBody: readFixture("ballybet-promos.json"), detailBodies: {} },
    { now: NOW, sourceUrl: ballybetScraper.listRequest.url },
  );
  const skip = result.skipped.find((s) => s.externalId === externalId);
  if (!skip) throw new Error(`ballybet skip ${externalId} not found`);
  return skip;
}

function dkSkip(externalId: string): SkippedEntry {
  const result = draftkingsScraper.parse(
    { listBody: readFixture("draftkings-promos-2026-09-28.json"), detailBodies: {} },
    { now: NOW, sourceUrl: draftkingsScraper.listRequest.url },
  );
  const skip = result.skipped.find((s) => s.externalId === externalId);
  if (!skip) throw new Error(`draftkings skip ${externalId} not found`);
  return skip;
}

function fdSkip(externalId: string): SkippedEntry {
  const result = fanduelScraper.parse(
    { listBody: readFixture("fanduel-promos-2026-09-28.json"), detailBodies: {} },
    { now: NOW, sourceUrl: fanduelScraper.listRequest.url },
  );
  const skip = result.skipped.find((s) => s.externalId === externalId);
  if (!skip) throw new Error(`fanduel skip ${externalId} not found`);
  return skip;
}

/** Not in any real fixture (fixture_facts) -- built by hand for cases 6a/6b. */
function earlyWinSkip(reason: "unrecognized" | "not_a_promo"): SkippedEntry {
  return {
    reason,
    externalId: "MLB-EARLY-WIN",
    title: "MLB Early Win Token",
    evidence: {
      rawText: "Get an Early Win Token for today's MLB games -- cash out the moment your team takes the lead.",
      sourceUrl: fanduelScraper.listRequest.url,
      expiresAt: null,
      partial: null,
    },
  };
}

type ReadingOverrides = Partial<Omit<PromoReading, "evidence">> & {
  evidence?: Partial<PromoReading["evidence"]>;
};

function reading(overrides: ReadingOverrides = {}): PromoReading {
  const { evidence, ...rest } = overrides;
  return {
    kind: "profit_boost",
    skipReason: null,
    boostPercent: null,
    bonusAmount: null,
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican: null,
    sport: null,
    teams: [],
    singleGame: false,
    liveOnly: false,
    parlayOrSgpOnly: false,
    propOnly: false,
    newCustomerOnly: false,
    eventDateText: null,
    confidence: "high",
    evidence: {
      boostPercent: null,
      bonusAmount: null,
      maxStake: null,
      maxWinnings: null,
      minOddsAmerican: null,
      ...evidence,
    },
    ...rest,
  };
}

function apiResult(r: PromoReading): ReaderResult {
  return { source: "api", reading: r, usage: { inputTokens: 1, outputTokens: 1 } };
}

function fixedReader(r: PromoReading): PromoReader {
  return { read: vi.fn(async (): Promise<ReaderResult> => apiResult(r)) };
}

describe("applyPromoReader -- the 6 noise cases from the 2026-09-28 live run", () => {
  it("Case 1: Bally Stanley Cup (futures) -- clear reason wins, stays futures, never review-worthy", async () => {
    const skip = ballybetSkip("sbk-50-Stanley-Cup-Champion-Profit-Boost");
    expect(skip.reason).toBe("futures");

    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({
      kind: "profit_boost",
      boostPercent: "50",
      confidence: "high",
      evidence: { boostPercent: "50% Profit Boost" },
    });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "ballybet",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: ballybetScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("futures");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.clearSkipOverrides).toBe(1);
  });

  it("Case 2: Bally's Profit Boost (not_a_promo) -- guard drops the reader's 100% (no 'boost' word near the evidence), rescue suppressed for no amount", async () => {
    const skip = ballybetSkip("sbk-profit-boost-01");
    expect(skip.reason).toBe("not_a_promo");

    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({
      kind: "profit_boost",
      boostPercent: "100",
      confidence: "high",
      evidence: { boostPercent: "Increase your winnings up to 100%" },
    });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "ballybet",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: ballybetScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reviewSuppressed).toBe("reader_rescue_without_amount");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.rescuesWithoutAmount).toBe(1);
  });

  it("Case 3: Bally's Odds Boost (not_a_promo) -- every amount null, medium confidence, rescue suppressed for no amount", async () => {
    const skip = ballybetSkip("sbk-odds-boost-01");
    expect(skip.reason).toBe("not_a_promo");

    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({ kind: "profit_boost", confidence: "medium" });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "ballybet",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: ballybetScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reviewSuppressed).toBe("reader_rescue_without_amount");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.rescuesWithoutAmount).toBe(1);
  });

  it("Case 4: DK 1126077 SGP boost (sgp) -- clear reason wins, stays sgp", async () => {
    const skip = dkSkip("1126077");
    expect(skip.reason).toBe("sgp");

    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({
      kind: "profit_boost",
      boostPercent: "50",
      confidence: "high",
      evidence: { boostPercent: "Profit Boost: 50%" },
    });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "draftkings",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: draftkingsScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("sgp");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.clearSkipOverrides).toBe(1);
  });

  it("Case 5: FanDuel ACQB5G50BB921 (new_customer) -- clear reason wins, stays new_customer", async () => {
    const skip = fdSkip("ACQB5G50BB921");
    expect(skip.reason).toBe("new_customer");

    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({
      kind: "bonus_bet",
      bonusAmount: "250",
      confidence: "high",
      evidence: { bonusAmount: "$250 in Bonus Bets" },
    });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "fanduel",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: fanduelScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("new_customer");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.clearSkipOverrides).toBe(1);
  });

  it("Case 6a: synthetic FanDuel 'MLB Early Win Token' as unrecognized -- suppression beats the always-review-worthy default", async () => {
    const skip = earlyWinSkip("unrecognized");
    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({ kind: "bonus_bet", confidence: "medium" });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "fanduel",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: fanduelScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("unrecognized");
    expect(result.skipped[0].reviewSuppressed).toBe("reader_rescue_without_amount");
    // The critical assertion: unrecognized is normally ALWAYS review-worthy
    // (REVIEW_SKIP_REASONS), but reviewSuppressed short-circuits that.
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.rescuesWithoutAmount).toBe(1);
  });

  it("Case 6b: synthetic FanDuel 'MLB Early Win Token' as not_a_promo -- same suppression", async () => {
    const skip = earlyWinSkip("not_a_promo");
    const parseResult: ParseResult = { found: 1, candidates: [], skipped: [skip] };
    const r = reading({ kind: "bonus_bet", confidence: "medium" });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "fanduel",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: fanduelScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reviewSuppressed).toBe("reader_rescue_without_amount");
    expect(isReviewWorthySkip(result.skipped[0])).toBe(false);
    expect(stats.rescuesWithoutAmount).toBe(1);
  });

  it("combined run: all 6 cases (7 rows) end up skipped and logged, zero review rows", async () => {
    const skipped: SkippedEntry[] = [
      ballybetSkip("sbk-50-Stanley-Cup-Champion-Profit-Boost"),
      ballybetSkip("sbk-profit-boost-01"),
      ballybetSkip("sbk-odds-boost-01"),
      dkSkip("1126077"),
      fdSkip("ACQB5G50BB921"),
      earlyWinSkip("unrecognized"),
      earlyWinSkip("not_a_promo"),
    ];
    const parseResult: ParseResult = { found: skipped.length, candidates: [], skipped };

    const combinedReader: PromoReader = {
      read: vi.fn(async ({ text }): Promise<ReaderResult> => {
        if (text.includes("Stanley Cup")) {
          return apiResult(
            reading({ kind: "profit_boost", boostPercent: "50", confidence: "high", evidence: { boostPercent: "50% Profit Boost" } }),
          );
        }
        if (text.includes("Increase your winnings up to 100%")) {
          return apiResult(
            reading({
              kind: "profit_boost",
              boostPercent: "100",
              confidence: "high",
              evidence: { boostPercent: "Increase your winnings up to 100%" },
            }),
          );
        }
        if (text.includes("Bally's Odds Boost")) {
          return apiResult(reading({ kind: "profit_boost", confidence: "medium" }));
        }
        if (text.includes("SGP Boost") || text.includes("PHI Eagles")) {
          return apiResult(
            reading({ kind: "profit_boost", boostPercent: "50", confidence: "high", evidence: { boostPercent: "Profit Boost: 50%" } }),
          );
        }
        if (text.includes("Get $250 in Bonus Bets guaranteed")) {
          return apiResult(
            reading({ kind: "bonus_bet", bonusAmount: "250", confidence: "high", evidence: { bonusAmount: "$250 in Bonus Bets" } }),
          );
        }
        if (text.includes("MLB Early Win Token")) {
          return apiResult(reading({ kind: "bonus_bet", confidence: "medium" }));
        }
        throw new Error(`combinedReader: unexpected text: ${text}`);
      }),
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "combined",
      parseResult,
      reader: combinedReader,
      fallbackSourceUrl: "https://example.com/list",
    });

    expect(stats.reviewRouted).toBe(0);
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(7);
    for (const skip of result.skipped) {
      expect(isReviewWorthySkip(skip)).toBe(false);
    }
    expect(stats.clearSkipOverrides).toBe(3); // Stanley Cup, DK SGP, FanDuel ACQ
    expect(stats.rescuesWithoutAmount).toBe(4); // Bally Profit Boost, Bally Odds Boost, Early Win x2

    const warnMessages = warnSpy.mock.calls.map((call) => String(call[0]));
    const clearKeptLines = warnMessages.filter((m) => m.includes("clear skip kept"));
    const rescueSkippedLines = warnMessages.filter((m) => m.includes("rescue skipped") && m.includes("no guard-backed amount"));
    expect(clearKeptLines).toHaveLength(3);
    expect(rescueSkippedLines).toHaveLength(4);

    warnSpy.mockRestore();
  });

  it("regression: a pattern-kept candidate (DK 1125873) with a guard-backed maxStake disagreement still goes to review(disagreement)", async () => {
    const parsed = draftkingsScraper.parse(
      { listBody: readFixture("draftkings-promos-2026-09-28.json"), detailBodies: {} },
      { now: NOW, sourceUrl: draftkingsScraper.listRequest.url },
    );
    const real = parsed.candidates.find((c) => c.externalId === "1125873");
    if (!real) throw new Error("candidate 1125873 not found");
    const mistaken = { ...real, maxStake: "10.00" };

    const parseResult: ParseResult = { found: 1, candidates: [mistaken], skipped: [] };
    const r = reading({
      kind: "profit_boost",
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
      confidence: "high",
      evidence: {
        boostPercent: "Profit Boost: 50%",
        maxStake: "MAX $25 WAGER",
        minOddsAmerican: "-200 or longer",
      },
    });

    const { parseResult: result, stats } = await applyPromoReader({
      bookKey: "draftkings",
      parseResult,
      reader: fixedReader(r),
      fallbackSourceUrl: draftkingsScraper.listRequest.url,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(stats.reviewRouted).toBe(1);
    expect(stats.disagreements).toBe(1);
  });
});
