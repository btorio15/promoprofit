import { z } from "zod";
import Decimal from "decimal.js";

const TOTAL_STAKE_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;
const TOTAL_STAKE_MESSAGE = "Enter a total stake greater than $0.";

/** Discretion default (UI-SPEC "Total stake default value"): a round, plausible single-sitting bankroll. */
export const DEFAULT_TOTAL_STAKE = "200.00";

/**
 * Arbitrage-tab input contract (D-01, D-02). totalStake is validated as a
 * string and compared with decimal.js -- never parseFloat -- mirroring
 * src/domain/finder/finderInput.ts's money-string discipline. Note: if a
 * form ever binds directly to this schema via react-hook-form +
 * @hookform/resolvers/zod, use z.input<typeof ArbInputSchema> as the RHF
 * generic, not the inferred output type -- see resolvers issue #842 (the
 * same workaround Phase 1 used for FinderInputSchema).
 */
export const ArbInputSchema = z.object({
  totalStake: z
    .string()
    .regex(TOTAL_STAKE_PATTERN, TOTAL_STAKE_MESSAGE)
    .refine(
      // Skip when the regex already failed (non-numeric input like "abc")
      // so `new Decimal` never throws here -- zod runs every check on a
      // field regardless of earlier failures, it doesn't short-circuit.
      (value) => !TOTAL_STAKE_PATTERN.test(value) || new Decimal(value).gt(0),
      { message: TOTAL_STAKE_MESSAGE },
    )
    .refine(
      (value) => !TOTAL_STAKE_PATTERN.test(value) || new Decimal(value).lte(100000),
      { message: TOTAL_STAKE_MESSAGE },
    ),
  precision: z.enum(["whole", "cents"]).default("whole"),
});

export type ArbInput = z.infer<typeof ArbInputSchema>;
