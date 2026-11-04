import { describe, expect, it } from "vitest";
import { PROMO_TYPES, assertNever, isGuaranteedPromoType, type PromoType } from "./types";

describe("promo types", () => {
  it("PROMO_TYPES includes no_sweat", () => {
    expect([...PROMO_TYPES]).toEqual(["profit_boost", "bonus_bet", "no_sweat"]);
  });

  it.each<[PromoType, boolean]>([
    ["profit_boost", true],
    ["bonus_bet", true],
    ["no_sweat", false],
  ])("isGuaranteedPromoType(%s) is %s", (t, expected) => {
    expect(isGuaranteedPromoType(t)).toBe(expected);
  });

  it("assertNever throws naming the value", () => {
    expect(() => assertNever("weird" as never)).toThrow(/weird/);
  });
});
