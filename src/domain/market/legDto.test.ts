import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { MarketFill } from "./marketLeg";
import { MarketLegDTOSchema, marketLegText, tieRiskTooltipText, toMarketLegDTO } from "./legDto";
import { settlementNoteFor } from "./settlement";

function fill(over: Partial<MarketFill> = {}): MarketFill {
  return {
    venueKey: "kalshi",
    side: "yes",
    priceCents: 61,
    contracts: 42,
    cost: new Decimal("25.62"),
    fee: new Decimal("0.70"),
    outlay: new Decimal("26.32"),
    availableContracts: null,
    ...over,
  };
}
const opts = { sportKey: "americanfootball_nfl", venueName: "Kalshi" };

describe("toMarketLegDTO", () => {
  it("builds the DTO", () => {
    expect(toMarketLegDTO(fill(), opts)).toEqual({
      venueKey: "kalshi",
      venueName: "Kalshi",
      side: "yes",
      contracts: 42,
      priceCents: 61,
      cost: "25.62",
      fee: "0.70",
      outlay: "26.32",
      americanDisplay: -156,
      liquidity: { kind: "price_may_move" },
      settlementNote: settlementNoteFor("americanfootball_nfl", "kalshi"),
    });
  });
  it("thin when available < contracts", () => {
    expect(toMarketLegDTO(fill({ availableContracts: 30 }), opts).liquidity).toEqual({
      kind: "thin",
      available: 30,
      needed: 42,
    });
  });
  it.each([42, 100])("not thin at available %i", (a) => {
    expect(toMarketLegDTO(fill({ availableContracts: a }), opts).liquidity.kind).toBe(
      "price_may_move",
    );
  });
  it("round-trips through the schema", () => {
    expect(() => MarketLegDTOSchema.parse(toMarketLegDTO(fill(), opts))).not.toThrow();
  });
  it.each([0, 100])("rejects priceCents %i", (p) => {
    expect(() =>
      MarketLegDTOSchema.parse({ ...toMarketLegDTO(fill(), opts), priceCents: p }),
    ).toThrow();
  });
  it("rejects non-integer contracts", () => {
    expect(() =>
      MarketLegDTOSchema.parse({ ...toMarketLegDTO(fill(), opts), contracts: 4.5 }),
    ).toThrow();
  });
});

describe("marketLegText", () => {
  it("YES", () => {
    expect(marketLegText(toMarketLegDTO(fill(), opts))).toBe(
      "buy 42 YES @ 61¢ ($25.62 + $0.70 fee) ≈ −156",
    );
  });
  it("NO", () => {
    const f = fill({
      side: "no",
      priceCents: 39,
      cost: new Decimal("16.38"),
      fee: new Decimal("0.69"),
      outlay: new Decimal("17.07"),
    });
    expect(marketLegText(toMarketLegDTO(f, opts))).toBe(
      "buy 42 NO @ 39¢ ($16.38 + $0.69 fee) ≈ +156",
    );
  });
  it("zero fee still printed", () => {
    expect(marketLegText(toMarketLegDTO(fill({ fee: new Decimal("0") }), opts))).toContain(
      "$0.00 fee",
    );
  });
});

describe("tieRiskTooltipText", () => {
  it("both variants", () => {
    expect(tieRiskTooltipText(false)).toBe(
      "Regular-season NFL games can end in a tie (<1% historically). A tie voids both legs: profit becomes $0, no cash loss.",
    );
    expect(tieRiskTooltipText(true)).toBe(
      "Regular-season NFL games can end in a tie (<1% historically). With a prediction-market hedge a tie does not void both legs; see Settlement differs.",
    );
  });
});
