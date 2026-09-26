import { z } from "zod";
import Decimal from "decimal.js";

const BONUS_AMOUNT_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;
const MAX_HEDGE_AMOUNT_MESSAGE = "Enter a max hedge amount greater than $0.";

/**
 * Finder input contract. bonusAmount is validated as a string and compared
 * with decimal.js — never parseFloat — so money never passes through a
 * native float on its way into the hedge engine. Sport is no longer a
 * search input (owner-requested scope change, 01-05): findHedges always
 * returns every sport's ranking, and the sport tab is a client-only view
 * switch over one search's results.
 */
export const FinderInputSchema = z.object({
  bookKey: z.string().min(1, "Choose the book holding your bonus bet."),
  bonusAmount: z
    .string()
    .regex(BONUS_AMOUNT_PATTERN, "Enter a bonus amount greater than $0.")
    .refine(
      // Skip when the regex already failed (non-numeric input like "abc")
      // so `new Decimal` never throws here -- zod runs every check on a
      // field regardless of earlier failures, it doesn't short-circuit.
      (value) => !BONUS_AMOUNT_PATTERN.test(value) || new Decimal(value).gt(0),
      { message: "Enter a bonus amount greater than $0." },
    )
    .refine(
      (value) => !BONUS_AMOUNT_PATTERN.test(value) || new Decimal(value).lte(100000),
      { message: "Enter a bonus amount greater than $0." },
    ),
  // Optional cap on the hedge stake (D-17); same money-string rules as
  // bonusAmount, only meaningful when the "Limit hedge amount" checkbox is
  // checked client-side.
  maxHedgeAmount: z
    .string()
    .regex(BONUS_AMOUNT_PATTERN, MAX_HEDGE_AMOUNT_MESSAGE)
    .refine(
      (value) => !BONUS_AMOUNT_PATTERN.test(value) || new Decimal(value).gt(0),
      { message: MAX_HEDGE_AMOUNT_MESSAGE },
    )
    .refine(
      (value) => !BONUS_AMOUNT_PATTERN.test(value) || new Decimal(value).lte(100000),
      { message: MAX_HEDGE_AMOUNT_MESSAGE },
    )
    .optional(),
});

export type FinderInput = z.infer<typeof FinderInputSchema>;
