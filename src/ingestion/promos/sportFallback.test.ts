import { describe, expect, it } from "vitest";
import { sportFromPromoText } from "./sportHints";

describe("sportFromPromoText (promos whose game was not matched)", () => {
  it("reads a sport name from the text", () => {
    expect(sportFromPromoText("NFL London No Sweat", "NFL London game IND Colts vs WAS Commanders")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_nfl",
    });
  });

  it("reads Stanley Cup as NHL", () => {
    expect(sportFromPromoText("50% Stanley Cup Champion Profit Boost", "")).toEqual({
      kind: "supported",
      sportKey: "icehockey_nhl",
    });
  });

  it("reads the sport from the two team names in a Team A @ Team B title", () => {
    expect(sportFromPromoText("PHI Eagles @ CHI Bears 50% SGP Boost", "")).toEqual({
      kind: "supported",
      sportKey: "americanfootball_nfl",
    });
    expect(sportFromPromoText("PHI Phillies @ ATL Braves 30% Profit Boost", "")).toEqual({
      kind: "supported",
      sportKey: "baseball_mlb",
    });
  });

  it("keeps promos with no sport in the text unknown", () => {
    expect(sportFromPromoText("Bet $5, Get $50 for 5 days", "New customer offer")).toEqual({ kind: "unknown" });
  });

  it("does not turn an unsupported sport into a supported one", () => {
    expect(sportFromPromoText("WNBA Profit Boost", "")).toEqual({ kind: "unsupported", label: "WNBA" });
  });
});
