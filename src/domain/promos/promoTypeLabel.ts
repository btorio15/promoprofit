import { assertNever, type GuaranteedPromoType, type PromoType } from "./types";

export type PromoTypeLabel = "Boost" | "Bonus bet" | "No-sweat";

/** Label for the guaranteed pipeline: a no-sweat can never reach this (FEED-02). */
export function guaranteedPromoTypeLabel(t: GuaranteedPromoType): "Boost" | "Bonus bet" {
  switch (t) {
    case "profit_boost":
      return "Boost";
    case "bonus_bet":
      return "Bonus bet";
    default:
      return assertNever(t);
  }
}

export function promoTypeLabel(t: PromoType): PromoTypeLabel {
  switch (t) {
    case "profit_boost":
      return "Boost";
    case "bonus_bet":
      return "Bonus bet";
    case "no_sweat":
      return "No-sweat";
    default:
      return assertNever(t);
  }
}
