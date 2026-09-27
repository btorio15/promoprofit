import { describe, expect, it } from "vitest";
import { TEAM_ALIASES, normalizeTeamText, resolveTeam } from "./aliases";

const NFL = "americanfootball_nfl";
const NCAAF = "americanfootball_ncaaf";

const NFL_KNOWN_TEAMS = [
  { sportKey: NFL, name: "Denver Broncos" },
  { sportKey: NFL, name: "Los Angeles Rams" },
  { sportKey: NFL, name: "Los Angeles Chargers" },
  { sportKey: NFL, name: "Baltimore Ravens" },
  { sportKey: NFL, name: "Dallas Cowboys" },
];

const NCAAF_KNOWN_TEAMS = [
  { sportKey: NCAAF, name: "Colorado Buffaloes" },
  { sportKey: NCAAF, name: "Colorado State Rams" },
];

describe("TEAM_ALIASES", () => {
  it("covers exactly 32 NFL, 30 NBA and 30 MLB canonical keys", () => {
    expect(Object.keys(TEAM_ALIASES.americanfootball_nfl)).toHaveLength(32);
    expect(Object.keys(TEAM_ALIASES.basketball_nba)).toHaveLength(30);
    expect(Object.keys(TEAM_ALIASES.baseball_mlb)).toHaveLength(30);
  });
});

describe("normalizeTeamText", () => {
  it("trims, lowercases, strips periods, collapses whitespace, drops a leading 'the'", () => {
    expect(normalizeTeamText("  The L.A. Rams ")).toBe("la rams");
  });
});

describe("resolveTeam", () => {
  it("resolves nickname/abbreviation/city/compound forms to Denver Broncos", () => {
    expect(resolveTeam("Broncos", NFL_KNOWN_TEAMS, NFL)).toEqual(["Denver Broncos"]);
    expect(resolveTeam("DEN", NFL_KNOWN_TEAMS, NFL)).toEqual(["Denver Broncos"]);
    expect(resolveTeam("Denver", NFL_KNOWN_TEAMS, NFL)).toEqual(["Denver Broncos"]);
    expect(resolveTeam("DEN Broncos", NFL_KNOWN_TEAMS, NFL)).toEqual(["Denver Broncos"]);
  });

  it("resolves 'LA Rams' to Los Angeles Rams via the abbreviation+nickname split", () => {
    expect(resolveTeam("LA Rams", NFL_KNOWN_TEAMS, NFL)).toEqual(["Los Angeles Rams"]);
  });

  it("resolves 'BAL Ravens' and 'DAL Cowboys'", () => {
    expect(resolveTeam("BAL Ravens", NFL_KNOWN_TEAMS, NFL)).toEqual(["Baltimore Ravens"]);
    expect(resolveTeam("DAL Cowboys", NFL_KNOWN_TEAMS, NFL)).toEqual(["Dallas Cowboys"]);
  });

  it("resolves a bare 'Los Angeles'/'LA' ambiguously (2 names) so the caller fails it", () => {
    const byLa = resolveTeam("LA", NFL_KNOWN_TEAMS, NFL);
    const byLosAngeles = resolveTeam("Los Angeles", NFL_KNOWN_TEAMS, NFL);
    expect([...byLa].sort()).toEqual(["Los Angeles Chargers", "Los Angeles Rams"]);
    expect([...byLosAngeles].sort()).toEqual(["Los Angeles Chargers", "Los Angeles Rams"]);
  });

  it("resolves an ambiguous NCAA city to 2 names, but a full name to exactly 1", () => {
    const byColorado = resolveTeam("Colorado", NCAAF_KNOWN_TEAMS, NCAAF);
    expect([...byColorado].sort()).toEqual(["Colorado Buffaloes", "Colorado State Rams"]);

    expect(resolveTeam("Colorado Buffaloes", NCAAF_KNOWN_TEAMS, NCAAF)).toEqual(["Colorado Buffaloes"]);
  });

  it("never guesses when abbreviation and nickname disagree", () => {
    expect(resolveTeam("DEN Rams", NFL_KNOWN_TEAMS, NFL)).toEqual([]);
  });

  it("returns [] for unknown text", () => {
    expect(resolveTeam("Nuggets", NFL_KNOWN_TEAMS, NFL)).toEqual([]);
    expect(resolveTeam("Nonexistent Team Name", NFL_KNOWN_TEAMS, NFL)).toEqual([]);
  });
});
