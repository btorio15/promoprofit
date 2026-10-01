import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromoRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";
import {
  describePromoRefreshConfirm,
  isPromoRefreshDisabled,
  reducePromoRefreshOutcome,
  runPromoRefresh,
  type PromoRefreshAction,
} from "./promoRefresh";

const NO_ALT = { fetched: 0, skippedOverLimit: 0, skippedForCredits: false, failed: 0, unmatchedOutcomes: 0 };

afterEach(() => vi.restoreAllMocks());

describe("runPromoRefresh", () => {
  it("start calls the action with confirmed:false, confirm with confirmed:true", async () => {
    const action = vi.fn<PromoRefreshAction>().mockResolvedValue({ status: "no_promos", message: "x" });
    await runPromoRefresh(action, "start");
    await runPromoRefresh(action, "confirm");
    expect(action.mock.calls).toEqual([[{ confirmed: false }], [{ confirmed: true }]]);
  });

  it("a throwing action becomes the plain error outcome", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const action = vi.fn<PromoRefreshAction>().mockRejectedValue(new Error("boom"));
    expect(await runPromoRefresh(action, "confirm")).toEqual({ status: "error", message: ACTION_FAILED_MESSAGE });
  });
});

describe("reducePromoRefreshOutcome", () => {
  it("confirm_required -> confirm state, no side effects", () => {
    const r = reducePromoRefreshOutcome({
      status: "confirm_required",
      estimatedCredits: 7,
      remaining: 300,
      minutesSinceLastRefresh: null,
      sportKeys: ["americanfootball_nfl"],
    });
    expect(r).toEqual({
      confirm: { sportKeys: ["americanfootball_nfl"], estimatedCredits: 7, remaining: 300 },
      banner: null,
      refreshPage: false,
      recompute: false,
    });
  });

  it("ok -> refresh + recompute with the updated-sports headline and alt notes", () => {
    const outcome: PromoRefreshOutcome = {
      status: "ok",
      fetchedAt: "2026-10-01T15:00:00Z",
      sportsFetched: ["americanfootball_nfl", "americanfootball_ncaaf"],
      creditsSpent: 8,
      remaining: 100,
      altLines: { ...NO_ALT, fetched: 1, skippedOverLimit: 2 },
    };
    const r = reducePromoRefreshOutcome(outcome);
    expect(r.refreshPage).toBe(true);
    expect(r.recompute).toBe(true);
    expect(r.confirm).toBeNull();
    expect(r.banner?.kind).toBe("info");
    expect(r.banner?.message).toContain(
      "Updated odds for NFL, NCAAF (8 credits). Other sports keep their earlier prices.",
    );
    expect(r.banner?.message).toContain("2 more were skipped");
  });

  it("no_promos -> info banner, no refresh or recompute", () => {
    expect(reducePromoRefreshOutcome({ status: "no_promos", message: "No active promos to refresh." })).toEqual({
      confirm: null,
      banner: { kind: "info", message: "No active promos to refresh." },
      refreshPage: false,
      recompute: false,
    });
  });

  it("blocked -> blocked banner mentioning remaining credits", () => {
    const r = reducePromoRefreshOutcome({
      status: "blocked",
      reason: "low_credits",
      remaining: 12,
      estimatedCredits: 5,
      resetsOn: "2026-11-01T00:00:00.000Z",
    });
    expect(r.banner?.kind).toBe("blocked");
    expect(r.banner?.message).toContain("12 credits");
    expect(r.refreshPage).toBe(false);
  });

  it("busy and error -> banner with the message, refreshPage true, recompute false", () => {
    for (const status of ["busy", "error"] as const) {
      expect(reducePromoRefreshOutcome({ status, message: "m" })).toEqual({
        confirm: null,
        banner: { kind: status, message: "m" },
        refreshPage: true,
        recompute: false,
      });
    }
  });
});

describe("describePromoRefreshConfirm", () => {
  it("names sports, an estimate and the remaining balance", () => {
    expect(describePromoRefreshConfirm(["americanfootball_nfl", "americanfootball_ncaaf"], 9, 250)).toBe(
      "Refresh promos for NFL, NCAAF — about 9 credits (250 left).",
    );
  });
  it("unknown balance explains when it appears", () => {
    expect(describePromoRefreshConfirm(["icehockey_nhl"], 4, null)).toBe(
      "Refresh promos for NHL — about 4 credits. Your credit balance appears after the first refresh.",
    );
  });
});

describe("isPromoRefreshDisabled", () => {
  it("disabled when blocked or pending", () => {
    expect(isPromoRefreshDisabled({ level: "blocked" }, false)).toBe(true);
    expect(isPromoRefreshDisabled({ level: "normal" }, true)).toBe(true);
    expect(isPromoRefreshDisabled({ level: "normal" }, false)).toBe(false);
  });
});
