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
