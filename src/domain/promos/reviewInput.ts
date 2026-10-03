import { z } from "zod";
import Decimal from "decimal.js";
import { SPORT_KEYS } from "@/config/sports";
import { isHalfPoint } from "@/domain/hedge/spreadsTotalsFilter";
import { PROMO_MARKET_TYPES, PROMO_SIDES } from "./types";

/**
 * Confirm/dismiss action input (T-03-07-02, IDOR guard): a promoId only --
 * no field naming the acting account at all. That id always comes from
 * requireUser()'s session inside the action, never from the request body
 * (mirrors save-books.ts's SaveBooksInputSchema). `.strict()` rejects any
 * extra key outright rather than silently ignoring it. The scope guess
 * itself is validated with Plan 04's ScopeGuessSchema
 * (src/domain/promos/scope.ts) wherever a guess is read/written -- reused
 * directly, never duplicated here.
 */
export const PromoIdInputSchema = z
  .object({ promoId: z.number().int().positive() })
  .strict();

export type PromoIdInput = z.infer<typeof PromoIdInputSchema>;

/**
 * quick-260929-igk: mark-done input. No userId field (IDOR guard -- the acting
 * user comes only from the session). expectedGuaranteedProfit is the profit
 * the member's row displayed (2-dp string, null for a greyed row); it is only
 * an optimistic-concurrency check against the server's recompute and is NEVER
 * stored.
 */
export const MarkPromoDoneInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  precision: z.enum(["whole", "cents"]),
  expectedGuaranteedProfit: z
    .string()
    .regex(/^-?\d+\.\d{2}$/)
    .nullable(),
});

export type MarkPromoDoneInput = z.infer<typeof MarkPromoDoneInputSchema>;

/**
 * Phase 4 Plan 07: mark-pair-done input. No userId (IDOR guard). The expected
 * numbers are only compared against the server's recompute (D-23), never
 * stored. promoIdA/promoIdB are the pair row's own A/B order.
 */
const Money2dp = z.string().regex(/^-?\d+\.\d{2}$/);
export const MarkPairDoneInputSchema = z
  .strictObject({
    promoIdA: z.number().int().positive(),
    promoIdB: z.number().int().positive(),
    precision: z.enum(["whole", "cents"]),
    expectedGuaranteedProfit: Money2dp,
    expectedStakeA: Money2dp,
    expectedStakeB: Money2dp,
    expectedStakeC: Money2dp.optional(),
  })
  .refine((v) => v.promoIdA !== v.promoIdB);

export type MarkPairDoneInput = z.infer<typeof MarkPairDoneInputSchema>;

/**
 * A member-chosen pin inside the Correct sub-panel (T-03-09-02): a strict
 * shape validated the same way ScrapedPromoSchema's own `pinned` field is --
 * a moneyline pin has no line, a spread/total pin must have a half-point
 * line, and each market's side is restricted to the sides that market
 * actually has (T-03-09-02). This only proves the SHAPE is well-formed; the
 * action itself (correct-promo-match.ts) still re-resolves the pin against
 * live cached odds before ever writing it.
 */
export const PinnedSelectionInputSchema = z
  .strictObject({
    marketType: z.enum(PROMO_MARKET_TYPES),
    line: z.number().nullable(),
    side: z.enum(PROMO_SIDES),
  })
  .superRefine((v, ctx) => {
    if (v.marketType === "moneyline") {
      if (v.line !== null) {
        ctx.addIssue({ code: "custom", path: ["line"], message: "a moneyline pin must have a null line" });
      }
      if (v.side !== "home" && v.side !== "away") {
        ctx.addIssue({ code: "custom", path: ["side"], message: "a moneyline pin's side must be home or away" });
      }
    } else if (v.marketType === "spread") {
      if (v.line === null || !isHalfPoint(v.line)) {
        ctx.addIssue({ code: "custom", path: ["line"], message: "a spread pin must have a half-point line" });
      }
      if (v.side !== "home" && v.side !== "away") {
        ctx.addIssue({ code: "custom", path: ["side"], message: "a spread pin's side must be home or away" });
      }
    } else {
      if (v.line === null || !isHalfPoint(v.line)) {
        ctx.addIssue({ code: "custom", path: ["line"], message: "a total pin must have a half-point line" });
      }
      if (v.side !== "over" && v.side !== "under") {
        ctx.addIssue({ code: "custom", path: ["side"], message: "a total pin's side must be over or under" });
      }
    }
  });

const EventScopeInputSchema = z.strictObject({
  kind: z.literal("event"),
  eventId: z.string().min(1).max(100),
  pinned: PinnedSelectionInputSchema.nullable(),
});

export const SportDayScopeInputSchema = z.strictObject({
  kind: z.literal("sport_day"),
  sportKey: z.enum(SPORT_KEYS as [string, ...string[]]),
  etDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional last ET day of a multi-day window; the server recomputes bounds (T-gcn-01). */
  etEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * quick-260928-it1: classifyPromo's scope input (T-it1-03) -- unlike
 * CorrectMatchInputSchema's event branch, a classify card's Game-or-day
 * select never offers a market/side pin (D-18-style "never guess a market
 * for a promo the app doesn't even know the type of yet"), so this branch is
 * strict with no `pinned` field at all.
 */
const ClassifyEventScopeInputSchema = z.strictObject({
  kind: z.literal("event"),
  eventId: z.string().min(1).max(100),
});

export const ClassifyScopeInputSchema = z.discriminatedUnion("kind", [
  ClassifyEventScopeInputSchema,
  SportDayScopeInputSchema,
]);

export type ClassifyScopeInput = z.infer<typeof ClassifyScopeInputSchema>;

/**
 * correctPromoMatch's input (D-14, T-03-09-01/02): a strict discriminated
 * union over the two scope kinds the Correct sub-panel can produce -- one
 * specific game (with an optional market/side pin) or a sport+ET-day
 * window. No userId field (IDOR guard, same discipline as PromoIdInputSchema
 * above). The action re-validates every value here against current cached
 * odds before writing (T-03-09-02) -- this schema only proves the SHAPE is
 * well-formed.
 */
export const CorrectMatchInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  scope: z.discriminatedUnion("kind", [EventScopeInputSchema, SportDayScopeInputSchema]),
});

export type CorrectMatchInput = z.infer<typeof CorrectMatchInputSchema>;

export const MONEY_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;
const MONEY_MESSAGE = "Enter an amount greater than $0.";

/**
 * A money-string field for the cap sub-panel (D-18): same discipline as
 * finderInput.ts/arbInput.ts -- validated as a string and compared with
 * decimal.js, never parseFloat, so a stake cap never passes through a
 * native float. Skips the `.refine` when the regex already failed so
 * `new Decimal` never throws on non-numeric input.
 */
const MoneyFieldSchema = z
  .string()
  .regex(MONEY_PATTERN, MONEY_MESSAGE)
  .refine((value) => !MONEY_PATTERN.test(value) || new Decimal(value).gt(0), { message: MONEY_MESSAGE });

const MIN_ODDS_MESSAGE = "American odds must have |value| >= 100.";

const MinOddsFieldSchema = z
  .number()
  .int()
  .refine((value) => Math.abs(value) >= 100, { message: MIN_ODDS_MESSAGE });

/**
 * enterPromoCaps's input (D-18, T-03-09-03): every cap field is optional
 * here -- which ones are actually REQUIRED depends on the specific queued
 * row's own unparsedCapFields, a business rule the action checks after
 * loading that row, not something this schema can know in isolation. No
 * `kind` field for maxWinnings at all (T-03-09-03): the max-winnings cap's
 * kind always comes from the row, a member can never supply or override it.
 */
export const EnterCapsInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  maxStake: MoneyFieldSchema.optional(),
  maxWinnings: MoneyFieldSchema.optional(),
  minOddsAmerican: MinOddsFieldSchema.optional(),
});

export type EnterCapsInput = z.infer<typeof EnterCapsInputSchema>;

export const BOOST_PERCENT_PATTERN = /^\d{1,4}(\.\d{1,2})?$/;
const BOOST_PERCENT_MESSAGE = "Enter a boost percent greater than 0 and at most 1000.";

/**
 * quick-260928-it1: classifyPromo's boost-percent field (T-it1-03) -- a
 * string, never a native float, compared with decimal.js (project-wide money-
 * math rule). Bounded to (0, 1000] -- generous enough for any real profit-
 * boost promo, but never unbounded.
 */
const BoostPercentFieldSchema = z
  .string()
  .regex(BOOST_PERCENT_PATTERN, BOOST_PERCENT_MESSAGE)
  .refine(
    (value) => {
      if (!BOOST_PERCENT_PATTERN.test(value)) return true; // already failed the regex check above
      const decimal = new Decimal(value);
      return decimal.gt(0) && decimal.lte(1000);
    },
    { message: BOOST_PERCENT_MESSAGE },
  );

/**
 * classifyPromo's input (T-it1-01/02/03, CR-04, IDOR guard): a strict
 * discriminated union on promoType -- a member declares which kind of promo
 * this uncertain entry actually is, then supplies exactly that kind's
 * required/optional fields. No userId field (IDOR guard, same discipline as
 * every other review-action schema in this file): the acting user always
 * comes from requireUser()'s session inside classify-promo.ts.
 */
const ClassifyProfitBoostInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  promoType: z.literal("profit_boost"),
  boostPercent: BoostPercentFieldSchema,
  maxStake: MoneyFieldSchema.optional(),
  maxWinnings: MoneyFieldSchema.optional(),
  minOddsAmerican: MinOddsFieldSchema.optional(),
  scope: ClassifyScopeInputSchema.nullable(),
});

const ClassifyBonusBetInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  promoType: z.literal("bonus_bet"),
  bonusAmount: MoneyFieldSchema,
  minOddsAmerican: MinOddsFieldSchema.optional(),
  scope: ClassifyScopeInputSchema.nullable(),
});

export const ClassifyPromoInputSchema = z.discriminatedUnion("promoType", [
  ClassifyProfitBoostInputSchema,
  ClassifyBonusBetInputSchema,
]);

export type ClassifyPromoInput = z.infer<typeof ClassifyPromoInputSchema>;
