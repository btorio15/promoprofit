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

/**
 * quick-261014-u6k: every profit boost is evaluated at this max bet unless the
 * member sets a per-book or per-promo cap (owner request 2026-10-14). It never
 * raises a stake above the promo's own cap.
 */
export const DEFAULT_MAX_STAKE = "25.00";

export type CapSource = "your_promo_cap" | "your_book_cap" | "default" | "book_page";

export const CapMoneySchema = z
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

/**
 * {bookKey, maxStake|null}: a member's max bet for one of their books.
 * Strict: no userId field (IDOR guard). null clears it (back to the default).
 */
export const SetBookCapInputSchema = z.strictObject({
  bookKey: z.string().min(1).max(64),
  maxStake: CapMoneySchema.nullable(),
});

export type SetBookCapInput = z.infer<typeof SetBookCapInputSchema>;

/**
 * Effective max stake for a profit boost:
 *  1. per-promo override wins outright (may exceed the book's own cap);
 *  2. else the member's book cap (or the $25 default) -- bounded above by the
 *     promo's own cap when it has one. A tie goes to the book's cap.
 */
export function resolveEffectiveMaxStake(input: {
  promoCap: string | null;
  promoOverride: string | null;
  bookCap: string | null;
}): { maxStake: string; source: CapSource } {
  if (input.promoOverride !== null) {
    return { maxStake: new Decimal(input.promoOverride).toFixed(2), source: "your_promo_cap" };
  }
  const userCap = new Decimal(input.bookCap ?? DEFAULT_MAX_STAKE);
  const userSource: CapSource = input.bookCap !== null ? "your_book_cap" : "default";
  if (input.promoCap !== null) {
    const own = new Decimal(input.promoCap);
    if (own.lte(userCap)) return { maxStake: own.toFixed(2), source: "book_page" };
  }
  return { maxStake: userCap.toFixed(2), source: userSource };
}

export interface MemberCapFields {
  promoMaxStake: string | null;
  capOverride: string | null;
  capSource: CapSource | null;
  fallbackCap: string | null;
  fallbackSource: Exclude<CapSource, "your_promo_cap"> | null;
}

/**
 * Applies one member's caps. Only profit boosts take caps (bonus bets keep
 * their fixed stake). Returns new objects (no mutation); promoMaxStake always
 * keeps the promo's own cap so it can be restored.
 */
export function applyMemberCaps<P extends RankablePromo>(
  promos: readonly P[],
  promoCaps: ReadonlyMap<number, string>,
  bookCaps: ReadonlyMap<string, string>,
): Array<P & MemberCapFields> {
  return promos.map((promo) => {
    if (promo.promoType !== "profit_boost") {
      return { ...promo, promoMaxStake: promo.maxStake, capOverride: null, capSource: null, fallbackCap: null, fallbackSource: null };
    }
    const override = promoCaps.get(promo.id) ?? null;
    const bookCap = bookCaps.get(promo.bookKey) ?? null;
    const effective = resolveEffectiveMaxStake({ promoCap: promo.maxStake, promoOverride: override, bookCap });
    const fallback = resolveEffectiveMaxStake({ promoCap: promo.maxStake, promoOverride: null, bookCap });
    return {
      ...promo,
      promoMaxStake: promo.maxStake,
      capOverride: override,
      maxStake: effective.maxStake,
      capSource: effective.source,
      fallbackCap: fallback.maxStake,
      fallbackSource: fallback.source as Exclude<CapSource, "your_promo_cap">,
    };
  });
}

/** Restores every promo to its own cap (group-level observations must never reflect one member's cap). */
export function stripMemberCaps<P extends RankablePromo & { promoMaxStake?: string | null }>(promos: readonly P[]): P[] {
  return promos.map((promo) =>
    promo.promoMaxStake === undefined ? promo : { ...promo, maxStake: promo.promoMaxStake },
  );
}
