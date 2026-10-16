import { describe, expect, it } from "vitest";
import type { CorrectionSportDayOption } from "./correctionOptions";
import {
  EMPTY_SCOPE_DRAFT,
  fromDayOptions,
  gamePickState,
  leagueOptions,
  MAX_PICKED_GAMES,
  pickedLeague,
  prefillScopeDraft,
  removePickedGame,
  scopeInputFromDraft,
  singlePickedEventId,
  togglePickedGame,
  selectFromDay,
  selectLeague,
  type ScopeDraft,
} from "./scopeDraft";

const NOW = new Date("2026-09-27T00:00:00Z");

function day(sportKey: string, sportLabel: string, etDate: string): CorrectionSportDayOption {
  return { value: `${sportKey}|${etDate}`, sportKey, sportLabel, etDate, label: `Any ${sportLabel} game` };
}

const DAYS = [
  day("americanfootball_nfl", "NFL", "2026-09-27"),
  day("americanfootball_nfl", "NFL", "2026-09-28"),
  day("basketball_nba", "NBA", "2026-09-29"),
];

const league = (over: Partial<ScopeDraft>): ScopeDraft => ({ ...EMPTY_SCOPE_DRAFT, mode: "league", ...over });

describe("scopeInputFromDraft", () => {
  it.each([
    ["empty", EMPTY_SCOPE_DRAFT],
    ["game without event", { ...EMPTY_SCOPE_DRAFT, mode: "game" as const }],
    ["league without sport", league({ fromEtDate: "2026-09-27" })],
    ["league without from", league({ sportKey: "americanfootball_nfl" })],
  ])("%s -> null", (_n, draft) => {
    expect(scopeInputFromDraft(draft)).toBeNull();
  });

  it("game mode -> event", () => {
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: ["e1"] })).toStrictEqual({ kind: "event", eventId: "e1" });
  });

  it.each([null, "", "2026-09-27"])("single day (through=%j) has no etEndDate key", (through) => {
    const out = scopeInputFromDraft(
      league({ sportKey: "americanfootball_nfl", fromEtDate: "2026-09-27", throughEtDate: through }),
    );
    expect(out).toStrictEqual({ kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-09-27" });
    expect(Object.keys(out!)).not.toContain("etEndDate");
  });

  it("multi-day adds etEndDate", () => {
    expect(
      scopeInputFromDraft(
        league({ sportKey: "americanfootball_nfl", fromEtDate: "2026-09-27", throughEtDate: "2026-09-28" }),
      ),
    ).toStrictEqual({ kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-09-27", etEndDate: "2026-09-28" });
  });

  it("uses only the active mode's fields", () => {
    const both = league({ eventIds: ["e1"], sportKey: "basketball_nba", fromEtDate: "2026-09-29" });
    expect(scopeInputFromDraft(both)).toStrictEqual({ kind: "sport_day", sportKey: "basketball_nba", etDate: "2026-09-29" });
    expect(scopeInputFromDraft({ ...both, mode: "game" })).toStrictEqual({ kind: "event", eventId: "e1" });
  });
});

describe("leagueOptions / fromDayOptions", () => {
  it("lists distinct leagues in first-appearance order", () => {
    expect(leagueOptions(DAYS)).toEqual([
      { sportKey: "americanfootball_nfl", sportLabel: "NFL" },
      { sportKey: "basketball_nba", sportLabel: "NBA" },
    ]);
  });

  it("lists only that league's days with ET labels", () => {
    expect(fromDayOptions(DAYS, "americanfootball_nfl")).toEqual([
      { etDate: "2026-09-27", label: "Sun, Sep 27" },
      { etDate: "2026-09-28", label: "Mon, Sep 28" },
    ]);
    expect(fromDayOptions(DAYS, null)).toEqual([]);
  });
});

describe("selectLeague / selectFromDay", () => {
  it("auto-selects the league's first day", () => {
    expect(selectLeague(EMPTY_SCOPE_DRAFT, "basketball_nba", DAYS)).toEqual(
      league({ sportKey: "basketball_nba", fromEtDate: "2026-09-29", throughEtDate: "2026-09-29" }),
    );
  });

  it("unknown league leaves days null", () => {
    const out = selectLeague(EMPTY_SCOPE_DRAFT, "icehockey_nhl", DAYS);
    expect(out.fromEtDate).toBeNull();
    expect(out.throughEtDate).toBeNull();
  });

  it("keeps a still-valid through, resets otherwise", () => {
    const base = league({ sportKey: "americanfootball_nfl", fromEtDate: "2026-09-27", throughEtDate: "2026-09-29" });
    expect(selectFromDay(base, "2026-09-28", NOW).throughEtDate).toBe("2026-09-29");
    expect(selectFromDay(base, "2026-09-30", NOW).throughEtDate).toBe("2026-09-30");
  });
});

describe("prefillScopeDraft", () => {
  it("prefills league mode from a multi-day window", () => {
    expect(
      prefillScopeDraft({ sportKey: "americanfootball_nfl", startEtDate: "2026-09-27", endEtDate: "2026-09-28" }, DAYS, NOW),
    ).toEqual(league({ sportKey: "americanfootball_nfl", fromEtDate: "2026-09-27", throughEtDate: "2026-09-28" }));
  });

  it("null for a null window or no same-league day", () => {
    expect(prefillScopeDraft(null, DAYS, NOW)).toBeNull();
    expect(
      prefillScopeDraft({ sportKey: "icehockey_nhl", startEtDate: "2026-09-27", endEtDate: "2026-09-28" }, DAYS, NOW),
    ).toBeNull();
  });
});

describe("multi-select picking (quick-261016-1se)", () => {
  const EVENTS = [
    { eventId: "n1", sportKey: "americanfootball_nfl" },
    { eventId: "n2", sportKey: "americanfootball_nfl" },
    { eventId: "b1", sportKey: "basketball_nba" },
  ];
  const [n1, n2, b1] = EVENTS;

  it("first pick sets game mode and locks the league", () => {
    const d = togglePickedGame({ ...EMPTY_SCOPE_DRAFT, mode: "league" }, n1, EVENTS);
    expect(d.mode).toBe("game");
    expect(d.eventIds).toEqual(["n1"]);
    expect(pickedLeague(d, EVENTS)).toBe("americanfootball_nfl");
  });

  it("another league is a no-op while locked", () => {
    const d = togglePickedGame(EMPTY_SCOPE_DRAFT, n1, EVENTS);
    expect(gamePickState(d, b1, EVENTS)).toBe("other_league");
    expect(togglePickedGame(d, b1, EVENTS)).toBe(d);
  });

  it("toggling a picked game removes it; the last removal unlocks the league", () => {
    const one = togglePickedGame(EMPTY_SCOPE_DRAFT, n1, EVENTS);
    const two = togglePickedGame(one, n2, EVENTS);
    expect(two.eventIds).toEqual(["n1", "n2"]);
    expect(togglePickedGame(two, n2, EVENTS).eventIds).toEqual(["n1"]);
    const none = removePickedGame(one, "n1");
    expect(none.eventIds).toEqual([]);
    expect(pickedLeague(none, EVENTS)).toBeNull();
    expect(gamePickState(none, b1, EVENTS)).toBe("available");
  });

  it("caps at 12 picks", () => {
    const many = Array.from({ length: MAX_PICKED_GAMES + 1 }, (_, i) => ({ eventId: `g${i}`, sportKey: "americanfootball_nfl" }));
    let d: ScopeDraft = EMPTY_SCOPE_DRAFT;
    for (const g of many) d = togglePickedGame(d, g, many);
    expect(d.eventIds).toHaveLength(12);
    expect(gamePickState(d, many[12], many)).toBe("full");
    expect(togglePickedGame(d, many[12], many)).toBe(d);
    expect(togglePickedGame(d, many[0], many).eventIds).toHaveLength(11);
  });

  it("pickedLeague ignores stale ids and uses the first known pick", () => {
    const d: ScopeDraft = { ...EMPTY_SCOPE_DRAFT, eventIds: ["gone", "b1"] };
    expect(pickedLeague(d, EVENTS)).toBe("basketball_nba");
    expect(pickedLeague({ ...EMPTY_SCOPE_DRAFT, eventIds: ["gone"] }, EVENTS)).toBeNull();
  });

  it("scopeInputFromDraft: 0 -> null, 1 -> event, 2-12 -> games, 13 -> null", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${i}`);
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: [] })).toBeNull();
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: ids(1) })).toStrictEqual({ kind: "event", eventId: "g0" });
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: ids(2) })).toStrictEqual({ kind: "games", eventIds: ids(2) });
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: ids(12) })).toStrictEqual({ kind: "games", eventIds: ids(12) });
    expect(scopeInputFromDraft({ ...EMPTY_SCOPE_DRAFT, eventIds: ids(13) })).toBeNull();
  });

  it("singlePickedEventId only for game mode with exactly one pick", () => {
    expect(singlePickedEventId({ ...EMPTY_SCOPE_DRAFT, eventIds: ["a"] })).toBe("a");
    expect(singlePickedEventId({ ...EMPTY_SCOPE_DRAFT, eventIds: ["a", "b"] })).toBeNull();
    expect(singlePickedEventId({ ...EMPTY_SCOPE_DRAFT, mode: "league", eventIds: ["a"] })).toBeNull();
  });
});
