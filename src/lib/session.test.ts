import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above all other module-level code, so any
// value they reference must be created via vi.hoisted() (see
// find-hedges.test.ts convention).
const mockCookies = vi.hoisted(() => vi.fn());
const mockGetIronSession = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("iron-session", () => ({
  getIronSession: mockGetIronSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

import { getSessionUser, requireUser, startSession, endSession, SESSION_COOKIE_NAME } from "./session";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = "a".repeat(48);
  mockCookies.mockResolvedValue({ dummy: true });
});

describe("getSessionUser", () => {
  it("returns null when the sealed session has no userId", async () => {
    mockGetIronSession.mockResolvedValue({});
    const user = await getSessionUser();
    expect(user).toBeNull();
  });

  it("returns {userId,email,displayName} when present", async () => {
    mockGetIronSession.mockResolvedValue({
      userId: 1,
      email: "mike@example.com",
      displayName: "Mike",
    });
    const user = await getSessionUser();
    expect(user).toEqual({ userId: 1, email: "mike@example.com", displayName: "Mike" });
  });

  it("calls getIronSession with cookieName promoprofit_session and ttl 2592000", async () => {
    mockGetIronSession.mockResolvedValue({});
    await getSessionUser();
    expect(mockGetIronSession).toHaveBeenCalledWith(
      { dummy: true },
      expect.objectContaining({
        cookieName: "promoprofit_session",
        ttl: 2592000,
      }),
    );
    expect(SESSION_COOKIE_NAME).toBe("promoprofit_session");
  });
});

describe("requireUser", () => {
  it("calls next/navigation redirect('/login') when no user", async () => {
    mockGetIronSession.mockResolvedValue({});
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("returns the user when present", async () => {
    mockGetIronSession.mockResolvedValue({
      userId: 1,
      email: "mike@example.com",
      displayName: "Mike",
    });
    const user = await requireUser();
    expect(user).toEqual({ userId: 1, email: "mike@example.com", displayName: "Mike" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("startSession", () => {
  it("sets the three fields and calls save()", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const sessionObj: Record<string, unknown> = { save };
    mockGetIronSession.mockResolvedValue(sessionObj);

    await startSession({ userId: 5, email: "a@b.com", displayName: "A" });

    expect(sessionObj.userId).toBe(5);
    expect(sessionObj.email).toBe("a@b.com");
    expect(sessionObj.displayName).toBe("A");
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("endSession", () => {
  it("calls destroy()", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    mockGetIronSession.mockResolvedValue({ destroy });

    await endSession();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
