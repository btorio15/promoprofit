/**
 * Pure DB-backed login-lockout rules (T-02-09). No in-memory state anywhere
 * in this module -- callers persist failedLoginAttempts/lockedUntil on the
 * users row so the counter survives serverless cold starts.
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

/** Whether an account is currently locked out. */
export function isLockedOut(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Computes the next failedLoginAttempts/lockedUntil pair after one more
 * failed login. On the MAX_FAILED_LOGIN_ATTEMPTS-th consecutive failure,
 * locks the account for LOCKOUT_MINUTES and resets the counter to 0 (so the
 * lock itself -- not a growing counter -- is the thing that blocks further
 * attempts).
 */
export function nextFailedLoginState(
  currentAttempts: number,
  now: Date,
): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const attempts = currentAttempts + 1;
  if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}
