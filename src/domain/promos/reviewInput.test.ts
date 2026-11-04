import { describe, expect, it } from "vitest";
import { ClassifyPromoInputSchema } from "./reviewInput";

const base = { promoId: 4, promoType: "no_sweat", refundCap: "25.00", scope: null };

describe("ClassifyPromoInputSchema no_sweat arm (D-15, D-19)", () => {
  it("accepts a no-sweat with a refund cap, optional min odds and scope", () => {
    expect(ClassifyPromoInputSchema.safeParse(base).success).toBe(true);
    expect(ClassifyPromoInputSchema.safeParse({ ...base, minOddsAmerican: -200 }).success).toBe(true);
  });

  it("rejects sub-cent, zero, and userId", () => {
    expect(ClassifyPromoInputSchema.safeParse({ ...base, refundCap: "25.005" }).success).toBe(false);
    expect(ClassifyPromoInputSchema.safeParse({ ...base, refundCap: "0" }).success).toBe(false);
    expect(ClassifyPromoInputSchema.safeParse({ ...base, userId: 1 }).success).toBe(false);
  });

  it("still accepts the existing bonus_bet arm", () => {
    const r = ClassifyPromoInputSchema.safeParse({ promoId: 1, promoType: "bonus_bet", bonusAmount: "10.00", scope: null });
    expect(r.success).toBe(true);
  });
});
