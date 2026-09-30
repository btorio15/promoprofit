import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { draftkingsScraper } from "./books/draftkings";
import { reconcileEntry } from "./reconcile";
import { guardReading, type GuardedReading } from "./verbatimGuard";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import type { ParseResult, ScrapedPromo, SkippedEntry } from "@/domain/promos/scraped";
import type { PromoReading } from "./promoReading";

const FIXTURE_PATH = join(process.cwd(), "src/test/fixtures/promos/draftkings-promos-2026-09-28.json");
const NOW = new Date("2026-09-28T12:00:00.000Z");
const SOURCE_URL = "https://api.draftkings.com/en/api/promotions/v3/promotions/query";

function parseFixture(): ParseResult {
  const body = readFileSync(FIXTURE_PATH, "utf-8");
  return draftkingsScraper.parse({ listBody: body, detailBodies: {} }, { now: NOW, sourceUrl: SOURCE_URL });
}

function findCandidate(id: string): ScrapedPromo {
  const result = parseFixture();
  const c = result.candidates.find((c) => c.externalId === id);
  if (!c) throw new Error(`candidate ${id} not found`);
  return c;
}

function findSkip(id: string): SkippedEntry {
  const result = parseFixture();
  const s = result.skipped.find((s) => s.externalId === id);
  if (!s) throw new Error(`skip ${id} not found`);
  return s;
}

function guardedReading(overrides: Partial<GuardedReading> = {}): GuardedReading {
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
    droppedFields: [],
    ...overrides,
  };
}

type ReadingOverrides = Partial<Omit<PromoReading, "evidence">> & {
  evidence?: Partial<PromoReading["evidence"]>;
};

function fullReading(overrides: ReadingOverrides = {}): PromoReading {
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

describe("reconcileEntry against the real DK 2026-09-28 fixture", () => {
  it("(a) agreement on 1125873 gives the candidate deep-equal to the parser's", () => {
    const candidate = findCandidate("1125873");
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: "25.00",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
    });
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, reading, SOURCE_URL);
    expect(outcome).toEqual({ kind: "candidate", candidate, via: "agree" });
  });

  it("(b) a simulated parser mistake (maxStake 10.00) vs a guard-backed reader maxStake 25.00 goes to review(disagreement) with both readings visible", () => {
    const real = findCandidate("1125873");
    const candidate: ScrapedPromo = { ...real, maxStake: "10.00" };
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: "25.00",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
    });
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review");
    expect(outcome.why).toBe("disagreement");
    expect(outcome.skip.evidence?.dedupeKey).toBe(promoDedupeKey(candidate));
    expect(outcome.skip.evidence?.rawText).toContain("10.00");
    expect(outcome.skip.evidence?.rawText).toContain("25.00");
    expect(outcome.skip.evidence?.rawText.startsWith("[Promo reader check: disagreement]")).toBe(true);
  });

  it("(c) a hallucinated maxStake '100' (already guard-dropped) gives review with guard_drop", () => {
    const candidate = findCandidate("1125873");
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: null,
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
      droppedFields: ["maxStake"],
    });
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review");
    expect(outcome.why).toBe("guard_drop");
    expect(outcome.skip.evidence?.dedupeKey).toBe(promoDedupeKey(candidate));
  });

  it("(d) 1127668 prop with the reader returning not_usable/prop/high gives a skip", () => {
    const skip = findSkip("1127668");
    const reading = guardedReading({ kind: "not_usable", skipReason: "prop", confidence: "high" });
    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome).toEqual({ kind: "skip", skip, via: "agree_not_usable" });
  });

  it("(e) 1125873's real text as an unsupported_sport skip with a high-confidence reader rescues a candidate", () => {
    const real = findCandidate("1125873");
    const skip: SkippedEntry = {
      reason: "unsupported_sport",
      externalId: real.externalId,
      title: real.title,
      evidence: { rawText: real.rawText, sourceUrl: SOURCE_URL, expiresAt: real.expiresAt, partial: null },
    };
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: "25.00",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
      teams: [],
      confidence: "high",
    });
    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("candidate");
    if (outcome.kind !== "candidate") throw new Error("expected candidate");
    expect(outcome.via).toBe("rescued");
    expect(outcome.candidate.boostPercent).toBe("50.00");
    expect(outcome.candidate.maxStake).toBe("25.00");
    expect(outcome.candidate.minOddsAmerican).toBe(-200);
    expect(outcome.candidate.sportKeyHint).toBe("icehockey_nhl");
  });

  it("(e-medium) the same rescue at medium confidence gives review instead", () => {
    const real = findCandidate("1125873");
    const skip: SkippedEntry = {
      reason: "unsupported_sport",
      externalId: real.externalId,
      title: real.title,
      evidence: { rawText: real.rawText, sourceUrl: SOURCE_URL, expiresAt: real.expiresAt, partial: null },
    };
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: "25.00",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
      teams: [],
      confidence: "medium",
    });
    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review");
    expect(outcome.why).toBe("rescue_needs_review");
  });

  it("(f) the parser keeps 1125873 but the reader says not_usable -- review with the candidate's own dedupe key", () => {
    const candidate = findCandidate("1125873");
    const reading = guardedReading({ kind: "not_usable", confidence: "high" });
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review");
    expect(outcome.why).toBe("reader_not_usable");
    expect(outcome.skip.evidence?.dedupeKey).toBe(promoDedupeKey(candidate));
  });

  it("(g) 1126078 futures with the reader saying profit_boost usable gives skip(clear_reason_kept), reason unchanged", () => {
    const skip = findSkip("1126078");
    const reading = guardedReading({ kind: "profit_boost", boostPercent: "30.00", confidence: "high" });
    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome).toEqual({ kind: "skip", skip, via: "clear_reason_kept" });
    expect(outcome.kind).toBe("skip");
    if (outcome.kind !== "skip") throw new Error("expected skip");
    expect(outcome.skip.reason).toBe("futures");
  });

  it("(k) a not_a_promo skip plus a high-confidence usable reading with no amount gives skip(rescue_without_amount), reviewSuppressed set", () => {
    const skip: SkippedEntry = {
      reason: "not_a_promo",
      externalId: "na-1",
      title: "Bally's Profit Boost",
      evidence: {
        rawText: "Boost your profits and take your game to the next level! Increase your winnings up to 100%",
        sourceUrl: SOURCE_URL,
        expiresAt: null,
        partial: null,
      },
    };
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: null,
      bonusAmount: null,
      confidence: "high",
    });
    const outcome = reconcileEntry("ballybet", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("skip");
    if (outcome.kind !== "skip") throw new Error("expected skip");
    expect(outcome.via).toBe("rescue_without_amount");
    expect(outcome.skip.reviewSuppressed).toBe("reader_rescue_without_amount");
    expect(outcome.skip.reason).toBe("not_a_promo");
  });

  it("(l) an unsupported_sport skip plus a medium-confidence reading with a guard-backed bonusAmount still gives review(rescue_needs_review)", () => {
    const skip: SkippedEntry = {
      reason: "unsupported_sport",
      externalId: "us-1",
      title: "Some Bonus Bet",
      evidence: {
        rawText: "Get $50 in Bonus Bets when you sign up",
        sourceUrl: SOURCE_URL,
        expiresAt: null,
        partial: null,
      },
    };
    const reading = guardedReading({
      kind: "bonus_bet",
      boostPercent: null,
      bonusAmount: "50.00",
      confidence: "medium",
    });
    const outcome = reconcileEntry("ballybet", { kind: "skip", skip }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review");
    expect(outcome.why).toBe("rescue_needs_review");
  });

  it("(h) merge: a candidate missing maxStake (with it in unparsedCapFields) gets it filled from a guard-backed reader", () => {
    const real = findCandidate("1125873");
    const candidate: ScrapedPromo = { ...real, maxStake: null, unparsedCapFields: ["maxStake"] };
    const reading = guardedReading({
      kind: "profit_boost",
      boostPercent: "50.00",
      maxStake: "25.00",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
    });
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, reading, SOURCE_URL);
    expect(outcome.kind).toBe("candidate");
    if (outcome.kind !== "candidate") throw new Error("expected candidate");
    expect(outcome.via).toBe("merged");
    expect(outcome.candidate.maxStake).toBe("25.00");
    expect(outcome.candidate.unparsedCapFields).not.toContain("maxStake");
  });

  it("(i) reading null gives the pattern result unchanged, for a candidate", () => {
    const candidate = findCandidate("1125873");
    const outcome = reconcileEntry("draftkings", { kind: "candidate", candidate }, null, SOURCE_URL);
    expect(outcome).toEqual({ kind: "candidate", candidate, via: "pattern_only" });
  });

  it("(i) reading null gives the pattern result unchanged, for a skip", () => {
    const skip = findSkip("1127668");
    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, null, SOURCE_URL);
    expect(outcome).toEqual({ kind: "skip", skip, via: "pattern_only" });
  });

  it("(j) mislabeled rescue: a reader citing 'Profit Boost: 50%' for maxStake never rescues a candidate", () => {
    const real = findCandidate("1125873");
    const skip: SkippedEntry = {
      reason: "unsupported_sport",
      externalId: real.externalId,
      title: real.title,
      evidence: { rawText: real.rawText, sourceUrl: SOURCE_URL, expiresAt: real.expiresAt, partial: null },
    };
    const reading = fullReading({
      kind: "profit_boost",
      boostPercent: "50",
      maxStake: "50",
      minOddsAmerican: -200,
      sport: "icehockey_nhl",
      teams: [],
      confidence: "high",
      evidence: {
        boostPercent: "Profit Boost: 50%",
        maxStake: "Profit Boost: 50%",
        minOddsAmerican: "-200 or longer",
      },
    });

    const guarded = guardReading(reading, real.rawText);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");

    const outcome = reconcileEntry("draftkings", { kind: "skip", skip }, guarded, SOURCE_URL);
    expect(outcome.kind).toBe("review");
    if (outcome.kind !== "review") throw new Error("expected review, never a rescued candidate");
    expect(outcome.why).toBe("rescue_needs_review");
    expect(outcome.skip.evidence?.rawText).toContain("dropped: maxStake");
  });
});

describe("reconcileEntry reader-teams override (FanDuel Steelers @ Browns)", () => {
  const RAW =
    "YOU CAN CHOOSE between a 50% Profit Boost Token OR an Up-7 Early Win Token to use on the Steelers @ Browns NFL Game on October 1st, 2026!\nNFL Choose Your Own Reward\nRegardless of which option you select, your Reward is eligible for use on the Pittsburgh Steelers @ Cleveland Browns NFL Game on October 1st, 2026, up to a maximum wager. Reward expires at 8:15 PM ET on Thursday, October 1st, 2026.";
  const BAD_TEAMS = [
    "YOU CAN CHOOSE between a 50% Profit Boost Token OR an Up-7 Early Win Token to use on the Steelers",
    "Browns NFL Game on October 1st, 2026!",
  ];

  function candidate(teamsText: string[]): ScrapedPromo {
    return {
      bookKey: "fanduel",
      externalId: "CYORNFL1001",
      promoType: "profit_boost",
      title: "NFL Choose Your Own Reward",
      rawText: RAW,
      sourceUrl: "https://api.sportsbook.fanduel.com/promos/api/promotions/CYORNFL1001",
      sportKeyHint: "americanfootball_nfl",
      scopeText: RAW.split("\n")[0],
      teamsText,
      windowStart: null,
      windowEnd: null,
      expiresAt: "2026-10-02T00:15:00.000Z",
      eligibleMarketTypes: ["moneyline", "spread", "total"],
      pinned: null,
      boostPercent: "50.00",
      boostedOddsAmerican: null,
      baseOddsAmerican: null,
      bonusAmount: null,
      maxStake: null,
      maxWinnings: null,
      winningsCapKind: "boost_extra",
      minOddsAmerican: -200,
      unparsedCapFields: ["maxStake", "maxWinnings"],
      claimRequired: "claim_token",
      finePrintNote: null,
    };
  }

  const reading = (o: Partial<GuardedReading> = {}) =>
    guardedReading({
      boostPercent: "50",
      minOddsAmerican: -200,
      sport: "americanfootball_nfl",
      teams: ["Pittsburgh Steelers", "Cleveland Browns"],
      singleGame: true,
      eventDateText: "October 1st, 2026",
      ...o,
    });

  it("replaces sentence-half parser teams with the reader's teams and fills the window", () => {
    const out = reconcileEntry("fanduel", { kind: "candidate", candidate: candidate(BAD_TEAMS) }, reading(), "u");
    expect(out.kind).toBe("candidate");
    if (out.kind !== "candidate") return;
    expect(out.candidate.teamsText).toEqual(["Pittsburgh Steelers", "Cleveland Browns"]);
    expect(out.candidate.windowStart).not.toBeNull();
    expect(out.candidate.boostPercent).toBe("50.00");
    expect(out.candidate.maxStake).toBeNull();
  });

  it("does not override when reader confidence is not high", () => {
    const out = reconcileEntry("fanduel", { kind: "candidate", candidate: candidate(BAD_TEAMS) }, reading({ confidence: "medium" }), "u");
    if (out.kind !== "candidate") throw new Error("expected candidate");
    expect(out.candidate.teamsText).toEqual(BAD_TEAMS);
  });

  it("does not override when a reader team is not verbatim in the promo text", () => {
    const out = reconcileEntry(
      "fanduel",
      { kind: "candidate", candidate: candidate(BAD_TEAMS) },
      reading({ teams: ["Pittsburgh Steelers", "Cincinnati Bengals"] }),
      "u",
    );
    if (out.kind !== "candidate") throw new Error("expected candidate");
    expect(out.candidate.teamsText).toEqual(BAD_TEAMS);
  });

  it("leaves plausible parser teams alone", () => {
    const out = reconcileEntry("fanduel", { kind: "candidate", candidate: candidate(["Steelers", "Browns"]) }, reading(), "u");
    if (out.kind !== "candidate") throw new Error("expected candidate");
    expect(out.candidate.teamsText).toEqual(["Steelers", "Browns"]);
  });
});
