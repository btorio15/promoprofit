import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInviteToken } from "@/lib/auth/inviteToken";

const mockRedeemInviteAndCreateUser = vi.hoisted(() => vi.fn());
const mockStartSession = vi.hoisted(() => vi.fn());
const mockHashPassword = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);

vi.mock("@/lib/auth/accounts", () => ({
  redeemInviteAndCreateUser: mockRedeemInviteAndCreateUser,
}));

vi.mock("@/lib/session", () => ({
  startSession: mockStartSession,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mockHashPassword,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { redeemInvite } from "./redeem-invite";

const TOKEN = "a".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  mockHashPassword.mockResolvedValue("argon2-hash");
});

describe("redeemInvite (valid input)", () => {
  it("hashes the token, lowercases+trims email, hashes the password, starts a session and redirects", async () => {
    mockRedeemInviteAndCreateUser.mockResolvedValue({
      status: "ok",
      user: { id: 1, email: "mike@example.com", displayName: "Mike" },
    });

    await expect(
      redeemInvite({
        token: TOKEN,
        displayName: "Mike",
        email: "  Mike@Example.COM ",
        password: "password123",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedeemInviteAndCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: hashInviteToken(TOKEN),
        email: "mike@example.com",
        displayName: "Mike",
        passwordHash: "argon2-hash",
      }),
    );
    expect(mockRedeemInviteAndCreateUser.mock.calls[0][0].tokenHash).not.toBe(TOKEN);
    expect(mockStartSession).toHaveBeenCalledWith({
      userId: 1,
      email: "mike@example.com",
      displayName: "Mike",
    });
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding/books");
  });
});

describe("redeemInvite (invalid input)", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const response = await redeemInvite({
      token: TOKEN,
      displayName: "Mike",
      email: "mike@example.com",
      password: "short12",
    });
    expect(response).toEqual({
      status: "invalid",
      fieldErrors: expect.objectContaining({
        password: expect.arrayContaining(["Password must be at least 8 characters."]),
      }),
    });
    expect(mockRedeemInviteAndCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const response = await redeemInvite({
      token: TOKEN,
      displayName: "Mike",
      email: "not-an-email",
      password: "password123",
    });
    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.email?.[0]).toBe("Enter a valid email address.");
    expect(mockRedeemInviteAndCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a blank display name", async () => {
    const response = await redeemInvite({
      token: TOKEN,
      displayName: "",
      email: "mike@example.com",
      password: "password123",
    });
    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.displayName).toBeTruthy();
    expect(mockRedeemInviteAndCreateUser).not.toHaveBeenCalled();
  });
});

describe("redeemInvite (accounts outcomes)", () => {
  it("returns invite_invalid without starting a session or redirecting", async () => {
    mockRedeemInviteAndCreateUser.mockResolvedValue({ status: "invite_invalid" });

    const response = await redeemInvite({
      token: TOKEN,
      displayName: "Mike",
      email: "mike@example.com",
      password: "password123",
    });

    expect(response).toEqual({ status: "invite_invalid" });
    expect(mockStartSession).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns an email-taken field error without starting a session", async () => {
    mockRedeemInviteAndCreateUser.mockResolvedValue({ status: "email_taken" });

    const response = await redeemInvite({
      token: TOKEN,
      displayName: "Mike",
      email: "mike@example.com",
      password: "password123",
    });

    expect(response).toEqual({
      status: "invalid",
      fieldErrors: { email: ["An account with this email already exists."] },
    });
    expect(mockStartSession).not.toHaveBeenCalled();
  });
});
