import { randomBytes, createHash } from "node:crypto";

/** Invite links expire 7 days after creation (D-03). */
export const INVITE_TTL_DAYS = 7;

/**
 * 256-bit bearer-token-style invite credential (T-02-01, RESEARCH.md Don't
 * Hand-Roll) -- this is the account's create-credential per D-04, so it
 * needs full random entropy, not a short/guessable code.
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hex digest of an invite token. Only the hash is ever stored
 * (invites.token_hash) -- the plaintext token exists only in memory and in
 * the one-time stdout output of scripts/invite-create.ts (T-02-01).
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** now + INVITE_TTL_DAYS. */
export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
