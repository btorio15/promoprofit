import { z } from "zod";

/**
 * getPromos input contract (D-05): precision is read-only from the Promos
 * tab's own perspective -- it follows the Arbitrage tab's persisted setting
 * (STORAGE_KEYS.arbPrecision) rather than exposing its own toggle -- but the
 * server action still validates it the same way every other action
 * validates its input (T-03-03-02).
 */
export const PromosInputSchema = z.object({
  precision: z.enum(["whole", "cents"]),
});

export type PromosInput = z.infer<typeof PromosInputSchema>;
