import { describe, expect, it } from "vitest";
import { AddPromoInputSchema, fieldErrorsFromIssues } from "./addedPromoInput";

const valid = {
  promoType: "bonus_bet",
  bookKey: "fanduel",
  bonusAmount: "50",
  expires: { etDate: "2026-10-04", etTime: "23:59" },
  scope: null,
};

function messagesFor(input: unknown): string[] {
  const result = AddPromoInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("AddPromoInputSchema (bonus bet)", () => {
  it("parses a valid payload", () => {
    expect(AddPromoInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown keys at every level (strict)", () => {
    expect(AddPromoInputSchema.safeParse({ ...valid, userId: 1 }).success).toBe(false);
    expect(
      AddPromoInputSchema.safeParse({ ...valid, expires: { ...valid.expires, extra: 1 } }).success,
    ).toBe(false);
    expect(
      AddPromoInputSchema.safeParse({ ...valid, scope: { kind: "event", eventId: "e1", userId: 2 } }).success,
    ).toBe(false);
  });

  it.each(["0", "-5", "abc", "1234567", "0.00", ""])("rejects bonusAmount %j", (amount) => {
    expect(messagesFor({ ...valid, bonusAmount: amount })).toContain("Enter a number greater than 0.");
  });

  it.each(["50", "0.5", "1234.5", "999999.99"])("accepts bonusAmount %j", (amount) => {
    expect(AddPromoInputSchema.safeParse({ ...valid, bonusAmount: amount }).success).toBe(true);
  });

  it.each([50, -99, 0, 100001, 110.5])("rejects minOddsAmerican %j", (odds) => {
    expect(messagesFor({ ...valid, minOddsAmerican: odds })).toContain("Enter odds like +250 or -110.");
  });

  it.each([250, -110])("accepts minOddsAmerican %j", (odds) => {
    expect(AddPromoInputSchema.safeParse({ ...valid, minOddsAmerican: odds }).success).toBe(true);
  });

  it.each(["24:00", "11:59 PM", "9:00", "23:60"])("rejects etTime %j", (etTime) => {
    expect(AddPromoInputSchema.safeParse({ ...valid, expires: { etDate: "2026-10-04", etTime } }).success).toBe(false);
  });

  it("accepts a sport_day scope", () => {
    const scope = {
      kind: "sport_day",
      sportKey: "americanfootball_nfl",
      etDate: "2026-10-04",
      etEndDate: "2026-10-06",
    };
    expect(AddPromoInputSchema.safeParse({ ...valid, scope }).success).toBe(true);
  });

  it("accepts an event scope", () => {
    expect(AddPromoInputSchema.safeParse({ ...valid, scope: { kind: "event", eventId: "abc" } }).success).toBe(true);
  });
});

describe("fieldErrorsFromIssues", () => {
  it("maps nested and top-level paths to their field", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["expires", "etDate"], message: "a" },
        { path: ["bonusAmount"], message: "b" },
      ]),
    ).toEqual({ expires: ["a"], bonusAmount: ["b"] });
  });

  it("maps unknown / strict-key issues to form", () => {
    expect(fieldErrorsFromIssues([{ path: ["userId"], message: "x" }, { path: [], message: "y" }])).toEqual({
      form: ["x", "y"],
    });
  });
});

const validBoost = {
  promoType: "profit_boost",
  bookKey: "fanduel",
  boost: { mode: "percent", boostPercent: "50" },
  scope: { kind: "sport_day", sportKey: "americanfootball_nfl", etDate: "2026-10-04" },
  maxStake: "25",
};

describe("AddPromoInputSchema (profit boost)", () => {
  it("parses a boost % payload with no expiry", () => {
    expect(AddPromoInputSchema.safeParse(validBoost).success).toBe(true);
  });

  it("rejects a missing max stake with the boost message at maxStake", () => {
    const { maxStake: omitted, ...rest } = validBoost;
    void omitted;
    const result = AddPromoInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromIssues(result.error.issues).maxStake).toEqual([
        "Enter the max stake. Boosts can't be used without one.",
      ]);
    }
  });

  it.each(["0", "1001", "abc"])("rejects boost percent %j", (boostPercent) => {
    expect(messagesFor({ ...validBoost, boost: { mode: "percent", boostPercent } })).toContain(
      "Enter a boost % greater than 0 and at most 1000.",
    );
  });

  it("accepts boost percent 33.33", () => {
    expect(
      AddPromoInputSchema.safeParse({ ...validBoost, boost: { mode: "percent", boostPercent: "33.33" } }).success,
    ).toBe(true);
  });

  const odds = { mode: "odds", boostedOddsAmerican: 250 };
  const pin = { marketType: "moneyline", line: null, side: "home" };

  it("A3: boosted odds with a day scope fails at pinned", () => {
    const result = AddPromoInputSchema.safeParse({ ...validBoost, boost: odds });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFromIssues(result.error.issues).pinned).toEqual(["Pick the exact bet this price is for."]);
    }
  });

  it("A3: boosted odds with one game and a pin passes; without a pin fails", () => {
    const event = { kind: "event", eventId: "e1" };
    expect(
      AddPromoInputSchema.safeParse({ ...validBoost, boost: odds, scope: { ...event, pinned: pin } }).success,
    ).toBe(true);
    expect(messagesFor({ ...validBoost, boost: odds, scope: { ...event, pinned: null } })).toContain(
      "Pick the exact bet this price is for.",
    );
  });

  it("boost % keeps the pin optional", () => {
    expect(
      AddPromoInputSchema.safeParse({ ...validBoost, scope: { kind: "event", eventId: "e1", pinned: null } }).success,
    ).toBe(true);
  });

  it("A1: max winnings kinds are total_payout and boost_extra only", () => {
    for (const kind of ["total_payout", "boost_extra"]) {
      expect(AddPromoInputSchema.safeParse({ ...validBoost, maxWinnings: { amount: "100", kind } }).success).toBe(true);
    }
    expect(
      AddPromoInputSchema.safeParse({ ...validBoost, maxWinnings: { amount: "100", kind: "net_winnings" } }).success,
    ).toBe(false);
  });

  it("rejects a userId key", () => {
    expect(AddPromoInputSchema.safeParse({ ...validBoost, userId: 1 }).success).toBe(false);
  });
});
