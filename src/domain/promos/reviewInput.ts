import { z } from "zod";

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
