import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshOutcome } from "./refresh";

const {
  mockRunOddsRefresh,
  mockRecordCurrentProfitObservations,
  mockRecordSnapshots,
  mockListUserIds,
  mockLoadCtx,
  mockRecordMember,
  mockComputeFeed,
  mockBuildEntries,
} = vi.hoisted(() => ({
  mockRunOddsRefresh: vi.fn(),
  mockRecordCurrentProfitObservations: vi.fn(),
  mockRecordSnapshots: vi.fn(),
  mockListUserIds: vi.fn(),
  mockLoadCtx: vi.fn(),
  mockRecordMember: vi.fn(),
  mockComputeFeed: vi.fn(),
  mockBuildEntries: vi.fn(),
}));

vi.mock("./refresh", () => ({ runOddsRefresh: mockRunOddsRefresh }));
vi.mock("@/db/promoObservations", () => ({
  recordCurrentProfitObservations: mockRecordCurrentProfitObservations,
  recordCurrentProfitSnapshots: mockRecordSnapshots,
}));
vi.mock("@/db/queries", () => ({ listUserIds: mockListUserIds }));
vi.mock("@/db/feedContext", () => ({ loadMemberFeedContext: mockLoadCtx }));
vi.mock("@/db/memberObservations", () => ({ recordMemberProfitObservations: mockRecordMember }));
vi.mock("@/domain/promos/memberFeed", () => ({ computeMemberFeed: mockComputeFeed }));
vi.mock("@/domain/promos/memberObservationEntries", () => ({ buildMemberObservationEntries: mockBuildEntries }));
// The REAL shared helper (@/db/memberFeedRecording) runs on top of these
// mocks, so these tests prove the job records through the same rule as the
// Dashboard and the Promos tab (WR-03).

import { runMorningObservation } from "./morningObserve";

const OK_OUTCOME: RefreshOutcome = {
  status: "ok",
  fetchedAt: "2026-09-27T14:00:00Z",
  sportsFetched: ["americanfootball_nfl"],
  creditsSpent: 1,
  remaining: 495,
};

const BLOCKED_OUTCOME: RefreshOutcome = {
  status: "blocked",
  reason: "low_credits",
  remaining: 5,
  estimatedCredits: 3,
  resetsOn: "2026-10-01T00:00:00Z",
};

// 2026-07-15T14:00:00Z is 08:00 MDT -- inside the morning window.
const MORNING_INSTANT = new Date("2026-07-15T14:00:00Z");
// 2026-07-15T18:00:00Z is 12:00 MDT -- outside the morning window.
const NOON_INSTANT = new Date("2026-07-15T18:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockRunOddsRefresh.mockResolvedValue(OK_OUTCOME);
  mockRecordCurrentProfitObservations.mockResolvedValue(undefined);
  mockRecordSnapshots.mockResolvedValue(undefined);
  mockListUserIds.mockResolvedValue([1, 2]);
  mockLoadCtx.mockImplementation(async ({ userId }: { userId: number }) => ({
    userBookSet: new Set([`book${userId}`]),
    feedPromos: [],
    rankOpts: {},
    oddsFetchedAt: new Date("2026-07-15T13:00:00Z"),
    extendedOddsFetchedAt: null,
  }));
  mockComputeFeed.mockReturnValue({ singles: ["s"], chosenPairs: ["p"] });
  mockBuildEntries.mockImplementation(() => [{ entry: true }]);
  mockRecordMember.mockResolvedValue(true);
});

describe("runMorningObservation (quick-260927-n12 scope change B)", () => {
  it("skips outside the morning window without refreshing or recording", async () => {
    const result = await runMorningObservation({ now: NOON_INSTANT, hasApiKey: true });

    expect(result).toEqual({ status: "skipped", reason: "not-morning-window" });
    expect(mockRunOddsRefresh).not.toHaveBeenCalled();
    expect(mockRecordCurrentProfitObservations).not.toHaveBeenCalled();
  });

  it("force=true runs even outside the morning window", async () => {
    const result = await runMorningObservation({ now: NOON_INSTANT, force: true, hasApiKey: true });

    expect(result).toMatchObject({ status: "ran", refreshOutcome: OK_OUTCOME });
    expect(mockRunOddsRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });

  it("with no API key, skips only the refresh, logs it, and still runs every recorder (WR-04)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: false });

    expect(result).toEqual({
      status: "ran",
      refreshOutcome: { status: "error", message: "ODDS_API_KEY is not set" },
      memberObservations: { recorded: 2, failed: 0 },
    });
    expect(mockRunOddsRefresh).not.toHaveBeenCalled();
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(MORNING_INSTANT);
    expect(mockRecordSnapshots).toHaveBeenCalledWith(MORNING_INSTANT);
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("no Odds API key"));
    spy.mockRestore();
  });

  it("detects the key from ODDS_API_KEYS alone (no ODDS_API_KEY)", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    vi.stubEnv("ODDS_API_KEYS", "test-key-a,test-key-b");
    const result = await runMorningObservation({ now: MORNING_INSTANT });
    expect(result.status).not.toBe("skipped");
    expect(mockRunOddsRefresh).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("skips only the refresh when neither ODDS_API_KEY nor ODDS_API_KEYS is set (WR-04)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ODDS_API_KEY", "");
    vi.stubEnv("ODDS_API_KEYS", "");
    const result = await runMorningObservation({ now: MORNING_INSTANT });
    expect(result).toMatchObject({ status: "ran", refreshOutcome: { status: "error" } });
    expect(mockRunOddsRefresh).not.toHaveBeenCalled();
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
    spy.mockRestore();
  });

  it("runs the moneyline-only refresh (confirmed, no triggering user) and records observations on success", async () => {
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toMatchObject({ status: "ran", refreshOutcome: OK_OUTCOME });
    expect(mockRunOddsRefresh).toHaveBeenCalledWith({ confirmed: true, triggeredByUserId: null, now: MORNING_INSTANT });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(MORNING_INSTANT);
  });

  it("still records observations from cache when the refresh comes back blocked", async () => {
    mockRunOddsRefresh.mockResolvedValue(BLOCKED_OUTCOME);

    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toMatchObject({ status: "ran", refreshOutcome: BLOCKED_OUTCOME });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });

  it("still records observations from cache when the refresh throws/errors", async () => {
    const errorOutcome: RefreshOutcome = { status: "error", message: "Couldn't refresh odds: the Odds API didn't respond." };
    mockRunOddsRefresh.mockResolvedValue(errorOutcome);

    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toMatchObject({ status: "ran", refreshOutcome: errorOutcome });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });

  it("still runs the member pass when the group observation recorder rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockRecordCurrentProfitObservations.mockRejectedValueOnce(new Error("read failed"));
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(result.status).toBe("ran");
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("still runs the member pass when the snapshot recorder rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockRecordSnapshots.mockRejectedValueOnce(new Error("read failed"));
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(result.status).toBe("ran");
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("skipped runs do not list users or record members", async () => {
    await runMorningObservation({ now: NOON_INSTANT, hasApiKey: true });
    expect(mockListUserIds).not.toHaveBeenCalled();
    expect(mockRecordMember).not.toHaveBeenCalled();
  });

  it("records each member with whole precision, after the group recorder", async () => {
    mockLoadCtx.mockImplementation(async ({ userId }: { userId: number }) => ({
      userBookSet: new Set([`book${userId}`]),
      feedPromos: [],
      rankOpts: { precision: "cents" },
      oddsFetchedAt: new Date("2026-07-15T13:00:00Z"),
      extendedOddsFetchedAt: null,
    }));
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    // The shared helper forces whole precision on top of the context's rankOpts.
    expect(mockComputeFeed).toHaveBeenCalledTimes(2);
    for (const [args] of mockComputeFeed.mock.calls) {
      expect(args.rankOpts.precision).toBe("whole");
    }

    expect(mockLoadCtx).toHaveBeenCalledWith({ userId: 1, precision: "whole", now: MORNING_INSTANT });
    expect(mockLoadCtx).toHaveBeenCalledWith({ userId: 2, precision: "whole", now: MORNING_INSTANT });
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
    expect(mockRecordMember).toHaveBeenCalledWith(1, [{ entry: true }], MORNING_INSTANT);
    expect(mockRecordMember).toHaveBeenCalledWith(2, [{ entry: true }], MORNING_INSTANT);
    expect(mockBuildEntries).toHaveBeenCalledWith({
      denverDate: "2026-07-15",
      singles: ["s"],
      chosenPairs: ["p"],
      userBookSet: new Set(["book1"]),
    });
    expect(mockRecordCurrentProfitObservations.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecordMember.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ memberObservations: { recorded: 2, failed: 0 } });
  });

  it("runs the member pass when the refresh is blocked", async () => {
    mockRunOddsRefresh.mockResolvedValue(BLOCKED_OUTCOME);
    await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(mockRecordMember).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing member and still resolves ran", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLoadCtx.mockRejectedValueOnce(new Error("boom"));

    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toMatchObject({ status: "ran", memberObservations: { recorded: 1, failed: 1 } });
    expect(mockRecordMember).toHaveBeenCalledTimes(1);
    expect(mockRecordMember).toHaveBeenCalledWith(2, expect.anything(), MORNING_INSTANT);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("counts a member whose write reports failure as failed, not recorded (WR-02)", async () => {
    mockRecordMember.mockResolvedValueOnce(false);
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(result).toMatchObject({ status: "ran", memberObservations: { recorded: 1, failed: 1 } });
  });

  it("counts a member as failed when the shared helper's write throws (WR-03)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRecordMember.mockRejectedValueOnce(new Error("write failed"));
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(result).toMatchObject({ status: "ran", memberObservations: { recorded: 1, failed: 1 } });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("recordMemberFeedObservations"), expect.any(Error));
    spy.mockRestore();
  });

  it("skips a member whose context has no cached odds", async () => {
    mockLoadCtx.mockResolvedValueOnce({
      userBookSet: new Set(),
      feedPromos: [],
      rankOpts: {},
      oddsFetchedAt: null,
      extendedOddsFetchedAt: null,
    });
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(mockRecordMember).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ memberObservations: { recorded: 1, failed: 0 } });
  });

  it("survives listUserIds failing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListUserIds.mockRejectedValue(new Error("db down"));
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });
    expect(result).toMatchObject({ status: "ran", memberObservations: { recorded: 0, failed: 0 } });
    spy.mockRestore();
  });
});
