import { describe, expect, it } from "vitest";
import { splitTeams } from "./promoText";
import { sportFromTags, sportFromText } from "./sportHints";

describe("splitTeams", () => {
  it("splits '<team> vs. <team>'", () => {
    expect(splitTeams("LA Rams vs. DEN Broncos")).toEqual(["LA Rams", "DEN Broncos"]);
  });

  it("splits '<team> vs <team>' (no period)", () => {
    const result = splitTeams("BAL Ravens vs DAL Cowboys");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result).toEqual(["BAL Ravens", "DAL Cowboys"]);
  });

  it("never splits a whole sentence on ' @ ' into teams", () => {
    const sentence =
      "YOU CAN CHOOSE between a 50% Profit Boost Token OR an Up-7 Early Win Token to use on the Steelers @ Browns NFL Game on October 1st, 2026!";
    expect(splitTeams(sentence)).toBeNull();
  });

  it("returns null for sport-wide scope text with no named game", () => {
    expect(splitTeams("any WNBA playoff game")).toBeNull();
  });
});

describe("sportHints — sportFromText", () => {
  it("resolves supported sport keywords", () => {
    expect(sportFromText("NFL 50% Profit Boost")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_nfl",
    });
    expect(sportFromText("College Football 50% Profit Boost")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_ncaaf",
    });
    expect(sportFromText("CFB")).toEqual({ kind: "supported", sportKey: "americanfootball_ncaaf" });
    expect(sportFromText("NCAAF")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_ncaaf",
    });
    expect(sportFromText("College Basketball")).toEqual({
      kind: "supported",
      sportKey: "basketball_ncaab",
    });
    expect(sportFromText("NCAAB")).toEqual({ kind: "supported", sportKey: "basketball_ncaab" });
    expect(sportFromText("NBA")).toEqual({ kind: "supported", sportKey: "basketball_nba" });
    expect(sportFromText("MLB")).toEqual({ kind: "supported", sportKey: "baseball_mlb" });
    // quick-260928-it1: NHL moved from unsupported to supported.
    expect(sportFromText("NHL 50% Profit Boost")).toEqual({ kind: "supported", sportKey: "icehockey_nhl" });
    expect(sportFromText("Hockey Boost")).toEqual({ kind: "supported", sportKey: "icehockey_nhl" });
  });

  it("never matches WNBA as NBA", () => {
    expect(sportFromText("25% WNBA Profit Boost")).toEqual({
      kind: "unsupported",
      label: "WNBA",
    });
  });

  it("resolves unsupported sports", () => {
    expect(sportFromText("30% Soccer Profit Boost Token")).toEqual({
      kind: "unsupported",
      label: "Soccer",
    });
    expect(sportFromText("Golf 25% PBT - Presidents Cup")).toEqual({
      kind: "unsupported",
      label: "Golf",
    });
    expect(sportFromText("Tennis Grand Slam Boost")).toEqual({
      kind: "unsupported",
      label: "Tennis",
    });
    expect(sportFromText("UFC Fight Night Boost")).toEqual({
      kind: "unsupported",
      label: "MMA/UFC",
    });
  });

  it("returns unknown for team-name-only scope text with no sport hint", () => {
    expect(sportFromText("LA Rams vs. DEN Broncos")).toEqual({ kind: "unknown" });
  });

  it("resolves nfl from a Bally CTA path", () => {
    expect(sportFromText("/sports#sports-hub/american_football/nfl")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_nfl",
    });
  });
});

describe("sportHints — sportFromTags", () => {
  it("resolves ncaaf over the ambiguous american-football tag", () => {
    expect(sportFromTags(["american-football", "ncaaf"])).toEqual({
      kind: "supported",
      sportKey: "americanfootball_ncaaf",
    });
  });

  it("resolves nfl when both nfl and american-football tags are present", () => {
    expect(sportFromTags(["nfl", "american-football"])).toEqual({
      kind: "supported",
      sportKey: "americanfootball_nfl",
    });
  });

  it("resolves unsupported for golf", () => {
    expect(sportFromTags(["golf"])).toEqual({ kind: "unsupported", label: "Golf" });
  });

  it("returns unknown for the ambiguous american-football tag alone", () => {
    expect(sportFromTags(["american-football"])).toEqual({ kind: "unknown" });
  });
});
