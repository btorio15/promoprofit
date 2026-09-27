import type { CapField, PromoType } from "./types";

/**
 * Status-after-match rule (D-18): a promo becomes active only when every
 * cap field the engine needs is parsed. A profit_boost always needs
 * maxStake -- the solver (profitBoost.ts) is never invoked without one --
 * so a null maxStake always routes to pending_review/caps even if the
 * scraper didn't separately flag it as unparsed. A bonus_bet has no such
 * requirement (its stake is the bonus amount itself); it only reviews when
 * the scraper explicitly couldn't parse a cap field (e.g. minOdds).
 */
export function statusAfterMatch(p: {
  promoType: PromoType;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: readonly CapField[];
}):
  | { status: "active"; reviewReason: null; unparsedCapFields: [] }
  | { status: "pending_review"; reviewReason: "caps"; unparsedCapFields: CapField[] } {
  const fields = new Set<CapField>(p.unparsedCapFields);

  if (p.promoType === "profit_boost" && p.maxStake === null) {
    fields.add("maxStake");
  }

  if (fields.size > 0) {
    return { status: "pending_review", reviewReason: "caps", unparsedCapFields: [...fields] };
  }

  return { status: "active", reviewReason: null, unparsedCapFields: [] };
}
