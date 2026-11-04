import { describe, expect, it } from "vitest";
import { guaranteedPromoTypeLabel, promoTypeLabel } from "./promoTypeLabel";

describe("promoTypeLabel", () => {
  it("labels every promo type", () => {
    expect(promoTypeLabel("profit_boost")).toBe("Boost");
    expect(promoTypeLabel("bonus_bet")).toBe("Bonus bet");
    expect(promoTypeLabel("no_sweat")).toBe("No-sweat");
    expect(guaranteedPromoTypeLabel("profit_boost")).toBe("Boost");
    expect(guaranteedPromoTypeLabel("bonus_bet")).toBe("Bonus bet");
  });
});
