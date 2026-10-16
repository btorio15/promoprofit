import { describe, expect, it } from "vitest";
import { emptyBonusDraft, type AddPromoDraft } from "./addPromoDraft";
import { looksLikeDuplicate, type DuplicateCandidate, type DuplicateEventRef } from "./duplicateHint";

const NOW = new Date("2026-10-01T16:00:00.000Z");

const events: DuplicateEventRef[] = [
  { eventId: "E1", sportKey: "americanfootball_nfl", commenceTime: "2026-10-03T17:00:00.000Z" },
  { eventId: "E2", sportKey: "basketball_nba", commenceTime: "2026-10-03T23:00:00.000Z" },
];

function bonusDraft(over: Partial<AddPromoDraft> = {}): AddPromoDraft {
  return { ...emptyBonusDraft(NOW), bookKey: "fanduel", bonusAmount: "50", ...over };
}

function boostDraft(over: Partial<AddPromoDraft> = {}): AddPromoDraft {
  return {
    ...emptyBonusDraft(NOW),
    promoType: "profit_boost",
    bookKey: "draftkings",
    boostPercent: "50",
    ...over,
  };
}

const bonusCand: DuplicateCandidate = {
  bookKey: "fanduel",
  promoType: "bonus_bet",
  bonusAmount: "50.00",
  boostPercent: null,
  boostedOddsAmerican: null,
  scope: { kind: "any" },
};

const boostCand = (scope: DuplicateCandidate["scope"], over: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  bookKey: "draftkings",
  promoType: "profit_boost",
  bonusAmount: null,
  boostPercent: "50.00",
  boostedOddsAmerican: null,
  scope,
  ...over,
});

const gameScope = (eventId: string) => ({ ...emptyBonusDraft(NOW).scope, mode: "game" as const, eventIds: [eventId] });
const leagueScope = (sportKey: string, from: string, through: string | null) => ({
  ...emptyBonusDraft(NOW).scope,
  mode: "league" as const,
  sportKey,
  fromEtDate: from,
  throughEtDate: through,
});

describe("looksLikeDuplicate", () => {
  it("matches equal amounts numerically, not by string", () => {
    expect(looksLikeDuplicate(bonusDraft(), [bonusCand], events)).toBe(true);
  });

  it("rejects a different book, type, or amount", () => {
    expect(looksLikeDuplicate(bonusDraft({ bookKey: "betmgm" }), [bonusCand], events)).toBe(false);
    expect(looksLikeDuplicate(bonusDraft({ bonusAmount: "25" }), [bonusCand], events)).toBe(false);
    expect(looksLikeDuplicate(boostDraft({ bookKey: "fanduel" }), [bonusCand], events)).toBe(false);
  });

  it("matches a boost % on an event inside a same-sport candidate window", () => {
    const draft = boostDraft({ scope: gameScope("E1") });
    const inWindow = boostCand({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-10-03T04:00:00.000Z",
      windowEnd: "2026-10-04T03:59:59.999Z",
    });
    const otherSport = boostCand({
      kind: "sport_window",
      sportKey: "basketball_nba",
      windowStart: "2026-10-03T04:00:00.000Z",
      windowEnd: "2026-10-04T03:59:59.999Z",
    });
    expect(looksLikeDuplicate(draft, [inWindow], events)).toBe(true);
    expect(looksLikeDuplicate(draft, [otherSport], events)).toBe(false);
  });

  it("matches overlapping league windows of the same sport only", () => {
    const draft = boostDraft({ scope: leagueScope("americanfootball_nfl", "2026-10-03", "2026-10-05") });
    const overlap = boostCand({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-10-05T04:00:00.000Z",
      windowEnd: "2026-10-07T03:59:59.999Z",
    });
    const apart = boostCand({
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-10-10T04:00:00.000Z",
      windowEnd: "2026-10-11T03:59:59.999Z",
    });
    expect(looksLikeDuplicate(draft, [overlap], events)).toBe(true);
    expect(looksLikeDuplicate(draft, [apart], events)).toBe(false);
  });

  it("matches boosted odds on the same event", () => {
    const draft = boostDraft({ boostMode: "odds", boostedOdds: "+250", scope: gameScope("E1") });
    const cand = boostCand(
      { kind: "event", eventId: "E1", sportKey: "americanfootball_nfl" },
      { boostPercent: null, boostedOddsAmerican: 250 },
    );
    expect(looksLikeDuplicate(draft, [cand], events)).toBe(true);
  });

  it("never matches an incomplete or malformed draft, and never throws", () => {
    expect(looksLikeDuplicate(bonusDraft({ bookKey: null }), [bonusCand], events)).toBe(false);
    expect(looksLikeDuplicate(bonusDraft({ bonusAmount: "" }), [bonusCand], events)).toBe(false);
    expect(looksLikeDuplicate(bonusDraft({ bonusAmount: "abc" }), [bonusCand], events)).toBe(false);
  });
});

describe("looksLikeDuplicate games-scoped candidate", () => {
  const gamesScope: DuplicateCandidate["scope"] = {
    kind: "games",
    sportKey: "americanfootball_nfl",
    eventIds: ["E1", "E9"],
    windowStart: "2026-10-03T17:00:00.000Z",
    windowEnd: "2026-10-04T00:20:00.000Z",
  };

  it("a game draft matches only when its event is one of the listed games", () => {
    expect(looksLikeDuplicate(boostDraft({ scope: gameScope("E1") }), [boostCand(gamesScope)], events)).toBe(true);
    expect(looksLikeDuplicate(boostDraft({ scope: gameScope("E2") }), [boostCand(gamesScope)], events)).toBe(false);
  });

  it("a league-window draft matches when a listed game falls in range, not otherwise", () => {
    const hit = leagueScope("americanfootball_nfl", "2026-10-03", null);
    const miss = leagueScope("americanfootball_nfl", "2026-10-10", null);
    expect(looksLikeDuplicate(boostDraft({ scope: hit }), [boostCand(gamesScope)], events)).toBe(true);
    expect(looksLikeDuplicate(boostDraft({ scope: miss }), [boostCand(gamesScope)], events)).toBe(false);
  });
});

describe("looksLikeDuplicate multi-game draft (quick-261016-1se)", () => {
  const evs = [
    { eventId: "E1", sportKey: "americanfootball_nfl", commenceTime: "2026-10-03T17:00:00.000Z" },
    { eventId: "E3", sportKey: "americanfootball_nfl", commenceTime: "2026-10-10T17:00:00.000Z" },
    { eventId: "E4", sportKey: "americanfootball_nfl", commenceTime: "2026-10-17T17:00:00.000Z" },
  ];
  const multi = (ids: string[]) => ({ ...emptyBonusDraft(NOW).scope, mode: "game" as const, eventIds: ids });

  it("overlaps an event candidate for one of its games", () => {
    const cand = boostCand({ kind: "event", eventId: "E3", sportKey: "americanfootball_nfl" });
    expect(looksLikeDuplicate(boostDraft({ scope: multi(["E1", "E3"]) }), [cand], evs)).toBe(true);
    expect(looksLikeDuplicate(boostDraft({ scope: multi(["E1", "E4"]) }), [cand], evs)).toBe(false);
  });

  it("overlaps a games candidate sharing any id", () => {
    const cand = boostCand({
      kind: "games",
      sportKey: "americanfootball_nfl",
      eventIds: ["E4", "E9"],
      windowStart: "2026-10-17T17:00:00.000Z",
      windowEnd: "2026-10-18T17:00:00.000Z",
    });
    expect(looksLikeDuplicate(boostDraft({ scope: multi(["E1", "E4"]) }), [cand], evs)).toBe(true);
    expect(looksLikeDuplicate(boostDraft({ scope: multi(["E1", "E3"]) }), [cand], evs)).toBe(false);
  });

  it("overlaps a same-league window containing any picked kickoff", () => {
    const win = (start: string, end: string) =>
      boostCand({ kind: "sport_window", sportKey: "americanfootball_nfl", windowStart: start, windowEnd: end });
    const draft = boostDraft({ scope: multi(["E1", "E3"]) });
    expect(looksLikeDuplicate(draft, [win("2026-10-10T00:00:00.000Z", "2026-10-11T00:00:00.000Z")], evs)).toBe(true);
    expect(looksLikeDuplicate(draft, [win("2026-10-20T00:00:00.000Z", "2026-10-21T00:00:00.000Z")], evs)).toBe(false);
  });

  it("an unknown picked game is never a duplicate", () => {
    const cand = boostCand({ kind: "any" });
    expect(looksLikeDuplicate(boostDraft({ scope: multi(["E1", "ZZ"]) }), [cand], evs)).toBe(false);
  });
});
