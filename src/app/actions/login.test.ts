import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUserByEmail = vi.hoisted(() => vi.fn());
const mockReserveLoginAttempt = vi.hoisted(() => vi.fn());
const mockClearFailedLogins = vi.hoisted(() => vi.fn());
const mockVerifyPassword = vi.hoisted(() => vi.fn());
const mockVerifyAgainstDummyHash = vi.hoisted(() => vi.fn());
const mockStartSession = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);

vi.mock("@/lib/auth/accounts", () => ({
  findUserByEmail: mockFindUserByEmail,
  reserveLoginAttempt: mockReserveLoginAttempt,
  clearFailedLogins: mockClearFailedLogins,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mockVerifyPassword,
  verifyAgainstDummyHash: mockVerifyAgainstDummyHash,
}));

vi.mock("@/lib/session", () => ({
  startSession: mockStartSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { login } from "./login";
import { isLockedOut, LOCKOUT_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS, nextFailedLoginState } from "@/lib/auth/lockout";

const NOW = new Date("2026-09-26T12:00:00.000Z");

const USER = {
  id: 1,
  email: "mike@example.com",
  displayName: "Mike",
  passwordHash: "argon2-hash",
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mockVerifyAgainstDummyHash.mockResolvedValue(false);
  mockReserveLoginAttempt.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login (valid credentials)", () => {
  it("normalizes the email before looking up the user", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockVerifyPassword.mockResolvedValue(true);

    await expect(
      login({ email: "  Mike@Example.COM ", password: "password123" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockFindUserByEmail).toHaveBeenCalledWith("mike@example.com");
  });

  it("reserves the attempt, verifies, clears failed logins, starts a session and redirects to / on correct password", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockVerifyPassword.mockResolvedValue(true);

    await expect(login({ email: USER.email, password: "password123" })).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockReserveLoginAttempt).toHaveBeenCalledWith(USER.id, NOW);
    expect(mockClearFailedLogins).toHaveBeenCalledWith(USER.id);
    expect(mockStartSession).toHaveBeenCalledWith({
      userId: USER.id,
      email: USER.email,
      displayName: USER.displayName,
    });
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});

describe("login (wrong password)", () => {
  it("reserves the attempt before verifying, returns invalid_credentials without starting a session", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockVerifyPassword.mockResolvedValue(false);

    const result = await login({ email: USER.email, password: "wrong-password" });

    expect(result).toEqual({ status: "invalid_credentials" });
    expect(mockReserveLoginAttempt).toHaveBeenCalledWith(USER.id, NOW);
    expect(mockReserveLoginAttempt).toHaveBeenCalledTimes(1);
    expect(mockVerifyPassword).toHaveBeenCalledTimes(1);
    expect(mockReserveLoginAttempt.mock.invocationCallOrder[0]).toBeLessThan(
      mockVerifyPassword.mock.invocationCallOrder[0],
    );
    expect(mockClearFailedLogins).not.toHaveBeenCalled();
    expect(mockStartSession).not.toHaveBeenCalled();
  });
});

describe("login (unknown email)", () => {
  it("runs the timing equalizer and returns invalid_credentials without reserving an attempt", async () => {
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await login({ email: "nobody@example.com", password: "whatever1" });

    expect(result).toEqual({ status: "invalid_credentials" });
    expect(mockVerifyAgainstDummyHash).toHaveBeenCalledWith("whatever1");
    expect(mockReserveLoginAttempt).not.toHaveBeenCalled();
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });
});

describe("login (locked account)", () => {
  it("returns locked and never calls verifyPassword, even with the correct password, when reserveLoginAttempt resolves false", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockReserveLoginAttempt.mockResolvedValue(false);

    const result = await login({ email: USER.email, password: "password123" });

    expect(result).toEqual({ status: "locked" });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it("returns locked even when findUserByEmail's snapshot says lockedUntil is null (stale snapshot, login must not trust it)", async () => {
    mockFindUserByEmail.mockResolvedValue({ ...USER, lockedUntil: null });
    mockReserveLoginAttempt.mockResolvedValue(false);

    const result = await login({ email: USER.email, password: "password123" });

    expect(result).toEqual({ status: "locked" });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });
});

describe("login (invalid input)", () => {
  it("rejects an invalid email without looking up a user", async () => {
    const result = await login({ email: "not-an-email", password: "password123" });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: expect.objectContaining({ email: ["Enter a valid email address."] }),
    });
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty password without looking up a user", async () => {
    const result = await login({ email: USER.email, password: "" });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: expect.objectContaining({ password: ["Enter your password."] }),
    });
    expect(mockFindUserByEmail).not.toHaveBeenCalled();
  });
});

describe("login (concurrent attempts, CR-01)", () => {
  it("20 parallel wrong-password attempts against one account yield exactly 5 verifies and 15 locked, ending locked for LOCKOUT_MINUTES", async () => {
    const row: { failedLoginAttempts: number; lockedUntil: Date | null } = {
      failedLoginAttempts: 0,
      lockedUntil: null,
    };

    mockFindUserByEmail.mockResolvedValue({ ...USER, ...row });

    // Models the single-statement, row-locked UPDATE ... RETURNING: the
    // check-and-write happens with no await between them, so it can't be
    // interleaved by other in-flight calls the way a real read-then-write
    // sequence could.
    mockReserveLoginAttempt.mockImplementation(async (_userId: number, now: Date) => {
      if (isLockedOut(row.lockedUntil, now)) return false;
      const next = nextFailedLoginState(row.failedLoginAttempts, now);
      row.failedLoginAttempts = next.failedLoginAttempts;
      row.lockedUntil = next.lockedUntil;
      return true;
    });

    mockVerifyPassword.mockImplementation(async () => {
      await Promise.resolve();
      await Promise.resolve();
      return false;
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => login({ email: USER.email, password: "wrong-password" })),
    );

    expect(mockVerifyPassword).toHaveBeenCalledTimes(MAX_FAILED_LOGIN_ATTEMPTS);

    const invalidCount = results.filter((r) => r.status === "invalid_credentials").length;
    const lockedCount = results.filter((r) => r.status === "locked").length;

    expect(invalidCount).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(lockedCount).toBe(20 - MAX_FAILED_LOGIN_ATTEMPTS);
    expect(row.lockedUntil).toEqual(new Date(NOW.getTime() + LOCKOUT_MINUTES * 60_000));
  });
});
