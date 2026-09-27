import { describe, expect, it } from "vitest";
import { classifyExclusion } from "./exclusions";

function classify(title: string, text = "") {
  return classifyExclusion({ title, text });
}

describe("classifyExclusion — D-15 skip reasons", () => {
  it("classifies SGP-shaped titles", () => {
    expect(classify("25% LA Rams vs. DEN Broncos SGP Profit Boost")).toBe("sgp");
    expect(classify("MLB SGP(x) Boost")).toBe("sgp");
  });

  it("classifies Parlay-shaped titles", () => {
    expect(classify("50% MLB Parlay Profit Boost")).toBe("parlay");
    expect(classify("College Football 50% Parlay Boost")).toBe("parlay");
  });

  it("classifies live-wager-only promos (title names the game, terms say Live Wagers Only)", () => {
    expect(
      classify(
        "30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost",
        "Live Wagers Only",
      ),
    ).toBe("live_only");
  });

  it("classifies a title-level Parlay signal over an incidental Scorer/prop mention", () => {
    expect(classify("25% NFL TD Scorer Parlay Profit Boost")).toBe("parlay");
  });

  it("classifies a pure player-prop title (no parlay/sgp qualifier) as prop", () => {
    expect(classify("NFL Anytime TD Scorer Boost")).toBe("prop");
  });

  it("classifies futures/outright titles", () => {
    expect(classify("50% Stanley Cup Champion Profit Boost")).toBe("futures");
    expect(classify("NHL Futures 25% Profit Boost")).toBe("futures");
    expect(classify("Golf 25% PBT - Presidents Cup")).toBe("outright");
  });

  it("classifies new-customer/deposit categories", () => {
    expect(classify("Some Boost", "")).not.toBe("new_customer"); // sanity: no category, no signal
    expect(
      classifyExclusion({ title: "Some Boost", text: "", category: "New Customers" }),
    ).toBe("new_customer");
    const depositResult = classifyExclusion({
      title: "New Customers: Deposit Bonus up to $1,000",
      text: "",
    });
    expect(["deposit", "new_customer"]).toContain(depositResult);
    expect(depositResult).not.toBeNull();
    expect(classify("New User Bet & Get")).toBe("new_customer");
  });

  it("classifies pick'em / sweepstakes / giveaway / refer-a-friend / bet-protect / account-linking as not_a_promo", () => {
    expect(
      classify("NFL Weekly Pick 'Em - Over $1,000,000 in Bonus Bets!"),
    ).toBe("not_a_promo");
    expect(classify("Sweepstakes Giveaway")).toBe("not_a_promo");
    expect(classify("Refer-a-Friend Bonus")).toBe("not_a_promo");
    expect(classify("Bet Protect")).toBe("not_a_promo");
    expect(classify("Link Your Account for a Bonus")).toBe("not_a_promo");
  });

  it("keeps a DraftKings boost whose terms name Single among eligible bet types", () => {
    const result = classifyExclusion({
      title: "NFL 50% Profit Boost",
      text: "Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet.",
    });
    expect(result).toBeNull();
  });

  it("excludes terms mentioning Parlay/SGP with no Single and no any-wager wording", () => {
    const result = classifyExclusion({
      title: "MLB Boost",
      text: "This boost only applies to Parlay or SGP bets.",
    });
    expect(["parlay", "sgp"]).toContain(result);
  });

  it("keeps a game-named boost with 'Any Wager' wording", () => {
    const result = classifyExclusion({
      title: "10% LA Rams vs. DEN Broncos Profit Boost",
      text: "Any Wager",
    });
    expect(result).toBeNull();
  });
});
