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

  it.each([
    ["pre-live wager", "Get a 30% Profit Boost Token to use on any pre-live wager for the Eagles @ Bears NFL Game on September 28"],
    ["pre live wager (space, no hyphen)", "Get a 30% Profit Boost Token to use on any pre live wager for the Eagles @ Bears NFL Game on September 28"],
    ["Pre-Live Wagers (plural, mixed case)", "Valid on any Pre-Live Wagers for tonight's game"],
  ])("does not classify %s as live_only (pre-live means pre-game, not live)", (_label, text) => {
    expect(classify("NFL Boost", text)).not.toBe("live_only");
  });

  it("classifies a title-level Parlay signal over an incidental Scorer/prop mention", () => {
    expect(classify("25% NFL TD Scorer Parlay Profit Boost")).toBe("parlay");
  });

  it("classifies a pure player-prop title (no parlay/sgp qualifier) as prop", () => {
    expect(classify("NFL Anytime TD Scorer Boost")).toBe("prop");
  });

  it.each([
    [
      "Sunday Night Football Super Boost",
      "Bet Waddle & Adams to record 40+ Receiving Yards each boosted to +100!",
    ],
    ["Super Boost", "Rushing Yards"],
    ["Super Boost", "Passing Yards"],
    ["Super Boost", "5+ Receptions"],
    ["Super Boost", "8+ Strikeouts"],
    ["Super Boost", "10+ Rebounds"],
    ["Super Boost", "10+ Assists"],
    ["Super Boost", "Points + Rebounds + Assists"],
    ["Super Boost", "to each have 40+ Receiving Yards"],
    ["Super Boost", "to record 2+ hits"],
  ])("classifies player-stat Super Boost wording as prop: %s / %s", (title, text) => {
    expect(classify(title, text)).toBe("prop");
  });

  it.each([
    ["NFL 50% Profit Boost", "Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet."],
    ["NFL 50% Profit Boost", "Total bet odds must be -200 or longer."],
    ["10% LA Rams vs. DEN Broncos Profit Boost", "LA Rams vs. DEN Broncos ... Any Wager"],
    ["NFL Boost", "Broncos -3.5 points"],
    ["NFL Boost", "Over 45.5 total points"],
    ["NFL Boost", "keep a record of your bets"],
  ])("does not classify unrelated copy as prop: %s / %s", (title, text) => {
    expect(classify(title, text)).not.toBe("prop");
  });

  it.each([
    ["MLB HR Bet and Get", ""],
    ["Super Boost", "Bet a HR, get a Bonus Bet for HRs hit in that game!"],
    ["Super Boost", "Place a pre-game Home Run bet (Under Batter > Home Runs)"],
    ["Super Boost", "every home run hit in the game"],
    ["Super Boost", "Batter > Hits"],
  ])("classifies HR / home run / batter-prop wording as prop: %s / %s", (title, text) => {
    expect(classify(title, text)).toBe("prop");
  });

  it.each([
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. Offer runs through 9/28.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. Thursday Night Football special.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. Prices may shrink as running total updates.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. Bonus bet issued within 24 hr window.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. Reward issued within 48 hrs of settlement.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. View in Chrome for best results.",
    ],
    [
      "NFL 50% Profit Boost",
      "Opt-in and get One (1) Profit Boost for all NFL games. Profit Boost: 50% Max betting limits apply. This offer runs the promo through 9/28.",
    ],
  ])("does not classify lowercase hr/run-containing boilerplate words as prop: %s / %s", (title, text) => {
    expect(classify(title, text)).not.toBe("prop");
  });

  it("the case-sensitive HRs? boundary does not match inside 'through', 'Thursday', or '3hrs'", () => {
    expect(classify("NFL Boost", "Offer runs through 9/28.")).not.toBe("prop");
    expect(classify("NFL Boost", "Thursday Night special.")).not.toBe("prop");
    expect(classify("NFL Boost", "Reward issued within 3hrs.")).not.toBe("prop");
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

  it("WR-05: keeps a single-game boost whose copy says 'open', 'to win the game' or 'Championship Sunday'", () => {
    expect(
      classifyExclusion({
        title: "25% NFL Profit Boost",
        text: "Offer open to Colorado customers. Bet on the Broncos to win the game on Championship Sunday. Any Wager.",
      }),
    ).toBeNull();
  });

  it("WR-05: still excludes named tournaments and futures wording", () => {
    expect(classifyExclusion({ title: "Golf Boost", text: "Any wager on the US Open winner" })).toBe("outright");
    expect(classifyExclusion({ title: "Boost: Chiefs to win the Super Bowl", text: "Any Wager" })).toBe("futures");
    expect(classifyExclusion({ title: "NHL Boost", text: "Valid for all NHL Futures" })).toBe("futures");
  });
});
