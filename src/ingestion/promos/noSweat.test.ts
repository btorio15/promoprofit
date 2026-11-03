import { describe, expect, it } from "vitest";
import { classifyNoSweat, parseNoSweatRefundCap } from "./noSweat";

// quick-261016-k8a / A-12: real DraftKings promo text (stake refunded as a Bonus Bet).
const LONDON_TEXT =
  "MAX REWARD: $10\n2. Opt-In and receive a No Sweat Token for the London HOU Texans vs JAX Jaguars game on 10/18\n5. If your qualifying bet loses, receive your stake back in the form of a Bonus Bet";

describe("classifyNoSweat", () => {
  it("NFL London No Sweat is a bonus-bet refund capped at 10.00", () => {
    expect(classifyNoSweat({ title: "NFL London No Sweat", text: LONDON_TEXT })).toEqual({
      kind: "bonus_bet_refund",
      refundCap: "10.00",
    });
  });

  it.each(["Second Chance Bet", "Bet Back", "Money Back Special"])("widened wording: %s", (title) => {
    expect(
      classifyNoSweat({ title, text: "If your bet loses, get a bonus bet up to $25" }),
    ).toEqual({ kind: "bonus_bet_refund", refundCap: "25.00" });
  });

  it.each([
    "Your stake is refunded in cash if your bet loses",
    "Cash back if your bet loses",
    "Get withdrawable cash if your bet loses",
  ])("cash refund: %s", (text) => {
    expect(classifyNoSweat({ title: "No Sweat Bet", text }).kind).toBe("cash_refund");
  });

  it("a percent profit boost mentioning no-sweat is none", () => {
    expect(
      classifyNoSweat({
        title: "50% Profit Boost",
        text: "Bet $25 on any NFL game. No-sweat? Boosted winnings paid in cash.",
      }),
    ).toEqual({ kind: "none" });
  });

  it("racing Bet Back refunding in Crown Cash is never cash_refund", () => {
    const r = classifyNoSweat({
      title: "Bet Back with Portnoy!",
      text: "Refunded in Crown Cash if your bet loses",
      category: "No Sweat",
    });
    expect(r.kind).not.toBe("cash_refund");
  });

  it("no cap stated gives refundCap null", () => {
    expect(
      classifyNoSweat({ title: "No Sweat", text: "If your bet loses, get a bonus bet back" }),
    ).toEqual({ kind: "bonus_bet_refund", refundCap: null });
  });

  it("plain text without refund wording is none", () => {
    expect(classifyNoSweat({ title: "Odds Boost", text: "Any wager" })).toEqual({ kind: "none" });
  });
});

describe("parseNoSweatRefundCap", () => {
  it("prefers MAX REWARD, falls back to up to, null otherwise", () => {
    expect(parseNoSweatRefundCap("MAX REWARD: $10 up to $50")).toBe("10.00");
    expect(parseNoSweatRefundCap("get up to $12.5 back")).toBe("12.50");
    expect(parseNoSweatRefundCap("nothing here")).toBeNull();
    expect(parseNoSweatRefundCap("MAX REWARD: $0")).toBeNull();
  });

  // CR-01 regressions.
  it("keeps thousands separators: $1,000 in Bonus Bets is 1000.00, not 1.00", () => {
    expect(parseNoSweatRefundCap("No Sweat up to $1,000 in Bonus Bets")).toBe("1000.00");
    expect(parseNoSweatRefundCap("MAX REWARD: $1,000")).toBe("1000.00");
    expect(parseNoSweatRefundCap("Get a $2,500.50 bonus bet")).toBe("2500.50");
  });

  it("the bonus-bet amount wins over a generic wager limit 'up to $'", () => {
    expect(
      parseNoSweatRefundCap("Bet up to $500 on any NFL game. If your bet loses, get a $25 bonus bet."),
    ).toBe("25.00");
  });

  it("'up to $25 back in bonus bets' is 25.00", () => {
    expect(parseNoSweatRefundCap("If your bet loses, get up to $25 back in bonus bets")).toBe("25.00");
  });

  it("the NFL London fixture still reads 10.00", () => {
    expect(parseNoSweatRefundCap(LONDON_TEXT)).toBe("10.00");
  });

  it("a bare 'up to $N' with no refund wording is not a refund cap", () => {
    expect(parseNoSweatRefundCap("Bet up to $500 on any NFL game")).toBeNull();
  });

  it("two different refund-worded amounts are ambiguous and give null", () => {
    expect(parseNoSweatRefundCap("Get a $25 bonus bet or a $50 bonus bet")).toBeNull();
    expect(parseNoSweatRefundCap("Get a $25 bonus bet. Max one $25 bonus bet per customer")).toBe("25.00");
  });

  it("classifyNoSweat carries the corrected cap through", () => {
    expect(
      classifyNoSweat({
        title: "NFL No Sweat",
        text: "Bet up to $500 on any NFL game. If your bet loses, get a $25 bonus bet.",
      }),
    ).toEqual({ kind: "bonus_bet_refund", refundCap: "25.00" });
  });
});
