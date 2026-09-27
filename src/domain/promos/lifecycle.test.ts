import { describe, expect, it } from "vitest";
import { statusAfterMatch } from "./lifecycle";

describe("statusAfterMatch", () => {
  it("boost with a parsed maxStake and no unparsed fields is active", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: "25.00",
        bonusAmount: null,
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
  });

  it("boost with maxStake null goes to pending_review/caps with maxStake", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: null,
        bonusAmount: null,
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["maxStake"] });
  });

  it("boost with a parsed maxStake but an unparsed minOdds goes to pending_review/caps with minOdds", () => {
    expect(
      statusAfterMatch({
        promoType: "profit_boost",
        maxStake: "20.00",
        bonusAmount: null,
        unparsedCapFields: ["minOdds"],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["minOdds"] });
  });

  it("bonus_bet with a bonusAmount and no unparsed fields is active", () => {
    expect(
      statusAfterMatch({
        promoType: "bonus_bet",
        maxStake: null,
        bonusAmount: "25.00",
        unparsedCapFields: [],
      }),
    ).toEqual({ status: "active", reviewReason: null, unparsedCapFields: [] });
  });

  it("bonus_bet with an unparsed minOdds goes to pending_review/caps with minOdds", () => {
    expect(
      statusAfterMatch({
        promoType: "bonus_bet",
        maxStake: null,
        bonusAmount: "25.00",
        unparsedCapFields: ["minOdds"],
      }),
    ).toEqual({ status: "pending_review", reviewReason: "caps", unparsedCapFields: ["minOdds"] });
  });
});
