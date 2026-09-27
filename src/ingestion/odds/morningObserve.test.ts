import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshOutcome } from "./refresh";

const { mockRunOddsRefresh, mockRecordCurrentProfitObservations } = vi.hoisted(() => ({
  mockRunOddsRefresh: vi.fn(),
  mockRecordCurrentProfitObservations: vi.fn(),
}));

vi.mock("./refresh", () => ({ runOddsRefresh: mockRunOddsRefresh }));
vi.mock("@/db/promoObservations", () => ({ recordCurrentProfitObservations: mockRecordCurrentProfitObservations }));

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

    expect(result).toEqual({ status: "ran", refreshOutcome: OK_OUTCOME });
    expect(mockRunOddsRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });

  it("skips (missing-api-key) without calling refresh or recording when ODDS_API_KEY is absent", async () => {
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: false });

    expect(result).toEqual({ status: "skipped", reason: "missing-api-key" });
    expect(mockRunOddsRefresh).not.toHaveBeenCalled();
    expect(mockRecordCurrentProfitObservations).not.toHaveBeenCalled();
  });

  it("runs the moneyline-only refresh (confirmed, no triggering user) and records observations on success", async () => {
    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toEqual({ status: "ran", refreshOutcome: OK_OUTCOME });
    expect(mockRunOddsRefresh).toHaveBeenCalledWith({ confirmed: true, triggeredByUserId: null, now: MORNING_INSTANT });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledWith(MORNING_INSTANT);
  });

  it("still records observations from cache when the refresh comes back blocked", async () => {
    mockRunOddsRefresh.mockResolvedValue(BLOCKED_OUTCOME);

    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toEqual({ status: "ran", refreshOutcome: BLOCKED_OUTCOME });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });

  it("still records observations from cache when the refresh throws/errors", async () => {
    const errorOutcome: RefreshOutcome = { status: "error", message: "Couldn't refresh odds: the Odds API didn't respond." };
    mockRunOddsRefresh.mockResolvedValue(errorOutcome);

    const result = await runMorningObservation({ now: MORNING_INSTANT, hasApiKey: true });

    expect(result).toEqual({ status: "ran", refreshOutcome: errorOutcome });
    expect(mockRecordCurrentProfitObservations).toHaveBeenCalledTimes(1);
  });
});
