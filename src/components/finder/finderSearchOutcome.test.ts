import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/find-hedges", () => ({ findHedges: vi.fn() }));

import { findHedges } from "@/app/actions/find-hedges";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import type { FindHedgesResponse } from "@/domain/finder/types";
import { resolveFinderOutcome } from "./finderSearchOutcome";

const payload = { bookKey: "draftkings", bonusAmount: "100" };
const mocked = vi.mocked(findHedges);

afterEach(() => vi.restoreAllMocks());

describe("resolveFinderOutcome", () => {
  it("maps a rejected findHedges (NeonDbError) to the inline error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("Error connecting to database: TypeError: fetch failed");
    err.name = "NeonDbError";
    mocked.mockRejectedValueOnce(err);
    const outcome = resolveFinderOutcome(await safeAction(() => findHedges(payload), "findHedges"));
    expect(outcome).toEqual({ kind: "error", message: ACTION_FAILED_MESSAGE });
    expect(ACTION_FAILED_MESSAGE).toBe("Couldn't reach the database — try again.");
  });

  it("maps invalid to field errors", async () => {
    const fieldErrors = { bonusAmount: ["bad"] };
    mocked.mockResolvedValueOnce({ status: "invalid", fieldErrors });
    const outcome = resolveFinderOutcome(await safeAction(() => findHedges(payload), "findHedges"));
    expect(outcome).toEqual({ kind: "invalid", fieldErrors });
  });

  it("maps no_cached_odds to a response", async () => {
    const response: FindHedgesResponse = { status: "no_cached_odds" };
    mocked.mockResolvedValueOnce(response);
    const outcome = resolveFinderOutcome(await safeAction(() => findHedges(payload), "findHedges"));
    expect(outcome).toEqual({ kind: "response", response });
  });

  it("maps ok to a response", () => {
    const response = { status: "ok" } as FindHedgesResponse;
    expect(resolveFinderOutcome({ ok: true, value: response })).toEqual({
      kind: "response",
      response,
    });
  });
});
