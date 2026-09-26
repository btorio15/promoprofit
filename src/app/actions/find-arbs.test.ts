import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildArbFixtureEvents, buildArbExtendedFixtureEvents } from "@/test/fixtures/arbEvents";
import { usableOddsBooks } from "@/config/books";
import type { FindArbsResponse } from "@/domain/arb/types";

/**
 * findArbs end-to-end test. Exercises the server action against mocked
 * cached-odds/cached-extended-odds queries only -- no real DB connection --
 * and asserts the odds client is never imported/called (SC1: zero credits).
 */
const now = vi.hoisted(() => new Date("2026-10-01T12:00:00.000Z"));

// Plan 05 (D-16..D-20): getBonusBooks/getHedgeBookKeys mocks honor their
// allowedKeys argument by delegating to the REAL intersection over
// usableOddsBooks() -- the same scoping src/db/queries.ts performs -- so
// these tests exercise the real per-user scoping behavior, not a stub.
vi.mock("@/db/queries", () => {
  const books = usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
  const allKeys = books.map((b) => b.key);
  return {
    getUserBookKeys: vi.fn().mockResolvedValue(allKeys),
    getBonusBooks: vi.fn((allowedKeys?: ReadonlySet<string>) =>
      Promise.resolve(allowedKeys ? books.filter((b) => allowedKeys.has(b.key)) : books),
    ),
    getHedgeBookKeys: vi.fn((allowedKeys?: ReadonlySet<string>) =>
      Promise.resolve(allowedKeys ? allKeys.filter((k) => allowedKeys.has(k)) : allKeys),
    ),
    getCachedEvents: vi.fn().mockResolvedValue({ events: buildArbFixtureEvents(now), fetchedAt: now }),
    getCachedExtendedEvents: vi
      .fn()
      .mockResolvedValue({ events: buildArbExtendedFixtureEvents(now), fetchedAt: now }),
  };
});

vi.mock("@/ingestion/odds/client", () => ({
  fetchSportOdds: vi.fn(),
  listSports: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 7, email: "test@example.com", displayName: "Test User" }),
}));

import {
  getBonusBooks,
  getHedgeBookKeys,
  getCachedEvents,
  getCachedExtendedEvents,
  getUserBookKeys,
} from "@/db/queries";
import { fetchSportOdds, listSports } from "@/ingestion/odds/client";
import { requireUser } from "@/lib/session";
import { findArbs } from "./find-arbs";

describe("findArbs", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("never calls the odds client (SC1: zero credits)", async () => {
    await findArbs({ totalStake: "200" });
    expect(fetchSportOdds).not.toHaveBeenCalled();
    expect(listSports).not.toHaveBeenCalled();
  });

  it("returns cent-exact moneyline + spread/total arbs ranked by return %, whole dollars", async () => {
    const response: FindArbsResponse = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.precision).toBe("whole");
    expect(response.totalStake).toBe("200.00");
    expect(response.oddsFetchedAt).toBe(now.toISOString());
    expect(response.extendedOddsFetchedAt).toBe(now.toISOString());

    const all = response.resultsBySport.all;
    const eventIds = all.map((r) => r.eventId);

    // (a) and (b) moneyline arbs present, (c) absent (no arb).
    expect(eventIds).toContain("nba-jazz-nuggets-arb");
    expect(eventIds).toContain("nfl-dolphins-jets-arb");
    expect(eventIds).not.toContain("mlb-rockies-dodgers-noarb");

    // Spread and total arbs from the extended fixtures are merged in.
    const spreadRow = all.find((r) => r.eventId === "ncaaf-spread-arb-d");
    const totalRow = all.find((r) => r.eventId === "ncaab-total-arb-e");
    expect(spreadRow).toBeDefined();
    expect(totalRow).toBeDefined();

    // The whole-number spread line must never surface.
    expect(all.some((r) => r.marketType === "spread" && r.marketBadge === "Spread ±3")).toBe(false);

    // Sorted by return % descending.
    const returnPcts = all.map((r) => Number(r.returnPct));
    const sorted = [...returnPcts].sort((a, b) => b - a);
    expect(returnPcts).toEqual(sorted);

    // Fixture (a) exact values.
    const nbaRow = all.find((r) => r.eventId === "nba-jazz-nuggets-arb")!;
    expect(nbaRow.marketType).toBe("moneyline");
    expect(nbaRow.marketBadge).toBe("Moneyline");
    expect(nbaRow.stakeA).toBe("94.00");
    expect(nbaRow.stakeB).toBe("106.00");
    expect(nbaRow.guaranteedProfit).toBe("6.80");
    expect(nbaRow.returnPct).toBe("3.40");
    expect(nbaRow.worstCase).toBe(true);
    expect(nbaRow.sideA.bookName).toBe("FanDuel");
    expect(nbaRow.sideA.selection).toBe("Utah Jazz");

    // Fixture (b): different books on each side (D-06).
    const nflRow = all.find((r) => r.eventId === "nfl-dolphins-jets-arb")!;
    expect(nflRow.sideA.bookKey).not.toBe(nflRow.sideB.bookKey);

    // Spread row shape (D-15, D-07).
    expect(spreadRow!.marketBadge).toBe("Spread ±3.5");
    expect(spreadRow!.sideA.selection.endsWith("+3.5")).toBe(true);
    expect(spreadRow!.sideA.tiedBookNames).toHaveLength(1);

    // resultsBySport has "all" plus every SPORT_KEYS key, each ranked
    // independently -- basketball_nba contains only NBA rows.
    expect(response.resultsBySport.basketball_nba).toBeDefined();
    expect(
      response.resultsBySport.basketball_nba.every((r) => r.sportKey === "basketball_nba"),
    ).toBe(true);
    expect(response.resultsBySport.basketball_nba.some((r) => r.eventId === "nba-jazz-nuggets-arb")).toBe(
      true,
    );
  });

  it("returns cent precision numbers when requested", async () => {
    const response: FindArbsResponse = await findArbs({ totalStake: "200", precision: "cents" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.precision).toBe("cents");

    const nbaRow = response.resultsBySport.all.find((r) => r.eventId === "nba-jazz-nuggets-arb")!;
    // CR-01 (01.1 review fix): the exact solver reaches the same $6.87 on a
    // smaller lay ($199.71) than the old 94.03/105.96 ($199.99) split.
    expect(nbaRow.stakeA).toBe("93.90");
    expect(nbaRow.stakeB).toBe("105.81");
    expect(nbaRow.guaranteedProfit).toBe("6.87");
    expect(nbaRow.returnPct).toBe("3.43");
  });

  it("returns moneyline-only rows when the extended cache is empty", async () => {
    vi.mocked(getCachedExtendedEvents).mockResolvedValueOnce({ events: [], fetchedAt: null });

    const response: FindArbsResponse = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.extendedOddsFetchedAt).toBeNull();
    expect(response.oddsFetchedAt).toBe(now.toISOString());
    expect(response.resultsBySport.all.some((r) => r.marketType === "spread")).toBe(false);
    expect(response.resultsBySport.all.some((r) => r.marketType === "total")).toBe(false);
    expect(response.resultsBySport.all.some((r) => r.marketType === "moneyline")).toBe(true);
  });

  it("returns no_cached_odds when both caches are empty", async () => {
    vi.mocked(getCachedEvents).mockResolvedValueOnce({ events: [], fetchedAt: null });
    vi.mocked(getCachedExtendedEvents).mockResolvedValueOnce({ events: [], fetchedAt: null });

    const response: FindArbsResponse = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("no_cached_odds");
  });

  it("rejects an invalid total stake", async () => {
    const response: FindArbsResponse = await findArbs({ totalStake: "0" });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.totalStake).toBeTruthy();
  });

  it("never reads getBonusBooks/getHedgeBookKeys for book names/keys other than via config-backed queries", async () => {
    await findArbs({ totalStake: "200" });
    expect(getBonusBooks).toHaveBeenCalled();
    expect(getHedgeBookKeys).toHaveBeenCalled();
    expect(getCachedEvents).toHaveBeenCalled();
  });
});

describe("findArbs (per-user book scoping, D-16..D-20)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("flags booksExcludedAll false when the user has every usable book", async () => {
    const response = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.booksExcludedAll).toBe(false);
  });

  it("never surfaces an excluded book on a leg or in the Multiple-books tie list (D-16, D-17)", async () => {
    const allKeys = usableOddsBooks().map((b) => b.key);
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(allKeys.filter((k) => k !== "draftkings"));

    const response = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    for (const results of Object.values(response.resultsBySport)) {
      for (const row of results) {
        expect(row.sideA.bookKey).not.toBe("draftkings");
        expect(row.sideB.bookKey).not.toBe("draftkings");
        expect(row.sideA.tiedBookNames).not.toContain("DraftKings");
        expect(row.sideB.tiedBookNames).not.toContain("DraftKings");
      }
    }
  });

  it("flags booksExcludedAll when the user's single book has no arb coverage (D-18)", async () => {
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(["hardrockbet"]);

    const response = await findArbs({ totalStake: "200" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.resultsBySport.all).toEqual([]);
    expect(response.booksExcludedAll).toBe(true);
  });

  it("rejects when logged out, before any cache read (D-20)", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const callsBefore = vi.mocked(getCachedEvents).mock.calls.length;

    await expect(findArbs({ totalStake: "200" })).rejects.toThrow("NEXT_REDIRECT");

    expect(vi.mocked(getCachedEvents).mock.calls.length).toBe(callsBefore);
  });
});
