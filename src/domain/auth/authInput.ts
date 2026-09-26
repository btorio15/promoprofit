import { z } from "zod";

/**
 * Invite redemption input contract (D-04). Email is normalized
 * (trim + lowercase) inside the schema itself -- the same "store the
 * business rule in the schema" convention as FinderInputSchema -- so
 * "  Mike@Example.COM " and "mike@example.com" always compare equal
 * downstream (D-05). Password is intentionally NOT trimmed (a password of
 * "  secret  " with meaningful surrounding whitespace is the user's literal
 * choice). max(128) bounds argon2 hashing cost (T-02-06).
 */
export const InviteRedemptionInputSchema = z.object({
  token: z.string().min(1, "Invalid invite link."),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(40, "Enter a display name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters."),
});

export type InviteRedemptionInput = z.output<typeof InviteRedemptionInputSchema>;
