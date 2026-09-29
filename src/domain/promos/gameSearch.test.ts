import { describe, expect, it } from "vitest";
import type { CorrectionEventOption } from "./correctionOptions";
import { eventSearchText, groupEventOptions, normalizeSearchText, searchEventOptions } from "./gameSearch";

function ev(
  id: string,
  sportKey: string,
  sportLabel: string,
  away: string,
  home: string,
  commenceTime: string,
  etDate: string,
): CorrectionEventOption {
  return {
    eventId: id,
    sportKey,
    sportLabel,
    label: `${away} @ ${home}`,
    commenceTime,
    homeTeam: home,
    awayTeam: away,
    etDate,
    searchText: eventSearchText(sportKey, home, away),
    markets: [],
  };
}

const RAMS = ev("rams", "americanfootball_nfl", "NFL", "Los Angeles Rams", "Denver Broncos", "2026-09-27T17:00:00Z", "2026-09-27");
const NBA = ev("nuggets", "basketball_nba", "NBA", "Boston Celtics", "Denver Nuggets", "2026-09-27T23:00:00Z", "2026-09-27");
const PACKERS = ev("packers", "americanfootball_nfl", "NFL", "Green Bay Packers", "Chicago Bears", "2026-09-28T17:00:00Z", "2026-09-28");
const HABS = ev("habs", "icehockey_nhl", "NHL", "Montréal Canadiens", "Toronto Maple Leafs", "2026-09-28T23:00:00Z", "2026-09-28");
const CSU = ev("csu", "americanfootball_ncaaf", "NCAAF", "Colorado State Rams", "Wyoming Cowboys", "2026-09-28T20:00:00Z", "2026-09-28");
const ALL = [RAMS, NBA, PACKERS, HABS, CSU];

const ids = (list: { eventId: string }[]) => list.map((e) => e.eventId);

describe("normalizeSearchText", () => {
  it.each([
    ["Montréal", "montreal"],
    ["  Rams @ Broncos ", "rams broncos"],
    ["St. Louis", "st louis"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });
});

describe("searchEventOptions", () => {
  it.each([
    ["", ["rams", "nuggets", "packers", "habs", "csu"]],
    ["   ", ["rams", "nuggets", "packers", "habs", "csu"]],
    ["broncos", ["rams"]],
    ["BRON", ["rams"]],
    ["Bron", ["rams"]],
    ["den", ["rams", "nuggets"]],
    ["rams @ broncos", ["rams"]],
    ["rams vs broncos", ["rams"]],
    ["rams at broncos", ["rams"]],
    ["LAR", ["rams"]],
    ["green bay", ["packers"]],
    ["montreal", ["habs"]],
    ["MONTRÉAL", ["habs"]],
    ["canadiens", ["habs"]],
    ["nhl", ["habs"]],
    ["wyoming", ["csu"]],
    ["ams", []],
    ["xyz", []],
  ])("%j -> %j", (query, expected) => {
    expect(ids(searchEventOptions(ALL, query))).toEqual(expected);
  });

  it("does not mutate its input", () => {
    const copy = [...ALL];
    searchEventOptions(ALL, "den");
    expect(ALL).toEqual(copy);
  });
});

describe("groupEventOptions", () => {
  it("groups by league then ET day, preserving order", () => {
    const groups = groupEventOptions(ALL);
    expect(groups.map((g) => g.sportKey)).toEqual([
      "americanfootball_nfl",
      "basketball_nba",
      "icehockey_nhl",
      "americanfootball_ncaaf",
    ]);
    const nfl = groups[0];
    expect(nfl.days.map((d) => d.etDate)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(ids(nfl.days[1].events)).toEqual(["packers"]);
  });

  it("uses each event's ET day, not the UTC day", () => {
    const late = ev("late", "americanfootball_nfl", "NFL", "A", "B", "2026-09-28T03:30:00Z", "2026-09-27");
    const early = ev("early", "americanfootball_nfl", "NFL", "C", "D", "2026-09-28T04:30:00Z", "2026-09-28");
    const [nfl] = groupEventOptions([late, early]);
    expect(nfl.days.map((d) => d.etDate)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(nfl.days[0].dayLabel).toBe("Sun, Sep 27");
    expect(nfl.days[1].dayLabel).toBe("Mon, Sep 28");
  });

  it("returns [] for no events", () => {
    expect(groupEventOptions([])).toEqual([]);
  });
});
