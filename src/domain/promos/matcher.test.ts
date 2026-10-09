import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ScrapedPromo } from "./scraped";
import { matchPromo, type MatchResult } from "./matcher";

const NFL = "americanfootball_nfl";
const MLB = "baseball_mlb";
const NCAAF = "americanfootball_ncaaf";

function baseParsed(overrides: Partial<ScrapedPromo>): ScrapedPromo {
  return {
    bookKey: "ballybet",
    externalId: "ext-1",
    promoType: "profit_boost",
    title: "Test Promo",
    rawText: "Test Promo raw text",
    sourceUrl: "https://example.com/promo",
    sportKeyHint: null,
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

function baseEvent(overrides: Partial<OddsEvent>): OddsEvent {
  return {
    id: "evt-default",
    sport_key: NFL,
    commence_time: "2026-09-27T17:00:00-04:00",
    home_team: "Denver Broncos",
    away_team: "Los Angeles Rams",
    bookmakers: [],
    ...overrides,
  };
}

const NOW = new Date("2026-09-26T12:00:00-04:00");
const emptyEvents = { moneyline: [] as OddsEvent[], extended: [] as OddsEvent[] };

// Every MatchResult produced by a test below is pushed here so the final
// invariant test can check status==="matched" iff all four signals true,
// across the full set of fixtures this plan requires.
const allResults: MatchResult[] = [];
function record(result: MatchResult): MatchResult {
  allResults.push(result);
  return result;
}

describe("matchPromo", () => {
  it("matches a Bally-style game promo (named game, window, no pinned market)", () => {
    const broncosVsRams = baseEvent({ id: "evt-broncos-rams" });
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: ["LA Rams", "DEN Broncos"],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:30:00-04:00",
    });

    const result = record(
      matchPromo(parsed, { moneyline: [broncosVsRams], extended: [] }, { now: NOW }),
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope).toEqual({
      kind: "event",
      eventId: "evt-broncos-rams",
      sportKey: NFL,
      homeTeam: "Denver Broncos",
      awayTeam: "Los Angeles Rams",
      commenceTime: "2026-09-27T17:00:00-04:00",
    });
    expect(result.pinned).toBeNull();
    expect(result.signals).toEqual({
      sportMatch: true,
      windowMatch: true,
      teamMatch: true,
      marketMatch: true,
    });
  });

  it("still matches the same promo with sportKeyHint null -- the unique event pins the sport", () => {
    const broncosVsRams = baseEvent({ id: "evt-broncos-rams-2" });
    const parsed = baseParsed({
      sportKeyHint: null,
      teamsText: ["LA Rams", "DEN Broncos"],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:30:00-04:00",
    });

    const result = record(
      matchPromo(parsed, { moneyline: [broncosVsRams], extended: [] }, { now: NOW }),
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope.sportKey).toBe(NFL);
    expect(result.signals).toEqual({
      sportMatch: true,
      windowMatch: true,
      teamMatch: true,
      marketMatch: true,
    });
  });

  it("matches a DraftKings-style sport-wide promo with zero cached events in the window", () => {
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: [],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:59:59-04:00",
    });

    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope).toEqual({
      kind: "sport_window",
      sportKey: NFL,
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:59:59-04:00",
    });
    expect(result.pinned).toBeNull();
    expect(result.signals).toEqual({
      sportMatch: true,
      windowMatch: true,
      teamMatch: true,
      marketMatch: true,
    });
  });

  it("matches a FanDuel-style CFB sport-wide promo", () => {
    const parsed = baseParsed({
      sportKeyHint: NCAAF,
      teamsText: [],
      windowStart: "2026-09-26T00:00:00-04:00",
      windowEnd: "2026-09-26T23:59:59-04:00",
    });

    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope.kind).toBe("sport_window");
  });

  it("fails a sport-wide promo with null window", () => {
    const parsed = baseParsed({ sportKeyHint: NFL, teamsText: [], windowStart: null, windowEnd: null });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.windowMatch).toBe(false);
    expect(result.guess).toBeNull();
  });

  it("fails a sport-wide promo whose window is longer than windowDays", () => {
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: [],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-10-10T00:00:00-04:00",
    });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.windowMatch).toBe(false);
  });

  it("fails a sport-wide promo whose window has already ended", () => {
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: [],
      windowStart: "2026-09-20T00:00:00-04:00",
      windowEnd: "2026-09-21T00:00:00-04:00",
    });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.windowMatch).toBe(false);
  });

  it("fails a sport-wide promo with sportKeyHint null even with a valid window", () => {
    const parsed = baseParsed({
      sportKeyHint: null,
      teamsText: [],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:59:59-04:00",
    });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.sportMatch).toBe(false);
    expect(result.guess).toBeNull();
  });

  it("fails teamMatch on an unresolvable team text and reports it in unresolvedTeamTexts", () => {
    const parsed = baseParsed({ sportKeyHint: NFL, teamsText: ["Nuggets", "Broncos"] });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.teamMatch).toBe(false);
    expect(result.unresolvedTeamTexts).toEqual(["Nuggets"]);
  });

  it("fails on an ambiguous team text ('Los Angeles')", () => {
    const parsed = baseParsed({ sportKeyHint: NFL, teamsText: ["Los Angeles", "Denver Broncos"] });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.unresolvedTeamTexts).toEqual(["Los Angeles"]);
  });

  it("fails windowMatch on an MLB doubleheader with no window, guessing the earliest game", () => {
    const game1 = baseEvent({
      id: "evt-dh-1",
      sport_key: MLB,
      commence_time: "2026-09-27T18:00:00-04:00",
      home_team: "Colorado Rockies",
      away_team: "Los Angeles Dodgers",
    });
    const game2 = baseEvent({
      id: "evt-dh-2",
      sport_key: MLB,
      commence_time: "2026-09-27T21:00:00-04:00",
      home_team: "Colorado Rockies",
      away_team: "Los Angeles Dodgers",
    });
    const parsed = baseParsed({
      sportKeyHint: MLB,
      teamsText: ["Dodgers", "Rockies"],
      windowStart: null,
      windowEnd: null,
    });

    const result = record(
      matchPromo(parsed, { moneyline: [game1, game2], extended: [] }, { now: NOW }),
    );

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.windowMatch).toBe(false);
    expect(result.guess).toEqual({
      kind: "event",
      eventId: "evt-dh-1",
      sportKey: MLB,
      homeTeam: "Colorado Rockies",
      awayTeam: "Los Angeles Dodgers",
      commenceTime: "2026-09-27T18:00:00-04:00",
    });
  });

  it("matches the day-2 game when the window contains only it", () => {
    const game1 = baseEvent({
      id: "evt-dh-1b",
      sport_key: MLB,
      commence_time: "2026-09-27T18:00:00-04:00",
      home_team: "Colorado Rockies",
      away_team: "Los Angeles Dodgers",
    });
    const game2 = baseEvent({
      id: "evt-dh-2b",
      sport_key: MLB,
      commence_time: "2026-09-28T18:00:00-04:00",
      home_team: "Colorado Rockies",
      away_team: "Los Angeles Dodgers",
    });
    const parsed = baseParsed({
      sportKeyHint: MLB,
      teamsText: ["Dodgers", "Rockies"],
      windowStart: "2026-09-28T00:00:00-04:00",
      windowEnd: "2026-09-28T23:59:59-04:00",
    });

    const result = record(
      matchPromo(parsed, { moneyline: [game1, game2], extended: [] }, { now: NOW }),
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope).toMatchObject({ eventId: "evt-dh-2b" });
  });

  it("fails teamMatch when the named event is not cached yet", () => {
    const parsed = baseParsed({ sportKeyHint: NFL, teamsText: ["LA Rams", "DEN Broncos"] });
    const result = record(matchPromo(parsed, emptyEvents, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.teamMatch).toBe(false);
    expect(result.guess).toBeNull();
  });

  it("never treats an already-started game as a candidate", () => {
    const started = baseEvent({
      id: "evt-started",
      commence_time: "2026-09-26T00:00:00-04:00", // before NOW
    });
    const parsed = baseParsed({ sportKeyHint: NFL, teamsText: ["LA Rams", "DEN Broncos"] });

    const result = record(matchPromo(parsed, { moneyline: [started], extended: [] }, { now: NOW }));

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.teamMatch).toBe(false);
    expect(result.guess).toBeNull();
  });

  it("excludes events outside sportKeyHint from the candidate pool", () => {
    const nflGame = baseEvent({ id: "evt-hint-nfl", sport_key: NFL });
    const wrongSportGame = baseEvent({ id: "evt-hint-nba", sport_key: "basketball_nba" });
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: ["LA Rams", "DEN Broncos"],
      windowStart: "2026-09-27T00:00:00-04:00",
      windowEnd: "2026-09-27T23:30:00-04:00",
    });

    const result = record(
      matchPromo(parsed, { moneyline: [nflGame, wrongSportGame], extended: [] }, { now: NOW }),
    );

    expect(result.status).toBe("matched");
    if (result.status !== "matched") throw new Error("unreachable");
    expect(result.scope).toMatchObject({ eventId: "evt-hint-nfl" });
  });

  it("fails marketMatch on a pinned spread whose cached line doesn't match", () => {
    const chiefsVsBroncos = baseEvent({
      id: "evt-pinned-spread",
      home_team: "Kansas City Chiefs",
      away_team: "Denver Broncos",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Kansas City Chiefs", price: -110, point: 2.5 },
                { name: "Denver Broncos", price: -110, point: -2.5 },
              ],
            },
          ],
        },
      ],
    });
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: ["Chiefs", "Broncos"],
      pinned: { selectionText: "Kansas City Chiefs", marketType: "spread", line: 3.5 },
    });

    const result = record(
      matchPromo(parsed, { moneyline: [], extended: [chiefsVsBroncos] }, { now: NOW }),
    );

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.marketMatch).toBe(false);
    expect(result.guess).toEqual({
      kind: "event",
      eventId: "evt-pinned-spread",
      sportKey: NFL,
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Denver Broncos",
      commenceTime: chiefsVsBroncos.commence_time,
    });
  });

  it("fails marketMatch on a pinned whole-number line", () => {
    const chiefsVsBroncos = baseEvent({
      id: "evt-pinned-whole",
      home_team: "Kansas City Chiefs",
      away_team: "Denver Broncos",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Kansas City Chiefs", price: -110, point: 3 },
                { name: "Denver Broncos", price: -110, point: -3 },
              ],
            },
          ],
        },
      ],
    });
    const parsed = baseParsed({
      sportKeyHint: NFL,
      teamsText: ["Chiefs", "Broncos"],
      pinned: { selectionText: "Kansas City Chiefs", marketType: "spread", line: 3 },
    });

    const result = record(
      matchPromo(parsed, { moneyline: [], extended: [chiefsVsBroncos] }, { now: NOW }),
    );

    expect(result.status).toBe("unmatched");
    if (result.status !== "unmatched") throw new Error("unreachable");
    expect(result.signals.marketMatch).toBe(false);
  });

  describe("college school names that prefix several teams (Georgia @ Alabama, 2026-10-08)", () => {
    const CFB_NOW = new Date("2026-10-08T23:33:15Z");
    const cfb = (id: string, home: string, away: string, commence: string) =>
      baseEvent({ id, sport_key: NCAAF, home_team: home, away_team: away, commence_time: commence });
    const georgiaAlabama = cfb("evt-uga-bama", "Alabama Crimson Tide", "Georgia Bulldogs", "2026-10-10T23:30:00Z");
    const georgiaTech = cfb("evt-gt", "Georgia Tech Yellow Jackets", "Duke Blue Devils", "2026-10-10T19:30:00Z");
    const georgiaSouthern = cfb("evt-gs", "Georgia Southern Eagles", "James Madison Dukes", "2026-10-10T23:30:00Z");
    const dkParsed = baseParsed({
      bookKey: "draftkings",
      sportKeyHint: null,
      teamsText: ["Georgia", "Alabama"],
      windowStart: "2026-10-10T04:00:00.000Z",
      windowEnd: "2026-10-11T03:59:59.999Z",
    });

    it("matches 'Georgia' to the only Georgia team that actually plays Alabama", () => {
      const events = { moneyline: [georgiaAlabama, georgiaTech, georgiaSouthern], extended: [] as OddsEvent[] };
      const result = record(matchPromo(dkParsed, events, { now: CFB_NOW }));

      expect(result.status).toBe("matched");
      if (result.status !== "matched") throw new Error("unreachable");
      expect(result.scope).toMatchObject({ kind: "event", eventId: "evt-uga-bama", homeTeam: "Alabama Crimson Tide", awayTeam: "Georgia Bulldogs" });
    });

    it("still fails as ambiguous when two different Georgia teams play Alabama in the window", () => {
      const rematch = cfb("evt-gt-bama", "Alabama Crimson Tide", "Georgia Tech Yellow Jackets", "2026-10-10T19:30:00Z");
      const events = { moneyline: [georgiaAlabama, georgiaTech, georgiaSouthern, rematch], extended: [] as OddsEvent[] };
      const result = record(matchPromo(dkParsed, events, { now: CFB_NOW }));

      expect(result.status).toBe("unmatched");
      if (result.status !== "unmatched") throw new Error("unreachable");
      expect(result.unresolvedTeamTexts).toEqual(["Georgia"]);
    });

    it("never narrows when the other side names no known team", () => {
      const parsed = { ...dkParsed, teamsText: ["Georgia", "Alabama College Football"] };
      const events = { moneyline: [georgiaAlabama, georgiaTech, georgiaSouthern], extended: [] as OddsEvent[] };
      const result = record(matchPromo(parsed, events, { now: CFB_NOW }));

      expect(result.status).toBe("unmatched");
      if (result.status !== "unmatched") throw new Error("unreachable");
      expect(result.unresolvedTeamTexts).toEqual(["Georgia", "Alabama College Football"]);
    });
  });

  it("invariant: status is 'matched' if and only if every signal is true, across every fixture above", () => {
    expect(allResults.length).toBeGreaterThan(0);
    for (const result of allResults) {
      const allTrue =
        result.signals.sportMatch &&
        result.signals.windowMatch &&
        result.signals.teamMatch &&
        result.signals.marketMatch;
      expect(result.status === "matched").toBe(allTrue);
    }
  });
});
