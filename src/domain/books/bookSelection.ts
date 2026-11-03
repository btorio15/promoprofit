import { z } from "zod";
import { usableHedgeBooks, usableOddsBooks } from "@/config/books";

const USABLE_BOOK_KEYS = new Set(usableHedgeBooks().map((b) => b.key));
const SPORTSBOOK_KEYS = new Set(usableOddsBooks().map((b) => b.key));

/**
 * saveBooks input contract (D-09, D-10). Deduped before the min(1)/allowlist
 * checks run, so a client-side race that double-submits the same key can
 * never trip either rule spuriously. Every key must be one of the
 * sportsbooks plus opt-in prediction markets (usableHedgeBooks(), D-14) -- the
 * same list the onboarding/settings checkbox rows are built from -- and at
 * least one must be a sportsbook (markets alone cannot satisfy the rule, D-04), so an unknown or
 * unusable key (e.g. a paid-tier-only book) is rejected server-side even if
 * the disabled-Continue-button UX is somehow bypassed. Who the selection
 * belongs to is deliberately NOT a field here: the caller is threaded
 * through only from the server session in save-books.ts (T-02-21).
 */
export const SaveBooksInputSchema = z.object({
  bookKeys: z
    .array(z.string())
    .transform((keys) => Array.from(new Set(keys)))
    .refine((keys) => keys.length >= 1, { message: "Select at least one book." })
    .refine((keys) => keys.every((key) => USABLE_BOOK_KEYS.has(key)), {
      message: "Choose only books from the list.",
    })
    .refine((keys) => keys.length === 0 || keys.some((key) => SPORTSBOOK_KEYS.has(key)), {
      message: "Select at least one sportsbook.",
    }),
});

export type SaveBooksInput = z.output<typeof SaveBooksInputSchema>;
