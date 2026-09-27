import { describe, expect, it } from "vitest";
import { describePromo, scopeGuessLabel } from "./describe";
import type { ScrapedPromo } from "./scraped";
import type { ScopeGuess } from "./scope";
import { formatKickoff } from "@/lib/format";

function baseParsed(overrides: Partial<ScrapedPromo> = {}): ScrapedPromo {
  return {
    bookKey: "draftkings",
    externalId: null,
    promoType: "profit_boost",
    title: "50% Profit Boost",
    rawText: "50% Profit Boost",
    sourceUrl: "https://draftkings.com/promo",
    sportKeyHint: "americanfootball_nfl",
    scopeText: "all NFL games on 9/27/2026",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline"],
    pinned: null,
    boostPercent: "50.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "25.00",
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
    ...overrides,
  };
}

describe("describePromo (03-UI-SPEC.md queue card summary line)", () => {
  it("formats a sport-wide boost with a whole percent, dropping the trailing .00", () => {
    const parsed = baseParsed({
      bookKey: "draftkings",
      boostPercent: "50.00",
      scopeText: "all NFL games on 9/27/2026",
      maxStake: "25.00",
    });

    expect(describePromo(parsed)).toBe("50% profit boost · all NFL games on 9/27/2026");
  });

  it("formats a game-wide boost", () => {
    const parsed = baseParsed({
      bookKey: "ballybet",
      boostPercent: "10.00",
      scopeText: "LA Rams vs. DEN Broncos",
      teamsText: ["LA Rams", "DEN Broncos"],
      maxStake: "50.00",
    });

    expect(describePromo(parsed)).toBe("10% profit boost · LA Rams vs. DEN Broncos");
  });

  it("keeps 2dp when the percent isn't a whole number", () => {
    const parsed = baseParsed({ boostPercent: "12.50" });

    expect(describePromo(parsed)).toBe("12.50% profit boost · all NFL games on 9/27/2026");
  });

  it("formats a pinned boost with a published boosted price", () => {
    const parsed = baseParsed({
      bookKey: "fanduel",
      boostPercent: null,
      boostedOddsAmerican: 150,
      baseOddsAmerican: 100,
      pinned: { selectionText: "Denver Broncos", marketType: "moneyline", line: null },
      teamsText: ["Denver Broncos", "Los Angeles Rams"],
      scopeText: "Denver Broncos vs. Los Angeles Rams",
    });

    expect(describePromo(parsed)).toBe(
      "Boosted to +150 · Denver Broncos moneyline · Denver Broncos vs. Los Angeles Rams",
    );
  });

  it("formats a bonus bet", () => {
    const parsed = baseParsed({
      bookKey: "fanduel",
      promoType: "bonus_bet",
      boostPercent: null,
      bonusAmount: "25.00",
      maxStake: null,
      scopeText: "any NBA game",
    });

    expect(describePromo(parsed)).toBe("$25.00 bonus bet · any NBA game");
  });
});

describe("scopeGuessLabel (03-UI-SPEC.md best-guess / matched line, without the 'Best guess: ' prefix)", () => {
  it("formats an event guess as '{away} @ {home}, {kickoff}'", () => {
    const guess: ScopeGuess = {
      kind: "event",
      eventId: "nfl-1",
      sportKey: "americanfootball_nfl",
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: "2026-09-27T18:00:00.000Z",
    };

    expect(scopeGuessLabel(guess)).toBe(
      `Los Angeles Rams @ Denver Broncos, ${formatKickoff(guess.commenceTime)}`,
    );
  });

  it("formats a single-ET-day sport_window guess as 'any {sport} game, {etDayLabel} (ET)'", () => {
    const guess: ScopeGuess = {
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: "2026-09-27T17:00:00.000Z", // Sun Sep 27, 1pm ET
      windowEnd: "2026-09-28T02:00:00.000Z", // Sun Sep 27, 10pm ET (same ET calendar day)
    };

    expect(scopeGuessLabel(guess)).toBe("any NFL game, Sun, Sep 27 (ET)");
  });

  it("formats a multi-day sport_window guess as 'any {sport} game, {Mon Day}–{Day} (ET)'", () => {
    const guess: ScopeGuess = {
      kind: "sport_window",
      sportKey: "americanfootball_ncaaf",
      windowStart: "2026-09-25T04:00:00.000Z", // Sep 25, 12am ET
      windowEnd: "2026-09-28T03:59:00.000Z", // Sep 27, 11:59pm ET
    };

    expect(scopeGuessLabel(guess)).toBe("any NCAAF game, Sep 25–27 (ET)");
  });
});
