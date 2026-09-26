import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUserByEmail = vi.hoisted(() => vi.fn());
const mockRecordFailedLogin = vi.hoisted(() => vi.fn());
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
  recordFailedLogin: mockRecordFailedLogin,
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

  it("clears failed logins, starts a session and redirects to / on correct password", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockVerifyPassword.mockResolvedValue(true);

    await expect(login({ email: USER.email, password: "password123" })).rejects.toThrow(
      "NEXT_REDIRECT",
    );

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
  it("records a failed login and returns invalid_credentials without starting a session", async () => {
    mockFindUserByEmail.mockResolvedValue(USER);
    mockVerifyPassword.mockResolvedValue(false);

    const result = await login({ email: USER.email, password: "wrong-password" });

    expect(result).toEqual({ status: "invalid_credentials" });
    expect(mockRecordFailedLogin).toHaveBeenCalledWith(USER.id, NOW);
    expect(mockStartSession).not.toHaveBeenCalled();
  });
});

describe("login (unknown email)", () => {
  it("runs the timing equalizer and returns invalid_credentials without recording a failed login", async () => {
    mockFindUserByEmail.mockResolvedValue(null);

    const result = await login({ email: "nobody@example.com", password: "whatever1" });

    expect(result).toEqual({ status: "invalid_credentials" });
    expect(mockVerifyAgainstDummyHash).toHaveBeenCalledWith("whatever1");
    expect(mockRecordFailedLogin).not.toHaveBeenCalled();
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });
});

describe("login (locked account)", () => {
  it("returns locked and never calls verifyPassword, even with the correct password", async () => {
    mockFindUserByEmail.mockResolvedValue({
      ...USER,
      lockedUntil: new Date(NOW.getTime() + 60_000),
    });

    const result = await login({ email: USER.email, password: "password123" });

    expect(result).toEqual({ status: "locked" });
    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockStartSession).not.toHaveBeenCalled();
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
