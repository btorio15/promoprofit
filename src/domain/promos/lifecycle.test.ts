import { describe, expect, it } from "vitest";
import { decideScrapedWrite, statusAfterMatch, type ExistingPromoState } from "./lifecycle";
import type { MatchResult } from "./matcher";
import type { ScrapedPromo } from "./scraped";
import type { ScopeGuess } from "./scope";

describe("statusAfterMatch", () => {
  it("boost with a parsed maxStake and no unparsed fields is active", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: "25.00",
        bonusAmount: null,
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
  });

  it("boost with maxStake null goes to pending_review/caps with maxStake", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: null,
        bonusAmount: null,
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["maxStake"] });
  });

  it("boost with a parsed maxStake but an unparsed minOdds goes to pending_review/caps with minOdds", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: "20.00",
        bonusAmount: null,
        unparsedCapFields: ["minOdds"],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["minOdds"] });
  });

  it("bonus_bet with a bonusAmount and no unparsed fields is active", () => {
    expect(
      statusAfterMatch({
        promoType: "bonus_bet",
        maxStake: null,
        bonusAmount: "25.00",
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
  });

  it("bonus_bet with an unparsed minOdds goes to pending_review/caps with minOdds", () => {
    expect(
      statusAfterMatch({
        promoType: "bonus_bet",
        maxStake: null,
        bonusAmount: "25.00",
        unparsedCapFields: ["minOdds"],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["minOdds"] });
  });
});

function baseParsed(overrides: Partial<ScrapedPromo> = {}): ScrapedPromo {
  return {
    bookKey: "ballybet",
    externalId: "ext-1",
    promoType: "profit_boost",
    title: "Test Promo",
    rawText: "Test Promo raw text",
    sourceUrl: "https://example.com/promo",
    sportKeyHint: "americanfootball_nfl",
    scopeText: "",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline", "spread", "total"],
    pinned: null,
    boostPercent: "10.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "20.00",
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
    ...overrides,
  };
}

const MATCHED_SCOPE: ScopeGuess = {
  kind: "event",
  eventId: "evt-1",
  sportKey: "americanfootball_nfl",
  homeTeam: "Denver Broncos",
  awayTeam: "Los Angeles Rams",
  commenceTime: "2026-09-27T17:00:00-04:00",
};

const MATCHED_RESULT: MatchResult = {
  status: "matched",
  scope: MATCHED_SCOPE,
  pinned: null,
  signals: { sportMatch: true, windowMatch: true, teamMatch: true, marketMatch: true },
};

const UNMATCHED_RESULT: MatchResult = {
  status: "unmatched",
  signals: { sportMatch: true, windowMatch: false, teamMatch: true, marketMatch: true },
  guess: MATCHED_SCOPE,
  unresolvedTeamTexts: [],
};

function baseExisting(overrides: Partial<ExistingPromoState> = {}): ExistingPromoState {
  return {
    status: "pending_review",
    reviewReason: "match",
    autoMatchBlocked: false,
    humanScope: null,
    humanPinned: null,
    promoType: "profit_boost",
    maxStake: "20.00",
    bonusAmount: null,
    unparsedCapFields: [],
    capsEnteredByMember: false,
    ...overrides,
  };
}

describe("decideScrapedWrite", () => {
  it("new + matched, boost with maxStake -> write active, autoMatched true, scope/pinned from match", () => {
    const decision = decideScrapedWrite(null, baseParsed(), MATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "active",
      reviewReason: null,
      autoMatched: true,
      scope: MATCHED_SCOPE,
      pinned: null,
      bestGuess: null,
      unparsedCapFields: [],
      capsFrom: "parsed",
    });
  });

  it("new + matched, boost with maxStake null -> write pending_review/caps [maxStake], autoMatched true, scope set", () => {
    const decision = decideScrapedWrite(null, baseParsed({ maxStake: null }), MATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "pending_review",
      reviewReason: "caps",
      autoMatched: true,
      scope: MATCHED_SCOPE,
      pinned: null,
      bestGuess: null,
      unparsedCapFields: ["maxStake"],
      capsFrom: "parsed",
    });
  });

  it("new + unmatched -> write pending_review/match, autoMatched false, scope null, bestGuess from match", () => {
    const decision = decideScrapedWrite(null, baseParsed(), UNMATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "pending_review",
      reviewReason: "match",
      autoMatched: false,
      scope: null,
      pinned: null,
      bestGuess: MATCHED_SCOPE,
      unparsedCapFields: [],
      capsFrom: "parsed",
    });
  });

  it("existing dismissed -> skip (D-14)", () => {
    const existing = baseExisting({ status: "dismissed", reviewReason: null });
    expect(decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT)).toEqual({ kind: "skip" });
  });

  it("existing active, caps still fully parsed -> refresh, stays active", () => {
    const existing = baseExisting({ status: "active", reviewReason: null });
    expect(decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT)).toEqual({
      kind: "refresh",
      status: "active",
      reviewReason: null,
      unparsedCapFields: [],
    });
  });

  it("CR-01: existing active re-scraped with minOdds now unparsed -> refresh to pending_review/caps [minOdds]", () => {
    const existing = baseExisting({ status: "active", reviewReason: null });
    const decision = decideScrapedWrite(
      existing,
      baseParsed({ minOddsAmerican: null, unparsedCapFields: ["minOdds"] }),
      MATCHED_RESULT,
    );
    expect(decision).toEqual({
      kind: "refresh",
      status: "pending_review",
      reviewReason: "caps",
      unparsedCapFields: ["minOdds"],
    });
  });

  it("CR-01: existing active boost re-scraped with maxStake now absent -> refresh to pending_review/caps [maxStake]", () => {
    const existing = baseExisting({ status: "active", reviewReason: null });
    const decision = decideScrapedWrite(existing, baseParsed({ maxStake: null }), MATCHED_RESULT);
    expect(decision).toEqual({
      kind: "refresh",
      status: "pending_review",
      reviewReason: "caps",
      unparsedCapFields: ["maxStake"],
    });
  });

  it("existing active with member-entered caps -> touch only (caps never overwritten)", () => {
    const existing = baseExisting({ status: "active", reviewReason: null, capsEnteredByMember: true });
    expect(decideScrapedWrite(existing, baseParsed({ maxStake: null }), MATCHED_RESULT)).toEqual({ kind: "touch" });
  });

  it("CR-04: existing pending_review/caps boost still missing maxStake -> refresh keeps [maxStake] (never an empty field list)", () => {
    const existing = baseExisting({ status: "pending_review", reviewReason: "caps", maxStake: null, unparsedCapFields: ["maxStake"] });
    expect(decideScrapedWrite(existing, baseParsed({ maxStake: null, unparsedCapFields: [] }), MATCHED_RESULT)).toEqual({
      kind: "refresh",
      status: "pending_review",
      reviewReason: "caps",
      unparsedCapFields: ["maxStake"],
    });
  });

  it("existing pending_review/caps whose fresh parse now has every cap -> refresh to active", () => {
    const existing = baseExisting({ status: "pending_review", reviewReason: "caps", maxStake: null, unparsedCapFields: ["maxStake"] });
    expect(decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT)).toEqual({
      kind: "refresh",
      status: "active",
      reviewReason: null,
      unparsedCapFields: [],
    });
  });

  it("existing pending_review/match with autoMatchBlocked true -> stays pending_review/match, even if matched now (D-11)", () => {
    const existing = baseExisting({ status: "pending_review", reviewReason: "match", autoMatchBlocked: true });
    expect(decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT)).toEqual({
      kind: "refresh",
      status: "pending_review",
      reviewReason: "match",
      unparsedCapFields: [],
    });
  });

  it("existing pending_review/match, not blocked, now matched -> write as new-matched (re-match, D-19)", () => {
    const existing = baseExisting({ status: "pending_review", reviewReason: "match", autoMatchBlocked: false });
    const decision = decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT);
    expect(decision).toMatchObject({ kind: "write", status: "active", autoMatched: true, scope: MATCHED_SCOPE });
  });

  it("existing pending_review/match, not blocked, still unmatched -> write pending_review/match with refreshed bestGuess", () => {
    const existing = baseExisting({ status: "pending_review", reviewReason: "match", autoMatchBlocked: false });
    const decision = decideScrapedWrite(existing, baseParsed(), UNMATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "pending_review",
      reviewReason: "match",
      autoMatched: false,
      scope: null,
      pinned: null,
      bestGuess: MATCHED_SCOPE,
      unparsedCapFields: [],
      capsFrom: "parsed",
    });
  });

  it("existing expired with humanScope -> write statusAfterMatch(existing), scope/pinned from existing human fields, autoMatched false", () => {
    const existing = baseExisting({
      status: "expired",
      reviewReason: null,
      humanScope: MATCHED_SCOPE,
      humanPinned: null,
      maxStake: "20.00",
    });
    const decision = decideScrapedWrite(existing, baseParsed({ maxStake: null }), UNMATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "active",
      reviewReason: null,
      autoMatched: false,
      scope: MATCHED_SCOPE,
      pinned: null,
      bestGuess: null,
      unparsedCapFields: [],
      capsFrom: "existing",
    });
  });

  it("existing expired without humanScope -> same as new (matched)", () => {
    const existing = baseExisting({ status: "expired", reviewReason: null, humanScope: null });
    const decision = decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT);
    expect(decision).toMatchObject({ kind: "write", status: "active", autoMatched: true, scope: MATCHED_SCOPE });
  });

  it("CR-02: existing expired + autoMatchBlocked, re-matched -> pending_review/match, never auto-reactivated", () => {
    const existing = baseExisting({ status: "expired", reviewReason: "match", autoMatchBlocked: true, humanScope: null });
    expect(decideScrapedWrite(existing, baseParsed(), MATCHED_RESULT)).toEqual({
      kind: "write",
      status: "pending_review",
      reviewReason: "match",
      autoMatched: false,
      scope: null,
      pinned: null,
      bestGuess: MATCHED_SCOPE,
      unparsedCapFields: [],
      capsFrom: "parsed",
    });
  });

  it("CR-03: existing expired with member-entered caps, re-matched -> active from the member's caps, caps kept", () => {
    const existing = baseExisting({
      status: "expired",
      reviewReason: null,
      maxStake: "25.00",
      unparsedCapFields: [],
      capsEnteredByMember: true,
    });
    const decision = decideScrapedWrite(existing, baseParsed({ maxStake: null }), MATCHED_RESULT);
    expect(decision).toEqual({
      kind: "write",
      status: "active",
      reviewReason: null,
      autoMatched: true,
      scope: MATCHED_SCOPE,
      pinned: null,
      bestGuess: null,
      unparsedCapFields: [],
      capsFrom: "existing",
    });
  });

  it("CR-03: existing expired without member caps, re-matched with maxStake absent -> pending_review/caps from the fresh parse", () => {
    const existing = baseExisting({ status: "expired", reviewReason: null, maxStake: "25.00" });
    const decision = decideScrapedWrite(existing, baseParsed({ maxStake: null }), MATCHED_RESULT);
    expect(decision).toMatchObject({ kind: "write", status: "pending_review", reviewReason: "caps", capsFrom: "parsed" });
  });

  it("existing expired without humanScope, still unmatched -> pending_review/match like new", () => {
    const existing = baseExisting({ status: "expired", reviewReason: null, humanScope: null });
    const decision = decideScrapedWrite(existing, baseParsed(), UNMATCHED_RESULT);
    expect(decision).toMatchObject({ kind: "write", status: "pending_review", reviewReason: "match", autoMatched: false });
  });
});
