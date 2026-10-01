import Decimal from "decimal.js";
import { z } from "zod";
import { MONEY_PATTERN } from "./reviewInput";
import type { RankablePromo } from "./rankPromoHedges";

/**
 * quick-261001-dhn: a member's own max-stake override ("Your cap") for a
 * profit boost. Pure: decimal.js only, no src/db imports.
 */

/** Upper bound for a member-entered cap (a sane ceiling, not a book rule). */
export const YOUR_CAP_MAX = "10000.00";

const YOUR_CAP_MESSAGE = "Enter an amount between $0.01 and $10,000.";

const CapMoneySchema = z
  .string()
  .max(12, YOUR_CAP_MESSAGE)
  .regex(MONEY_PATTERN, YOUR_CAP_MESSAGE)
  .refine(
    // Skipped when the regex failed so `new Decimal` never throws.
    (value) => !MONEY_PATTERN.test(value) || (new Decimal(value).gt(0) && new Decimal(value).lte(YOUR_CAP_MAX)),
    { message: YOUR_CAP_MESSAGE },
  );

/**
 * {promoId, maxStake|null}. Strict: no userId field (IDOR guard) -- the
 * owner of the row is always the session user. null clears the override.
 */
export const SetPromoCapInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  maxStake: CapMoneySchema.nullable(),
});

export type SetPromoCapInput = z.infer<typeof SetPromoCapInputSchema>;

/** Effective cap = the member's override when set, else the promo's own cap. */
export function resolveEffectiveMaxStake(promoCap: string | null, override: string | null): string | null {
  return override ?? promoCap;
}

/**
 * Applies one member's caps. Only profit boosts take an override (a cap row
 * on any other promo type is ignored). Returns new objects (no mutation);
 * promoMaxStake always keeps the promo's own cap so it can be restored.
 */
export function applyMemberCaps<P extends RankablePromo>(
  promos: readonly P[],
  caps: ReadonlyMap<number, string>,
): Array<P & { promoMaxStake: string | null; capOverride: string | null }> {
  return promos.map((promo) => {
    const override = promo.promoType === "profit_boost" ? (caps.get(promo.id) ?? null) : null;
    return {
      ...promo,
      promoMaxStake: promo.maxStake,
      capOverride: override,
      maxStake: resolveEffectiveMaxStake(promo.maxStake, override),
    };
  });
}

/** Restores every promo to its own cap (group-level observations must never reflect one member's cap). */
export function stripMemberCaps<P extends RankablePromo & { promoMaxStake?: string | null }>(promos: readonly P[]): P[] {
  return promos.map((promo) =>
    promo.promoMaxStake === undefined ? promo : { ...promo, maxStake: promo.promoMaxStake },
  );
}
