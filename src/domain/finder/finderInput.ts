import { z } from "zod";
import Decimal from "decimal.js";

const BONUS_AMOUNT_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;

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
      (value) => {
        const amount = new Decimal(value);
        return amount.gt(0) && amount.lte(100000);
      },
      { message: "Enter a bonus amount greater than $0." },
    ),
});

export type FinderInput = z.infer<typeof FinderInputSchema>;
