import { z } from "zod";
import Decimal from "decimal.js";
import type { CorrectionOptions } from "./correctionOptions";
import type { DuplicateCandidate } from "./duplicateHint";
import {
  BOOST_PERCENT_PATTERN,
  MONEY_PATTERN,
  PinnedSelectionInputSchema,
  SportDayScopeInputSchema,
} from "./reviewInput";

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
export const MSG_PICK_EXACT_BET = "Pick the exact bet this price is for.";
export const MSG_MAX_STAKE = "Enter the max stake. Boosts can't be used without one.";
export const MSG_BOOST_REQUIRED = "Enter a boost % or boosted odds.";
export const MSG_BOOSTED_ODDS = "Enter the boosted odds, like +250.";
export const MSG_PIN_GONE = "That bet isn't in the current odds. Pick another.";
const MSG_BOOST_PERCENT = "Enter a boost % greater than 0 and at most 1000.";

const MONEY_MESSAGE = "Enter a number greater than 0.";
const ODDS_MESSAGE = "Enter odds like +250 or -110.";

export const AddedMoneySchema = z
  .string()
  .max(20, MONEY_MESSAGE)
  .regex(MONEY_PATTERN, MONEY_MESSAGE)
  // Refine skipped when the regex failed so Decimal never throws.
  .refine((value) => !MONEY_PATTERN.test(value) || new Decimal(value).gt(0), { message: MONEY_MESSAGE });

/** Required max stake: a missing value gets the boost-specific message (CR-04). */
const AddedMaxStakeSchema = z
  .string({ error: MSG_MAX_STAKE })
  .max(20, MONEY_MESSAGE)
  .regex(MONEY_PATTERN, MONEY_MESSAGE)
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

export const AddedBoostPercentSchema = z
  .string({ error: MSG_BOOST_REQUIRED })
  .regex(BOOST_PERCENT_PATTERN, MSG_BOOST_PERCENT)
  .refine(
    (value) => {
      if (!BOOST_PERCENT_PATTERN.test(value)) return true; // regex already failed
      const decimal = new Decimal(value);
      return decimal.gt(0) && decimal.lte(1000);
    },
    { message: MSG_BOOST_PERCENT },
  );

const BoostedOddsSchema = z
  .number(MSG_BOOSTED_ODDS)
  .int(MSG_BOOSTED_ODDS)
  .refine((value) => Math.abs(value) >= 100 && Math.abs(value) <= 100000, { message: MSG_BOOSTED_ODDS });

export const BoostEventScopeInputSchema = z.strictObject({
  kind: z.literal("event"),
  eventId: z.string().min(1).max(100),
  pinned: PinnedSelectionInputSchema.nullable(),
});

export const BoostScopeInputSchema = z.discriminatedUnion("kind", [
  BoostEventScopeInputSchema,
  SportDayScopeInputSchema,
]);

export const AddProfitBoostInputSchema = z
  .strictObject({
    promoType: z.literal("profit_boost"),
    bookKey: z.string().min(1, MSG_PICK_BOOK).max(50),
    boost: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("percent"), boostPercent: AddedBoostPercentSchema }),
      z.strictObject({ mode: z.literal("odds"), boostedOddsAmerican: BoostedOddsSchema }),
    ]),
    scope: BoostScopeInputSchema,
    maxStake: AddedMaxStakeSchema,
    maxWinnings: z
      .strictObject({ amount: AddedMoneySchema, kind: z.enum(["total_payout", "boost_extra"]) })
      .optional(),
    minOddsAmerican: AddedOddsSchema.optional(),
    expires: ExpiryInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // A3: a published boosted price only counts on one pinned selection.
    if (value.boost.mode === "odds" && !(value.scope.kind === "event" && value.scope.pinned !== null)) {
      ctx.addIssue({ code: "custom", path: ["pinned"], message: MSG_PICK_EXACT_BET });
    }
  });

export const AddPromoInputSchema = z.discriminatedUnion("promoType", [
  AddBonusBetInputSchema,
  AddProfitBoostInputSchema,
]);

export type AddPromoInput = z.infer<typeof AddPromoInputSchema>;

export const MSG_LOCKED = "Book and type can't be changed. Delete this promo and add a new one instead.";
export const MSG_NOT_AVAILABLE = "That promo isn't available any more.";

export const EditPromoInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  promo: AddPromoInputSchema,
});

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

/** A member's own stored promo, JSON-safe (dates as ISO strings), for prefilling the edit form. */
export interface AddedPromoEditValues {
  promoId: number;
  bookKey: string;
  promoType: string;
  bonusAmount: string | null;
  boostPercent: string | null;
  boostedOddsAmerican: number | null;
  maxStake: string | null;
  maxWinnings: string | null;
  maxWinningsKind: string | null;
  minOddsAmerican: number | null;
  scopeKind: string | null;
  eventId: string | null;
  sportKey: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  marketType: string | null;
  line: number | null;
  side: string | null;
  expiresAt: string | null;
}

export type AddPromoFormOptions =
  | {
      status: "ok";
      books: { key: string; displayName: string }[];
      options: CorrectionOptions;
      duplicateCandidates: DuplicateCandidate[];
      editing: AddedPromoEditValues | null;
    }
  | { status: "invalid" }
  | { status: "not_found" };

/** Maps zod issues to the form's fields; unknown keys / strict-key issues go to "form". */
export function fieldErrorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Partial<Record<AddedPromoField, string[]>> {
  const out: Partial<Record<AddedPromoField, string[]>> = {};
  for (const issue of issues) {
    const head =
      issue.path[0] === "boost" && typeof issue.path[1] === "string"
        ? issue.path[1]
        : issue.path[0] === "scope" && issue.path[1] === "pinned"
          ? "pinned"
          : issue.path[0];
    const field: AddedPromoField =
      typeof head === "string" && (ADDED_PROMO_FIELDS as readonly string[]).includes(head)
        ? (head as AddedPromoField)
        : "form";
    (out[field] ??= []).push(issue.message);
  }
  return out;
}
