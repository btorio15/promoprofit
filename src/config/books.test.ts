import { describe, expect, it } from "vitest";
import { estimateRefreshCredits } from "@/ingestion/odds/quota";
import {
  COLORADO_BOOKS,
  groupHedgeBookKeys,
  hedgeBooksFrom,
  isMarketVenue,
  marketVenuesFrom,
  refreshBookmakerKeys,
  refreshKeysFrom,
  usableHedgeBooks,
  usableMarketVenues,
  usableOddsBooks,
  type BookConfig,
} from "./books";

const SPORTSBOOKS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "betrivers",
  "espnbet",
  "hardrockbet",
  "ballybet",
];

describe("book config venue split", () => {
  it("usableOddsBooks is exactly the 7 free sportsbooks in order", () => {
    expect(usableOddsBooks().map((b) => b.key)).toEqual(SPORTSBOOKS);
  });

  it("usableMarketVenues is kalshi then polymarket_us", () => {
    const m = usableMarketVenues();
    expect(m.map((b) => b.key)).toEqual(["kalshi", "polymarket_us"]);
    expect(m.map((b) => b.sortOrder)).toEqual([20, 21]);
    expect(m.every((b) => b.venue === "market")).toBe(true);
  });

  it("usableHedgeBooks = sportsbooks then markets", () => {
    expect(usableHedgeBooks().map((b) => b.key)).toEqual([
      ...SPORTSBOOKS,
      "kalshi",
      "polymarket_us",
    ]);
  });

  it("refresh list stays within one bookmakers= bucket (D-06)", () => {
    expect(
      refreshBookmakerKeys().length,
      "D-06: refresh must stay <= 10 bookmaker keys (one credit bucket)",
    ).toBeLessThanOrEqual(10);
    expect(refreshBookmakerKeys()).toEqual([...SPORTSBOOKS, "kalshi", "polymarket_us"]);
  });

  it("credit estimate is unchanged versus 7 books", () => {
    expect(estimateRefreshCredits(4, refreshBookmakerKeys().length)).toBe(
      estimateRefreshCredits(4, usableOddsBooks().length),
    );
  });

  it("groupHedgeBookKeys is sportsbooks only", () => {
    expect(groupHedgeBookKeys()).toEqual(SPORTSBOOKS);
  });

  it("isMarketVenue", () => {
    expect(isMarketVenue("kalshi")).toBe(true);
    expect(isMarketVenue("polymarket_us")).toBe(true);
    expect(isMarketVenue("draftkings")).toBe(false);
    expect(isMarketVenue("polymarket")).toBe(false);
  });

  it("marketSource dropped removes a venue; kalshi_native stays a venue but not a refresh key", () => {
    const withSource = (key: string, source: BookConfig["marketSource"]): BookConfig[] =>
      COLORADO_BOOKS.map((b) => (b.key === key ? { ...b, marketSource: source } : b));

    const dropped = withSource("kalshi", "dropped");
    expect(marketVenuesFrom(dropped).map((b) => b.key)).toEqual(["polymarket_us"]);
    expect(hedgeBooksFrom(dropped).map((b) => b.key)).not.toContain("kalshi");
    expect(refreshKeysFrom(dropped)).not.toContain("kalshi");

    const native = withSource("kalshi", "kalshi_native");
    expect(marketVenuesFrom(native).map((b) => b.key)).toContain("kalshi");
    expect(refreshKeysFrom(native)).not.toContain("kalshi");
    expect(refreshKeysFrom(native)).toContain("polymarket_us");
  });
});
