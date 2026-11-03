import { describe, expect, it } from "vitest";
import {
  MARKETS_GROUP_HELPER,
  MARKET_AVAILABILITY_NOTE,
  groupBookOptions,
  hasSportsbook,
  type BookPickerOption,
} from "./bookPickerGroups";

const OPTIONS: BookPickerOption[] = [
  { key: "draftkings", displayName: "DraftKings", venue: "sportsbook" },
  { key: "kalshi", displayName: "Kalshi", venue: "market" },
  { key: "fanduel", displayName: "FanDuel" },
  { key: "polymarket", displayName: "Polymarket", venue: "market" },
];

describe("groupBookOptions", () => {
  it("splits by venue preserving order; missing venue is a sportsbook", () => {
    const { sportsbooks, markets } = groupBookOptions(OPTIONS);
    expect(sportsbooks.map((o) => o.key)).toEqual(["draftkings", "fanduel"]);
    expect(markets.map((o) => o.key)).toEqual(["kalshi", "polymarket"]);
  });
});

describe("hasSportsbook", () => {
  const cases: [string[], boolean][] = [
    [[], false],
    [["kalshi"], false],
    [["kalshi", "polymarket"], false],
    [["draftkings"], true],
    [["fanduel", "kalshi"], true],
    [["unknown"], false],
  ];
  for (const [keys, expected] of cases) {
    it(`${JSON.stringify(keys)} -> ${expected}`, () => {
      expect(hasSportsbook(new Set(keys), OPTIONS)).toBe(expected);
    });
  }
});

describe("copy", () => {
  it("matches the UI-SPEC verbatim", () => {
    expect(MARKET_AVAILABILITY_NOTE).toBe(
      "Regulated by the CFTC, not Colorado's gaming division. Check it's available to you.",
    );
    expect(MARKETS_GROUP_HELPER).toBe("Optional. Used only to hedge your sportsbook promos.");
  });
});
