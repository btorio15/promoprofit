import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser } = vi.hoisted(() => ({ mockRequireUser: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));

vi.mock("@/ingestion/odds/client", () => ({
  listSports: vi.fn(),
  fetchSportOdds: vi.fn(),
}));

vi.mock("@/ingestion/odds/store", () => ({
  getLatestCreditUsage: vi.fn(),
  commitOddsRefresh: vi.fn(),
  commitSpreadsTotalsRefresh: vi.fn(),
  recordCreditUsage: vi.fn(),
  tryAcquireRefreshLock: vi.fn(),
  releaseRefreshLock: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { listSports, fetchSportOdds } from "@/ingestion/odds/client";
import {
  commitSpreadsTotalsRefresh,
  getLatestCreditUsage,
  recordCreditUsage,
  releaseRefreshLock,
  tryAcquireRefreshLock,
} from "@/ingestion/odds/store";
import { refreshSpreadsTotals } from "./refresh-spreads-totals";

const mockRevalidatePath = vi.mocked(revalidatePath);
const mockListSports = vi.mocked(listSports);
const mockFetchSportOdds = vi.mocked(fetchSportOdds);
const mockGetLatestCreditUsage = vi.mocked(getLatestCreditUsage);
const mockCommitSpreadsTotalsRefresh = vi.mocked(commitSpreadsTotalsRefresh);
const mockRecordCreditUsage = vi.mocked(recordCreditUsage);
const mockTryAcquireRefreshLock = vi.mocked(tryAcquireRefreshLock);
const mockReleaseRefreshLock = vi.mocked(releaseRefreshLock);

function sport(key: string) {
  return { key, group: "Basketball", title: key, active: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCommitSpreadsTotalsRefresh.mockResolvedValue(undefined);
  mockRecordCreditUsage.mockResolvedValue(undefined);
  mockTryAcquireRefreshLock.mockResolvedValue(true);
  mockReleaseRefreshLock.mockResolvedValue(undefined);
  mockRequireUser.mockResolvedValue({ userId: 42, email: "mike@example.com", displayName: "Mike" });
});

describe("refreshSpreadsTotals server action", () => {
  it("rejects non-object input with a fixed message and never acquires the lock", async () => {
    const outcome = await refreshSpreadsTotals(null);
    expect(outcome).toEqual({ status: "error", message: "Invalid refresh request" });
    expect(mockTryAcquireRefreshLock).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean confirmed field with a fixed message", async () => {
    const outcome = await refreshSpreadsTotals({ confirmed: "yes" });
    expect(outcome).toEqual({ status: "error", message: "Invalid refresh request" });
    expect(mockTryAcquireRefreshLock).not.toHaveBeenCalled();
  });

  it("returns busy when the lock is held, and never revalidates", async () => {
    mockTryAcquireRefreshLock.mockResolvedValue(false);

    const outcome = await refreshSpreadsTotals({ confirmed: true });

    expect(outcome.status).toBe("busy");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns confirm_required (forwarding confirmed: false) and never revalidates", async () => {
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);

    const outcome = await refreshSpreadsTotals({ confirmed: false });

    expect(outcome.status).toBe("confirm_required");
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns blocked when credits are low, and never revalidates", async () => {
    mockGetLatestCreditUsage.mockResolvedValue({
      requestsRemaining: 15,
      requestsUsed: 485,
      refreshCost: 3,
      sportsFetched: 1,
      // Same billing month as "now" (a 24h-old record crosses the 1st-of-month
      // credit reset on the 1st, which correctly un-blocks the refresh).
      recordedAt: new Date(Date.now() - 1_000),
    });
    mockListSports.mockResolvedValue([sport("basketball_nba")]);

    const outcome = await refreshSpreadsTotals({ confirmed: true });

    expect(outcome.status).toBe("blocked");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns ok and revalidates '/' when the fetch succeeds", async () => {
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 497, used: 3, last: 3 } });

    const outcome = await refreshSpreadsTotals({ confirmed: true });

    expect(outcome.status).toBe("ok");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns a key-free error and never revalidates when the fetch fails", async () => {
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);
    mockFetchSportOdds.mockRejectedValue(new Error("network down, key=super-secret-value"));

    const outcome = await refreshSpreadsTotals({ confirmed: true });

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).not.toContain("super-secret-value");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when logged out, before any lock/gate/API/credit-usage call (D-20, closes WR-05)", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(refreshSpreadsTotals({ confirmed: true })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockTryAcquireRefreshLock).not.toHaveBeenCalled();
    expect(mockListSports).not.toHaveBeenCalled();
    expect(mockFetchSportOdds).not.toHaveBeenCalled();
    expect(mockRecordCreditUsage).not.toHaveBeenCalled();
  });

  it("records triggeredByUserId from the session on a successful search (D-21)", async () => {
    mockGetLatestCreditUsage.mockResolvedValue(null);
    mockListSports.mockResolvedValue([sport("basketball_nba")]);
    mockFetchSportOdds.mockResolvedValue({ events: [], quota: { remaining: 497, used: 3, last: 3 } });

    const outcome = await refreshSpreadsTotals({ confirmed: true });

    expect(outcome.status).toBe("ok");
    expect(mockRecordCreditUsage).toHaveBeenCalledWith(
      expect.objectContaining({ triggeredByUserId: 42 }),
    );
  });
});
