import { describe, expect, it } from "vitest";
import { isLockedOut, LOCKOUT_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS, nextFailedLoginState } from "./lockout";

const NOW = new Date("2026-09-26T12:00:00.000Z");

describe("isLockedOut", () => {
  it("is false when lockedUntil is null", () => {
    expect(isLockedOut(null, NOW)).toBe(false);
  });

  it("is true when lockedUntil is in the future", () => {
    expect(isLockedOut(new Date(NOW.getTime() + 1), NOW)).toBe(true);
  });

  it("is false when lockedUntil is in the past", () => {
    expect(isLockedOut(new Date(NOW.getTime() - 1), NOW)).toBe(false);
  });
});

describe("nextFailedLoginState", () => {
  it.each([0, 1, 2, 3])(
    "increments attempts without locking on failure %i (below the max)",
    (currentAttempts) => {
      const result = nextFailedLoginState(currentAttempts, NOW);
      expect(result).toEqual({ failedLoginAttempts: currentAttempts + 1, lockedUntil: null });
    },
  );

  it(`locks for ${LOCKOUT_MINUTES} minutes and resets the counter on the ${MAX_FAILED_LOGIN_ATTEMPTS}th consecutive failure`, () => {
    const result = nextFailedLoginState(MAX_FAILED_LOGIN_ATTEMPTS - 1, NOW);
    expect(result.failedLoginAttempts).toBe(0);
    expect(result.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_MINUTES * 60 * 1000));
  });
});
