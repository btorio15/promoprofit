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

const gameScope = (eventId: string) => ({ ...emptyBonusDraft(NOW).scope, mode: "game" as const, eventId });
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
