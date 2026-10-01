import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";
import {
  isSearchDisabled,
  reduceSearchOutcome,
  runSpreadsTotalsSearch,
  type SpreadsTotalsAction,
} from "./spreadsTotalsSearch";

const NO_ALT = { fetched: 0, skippedOverLimit: 0, skippedForCredits: false, failed: 0, unmatchedOutcomes: 0 };

function ok(altLines = NO_ALT): ExtendedRefreshOutcome {
  return { status: "ok", fetchedAt: "2026-10-01T15:00:00Z", sportsFetched: ["x"], creditsSpent: 3, remaining: 100, altLines };
}

afterEach(() => vi.restoreAllMocks());

describe("runSpreadsTotalsSearch", () => {
  it("start calls the action once with confirmed:false", async () => {
    const action = vi.fn<SpreadsTotalsAction>().mockResolvedValue(ok());
    const out = await runSpreadsTotalsSearch(action, "start");
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ confirmed: false });
    expect(out.status).toBe("ok");
  });

  it("only the confirm step sends confirmed:true", async () => {
    const action = vi.fn<SpreadsTotalsAction>(async ({ confirmed }) =>
      confirmed ? ok() : { status: "confirm_required", estimatedCredits: 9, remaining: 400, minutesSinceLastRefresh: 12 },
    );
    const first = await runSpreadsTotalsSearch(action, "start");
    const state = reduceSearchOutcome(first);
    expect(state.confirm).toEqual({ estimatedCredits: 9, remaining: 400, minutesSinceLastRefresh: 12 });
    expect(state.refreshPage).toBe(false);
    expect(state.recompute).toBe(false);
    expect(action).not.toHaveBeenCalledWith({ confirmed: true });

    const second = await runSpreadsTotalsSearch(action, "confirm");
    expect(action).toHaveBeenCalledWith({ confirmed: true });
    const done = reduceSearchOutcome(second);
    expect(done.confirm).toBeNull();
    expect(done.refreshPage).toBe(true);
    expect(done.recompute).toBe(true);
  });

  it("a rejecting action becomes the plain error message, logged via safeAction", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = vi.fn<SpreadsTotalsAction>().mockRejectedValue(new Error("fetch failed"));
    const out = await runSpreadsTotalsSearch(action, "start");
    expect(out).toEqual({ status: "error", message: ACTION_FAILED_MESSAGE });
    expect(spy.mock.calls[0]?.[0]).toContain("refreshSpreadsTotals");
  });
});

describe("reduceSearchOutcome", () => {
  it("ok with no alt-line issues has no banner", () => {
    expect(reduceSearchOutcome(ok()).banner).toBeNull();
  });

  it("ok with skipped alt-line games shows the info banner", () => {
    const r = reduceSearchOutcome(ok({ ...NO_ALT, fetched: 5, skippedOverLimit: 2 }));
    expect(r.banner?.kind).toBe("info");
    expect(r.banner?.message).toContain("2 more were skipped (limit is 5 per search)");
  });

  it("blocked shows the credits banner and does not refresh", () => {
    const r = reduceSearchOutcome({ status: "blocked", reason: "low_credits", remaining: 7, estimatedCredits: 9, resetsOn: "2026-11-01" });
    expect(r.banner?.kind).toBe("blocked");
    expect(r.banner?.message).toContain("Only 7 credits left — not enough for a spreads & totals search");
    expect(r.refreshPage).toBe(false);
    expect(r.recompute).toBe(false);
  });

  it("busy and error carry their message and refresh the page without recomputing", () => {
    const busy = reduceSearchOutcome({ status: "busy", message: "Another refresh is running." });
    expect(busy.banner).toEqual({ kind: "busy", message: "Another refresh is running." });
    expect(busy.refreshPage).toBe(true);
    expect(busy.recompute).toBe(false);
    const err = reduceSearchOutcome({ status: "error", message: "boom" });
    expect(err.banner).toEqual({ kind: "error", message: "boom" });
    expect(err.refreshPage).toBe(true);
    expect(err.recompute).toBe(false);
  });
});

describe("isSearchDisabled", () => {
  const base = { level: "normal" as const, remaining: 400, estimatedExtendedRefreshCredits: 9 };
  it("disabled when blocked, short on credits, or pending", () => {
    expect(isSearchDisabled({ ...base, level: "blocked" }, false)).toBe(true);
    expect(isSearchDisabled({ ...base, remaining: 8 }, false)).toBe(true);
    expect(isSearchDisabled(base, true)).toBe(true);
  });
  it("enabled otherwise; unknown remaining is not short", () => {
    expect(isSearchDisabled(base, false)).toBe(false);
    expect(isSearchDisabled({ ...base, remaining: null }, false)).toBe(false);
  });
});
