import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, inviteExpiresAt, INVITE_TTL_DAYS } from "./inviteToken";

describe("generateInviteToken", () => {
  it("returns a 43-char base64url string (32 random bytes)", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different token on every call", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
  });
});

describe("hashInviteToken", () => {
  it("is deterministic 64-char lowercase hex", () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInviteToken(token)).toBe(hash);
  });

  it("differs from the raw token", () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).not.toBe(token);
  });
});

describe("inviteExpiresAt", () => {
  it("is exactly now + 7 days", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const expires = inviteExpiresAt(now);
    expect(expires.getTime() - now.getTime()).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });
});
