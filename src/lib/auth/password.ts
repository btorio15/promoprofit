import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (T-02-04). Uses @node-rs/argon2's library defaults
 * (Argon2id, 19 MiB memory, t=2, p=1) which already match OWASP's 2026
 * baseline minimum -- do not tune these parameters (RESEARCH.md Standard
 * Stack).
 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Returns false (never throws) on a malformed/foreign hash string. */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

// Computed lazily once, from a fixed dummy string -- never a real user's
// hash -- so verifyAgainstDummyHash can equalize response timing for an
// unknown email (login timing-attack mitigation, Plan 02) without ever
// succeeding.
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hash("promoprofit-dummy-password-for-timing-equalization");
  }
  return dummyHashPromise;
}

/**
 * Runs a real argon2 verify against a fixed dummy hash so a login attempt
 * against an unknown email takes roughly the same time as one against a
 * known email -- but always returns false.
 */
export async function verifyAgainstDummyHash(plain: string): Promise<false> {
  const dummyHash = await getDummyHash();
  await verifyPassword(dummyHash, plain);
  return false;
}
