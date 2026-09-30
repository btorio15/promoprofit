import { z } from "zod";
import Decimal from "decimal.js";
import type { CorrectionOptions } from "./correctionOptions";
import { MONEY_PATTERN, SportDayScopeInputSchema } from "./reviewInput";

/**
 * Phase 5: member-added promo input contract (T-5-input). Every schema is a
 * strictObject with NO owner field -- the owner is always the session
 * user inside the action. Every string and number is bounded. Pure module:
 * no src/db imports, so a "use server" file can import it freely.
 */

export const ADDED_PROMO_MAX_ACTIVE = 100;

export const MSG_PICK_BOOK = "Pick a sportsbook.";
export const MSG_EXPIRY_PASSED = "Pick an expiry that hasn't passed.";
export const MSG_GAME_GONE = "That game isn't available any more. Pick another game.";
export const MSG_GAME_INVALID = "Pick a game or a league and days.";
export const MSG_TOO_MANY = "You have 100 active promos you added. Delete some before adding more.";

const MONEY_MESSAGE = "Enter a number greater than 0.";
const ODDS_MESSAGE = "Enter odds like +250 or -110.";

export const AddedMoneySchema = z
  .string()
  .max(20, MONEY_MESSAGE)
  .regex(MONEY_PATTERN, MONEY_MESSAGE)
  // Refine skipped when the regex failed so Decimal never throws.
  .refine((value) => !MONEY_PATTERN.test(value) || new Decimal(value).gt(0), { message: MONEY_MESSAGE });

export const AddedOddsSchema = z
  .number(ODDS_MESSAGE)
  .int(ODDS_MESSAGE)
  .refine((value) => Math.abs(value) >= 100 && Math.abs(value) <= 100000, { message: ODDS_MESSAGE });

export const AddedEventScopeInputSchema = z.strictObject({
  kind: z.literal("event"),
  eventId: z.string().min(1).max(100),
});

export const AddedScopeInputSchema = z.discriminatedUnion("kind", [
  AddedEventScopeInputSchema,
  SportDayScopeInputSchema,
]);

export type AddedScopeInput = z.infer<typeof AddedScopeInputSchema>;

export const ExpiryInputSchema = z.strictObject({
  etDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, MSG_EXPIRY_PASSED),
  etTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, MSG_EXPIRY_PASSED),
});

export const AddBonusBetInputSchema = z.strictObject({
  promoType: z.literal("bonus_bet"),
  bookKey: z.string().min(1, MSG_PICK_BOOK).max(50),
  bonusAmount: AddedMoneySchema,
  expires: ExpiryInputSchema,
  scope: AddedScopeInputSchema.nullable(),
  minOddsAmerican: AddedOddsSchema.optional(),
});

export const AddPromoInputSchema = z.discriminatedUnion("promoType", [AddBonusBetInputSchema]);

export type AddPromoInput = z.infer<typeof AddPromoInputSchema>;

export type AddedPromoField =
  | "bookKey"
  | "promoType"
  | "bonusAmount"
  | "boostPercent"
  | "boostedOddsAmerican"
  | "scope"
  | "pinned"
  | "maxStake"
  | "maxWinnings"
  | "minOddsAmerican"
  | "expires"
  | "form";

const ADDED_PROMO_FIELDS: readonly AddedPromoField[] = [
  "bookKey",
  "promoType",
  "bonusAmount",
  "boostPercent",
  "boostedOddsAmerican",
  "scope",
  "pinned",
  "maxStake",
  "maxWinnings",
  "minOddsAmerican",
  "expires",
  "form",
];

export type AddedPromoResponse =
  | { status: "ok"; promoId: number }
  | { status: "invalid"; fieldErrors: Partial<Record<AddedPromoField, string[]>> }
  | { status: "stale"; message: string }
  | { status: "not_found"; message: string };

export type AddPromoFormOptions =
  | { status: "ok"; books: { key: string; displayName: string }[]; options: CorrectionOptions }
  | { status: "invalid" };

/** Maps zod issues to the form's fields; unknown keys / strict-key issues go to "form". */
export function fieldErrorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Partial<Record<AddedPromoField, string[]>> {
  const out: Partial<Record<AddedPromoField, string[]>> = {};
  for (const issue of issues) {
    const head = issue.path[0];
    const field: AddedPromoField =
      typeof head === "string" && (ADDED_PROMO_FIELDS as readonly string[]).includes(head)
        ? (head as AddedPromoField)
        : "form";
    (out[field] ??= []).push(issue.message);
  }
  return out;
}
