import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { usableOddsBooks } from "@/config/books";
import type { FindHedgesResponse } from "@/domain/finder/types";

/**
 * MVP end-to-end finder test (walking-skeleton Task 1). Exercises the
 * findHedges server action against mocked cached-odds queries only — no
 * real DB connection in this test.
 */
// vi.mock factories are hoisted above all other module-level code, so any
// value they reference must be created via vi.hoisted() to avoid a
// temporal-dead-zone "Cannot access before initialization" error.
const now = vi.hoisted(() => new Date("2026-10-01T12:00:00.000Z"));

// Plan 05 (D-13..D-20): getBonusBooks/getHedgeBookKeys mocks honor their
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
    getCachedEvents: vi.fn().mockResolvedValue({ events: buildFixtureEvents(now), fetchedAt: now }),
  };
});

vi.mock("@/lib/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 7, email: "test@example.com", displayName: "Test User" }),
}));

import { getBonusBooks, getHedgeBookKeys, getCachedEvents, getUserBookKeys } from "@/db/queries";
import { requireUser } from "@/lib/session";
import { findHedges } from "./find-hedges";

describe("findHedges (MVP happy path)", () => {
  // findHedges calls `new Date()` internally as "now" for the 7-day search
  // window (per plan action step 4); pin the system clock to the fixture's
  // `now` so the fixture events' commence_time offsets land inside it.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("returns the ranked hedge opportunities for draftkings / $100", async () => {
    const response: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "100",
    });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;

    const all = response.resultsBySport.all;
    expect(all).toHaveLength(3);

    const [first] = all;
    expect(first.homeTeam).toBe("Denver Nuggets");
    expect(first.awayTeam).toBe("Utah Jazz");
    expect(first.bonus.bookKey).toBe("draftkings");
    expect(first.bonus.team).toBe("Utah Jazz");
    expect(first.bonus.oddsAmerican).toBe(300);
    expect(first.hedge.bookKey).toBe("fanduel");
    expect(first.hedge.bookName).toBe("FanDuel");
    expect(first.hedge.team).toBe("Denver Nuggets");
    expect(first.hedge.oddsAmerican).toBe(-275);
    expect(first.hedgeStake).toBe("220.00");
    expect(first.guaranteedProfit).toBe("80.00");
    expect(first.conversionPct).toBe("80.00");
    expect(first.sameBook).toBe(false);

    const nfl = all.find((r) => r.sportKey === "americanfootball_nfl");
    expect(nfl?.tieRisk).toBe(true);

    const mlb = all.find((r) => r.sportKey === "baseball_mlb");
    expect(mlb?.hedge.bookKey).toBe("draftkings");
    expect(mlb?.sameBook).toBe(true);

    // Each sport's tab is ranked independently, not sliced from "all".
    expect(response.resultsBySport.basketball_nba).toHaveLength(1);
    expect(response.resultsBySport.baseball_mlb).toHaveLength(1);
    expect(response.resultsBySport.americanfootball_nfl).toHaveLength(1);
    expect(response.resultsBySport.americanfootball_ncaaf).toHaveLength(0);
    expect(response.resultsBySport.basketball_ncaab).toHaveLength(0);
  });

  it("rejects a zero bonus amount", async () => {
    const response: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "0",
    });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.bonusAmount).toBeTruthy();
  });

  it("rejects a book with no Odds API coverage", async () => {
    const response: FindHedgesResponse = await findHedges({
      bookKey: "circa",
      bonusAmount: "100",
    });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.bookKey).toBeTruthy();
  });

  it("rejects invalid maxHedgeAmount values", async () => {
    for (const bad of ["0", "-5", "abc", "1.234"]) {
      const response: FindHedgesResponse = await findHedges({
        bookKey: "draftkings",
        bonusAmount: "100",
        maxHedgeAmount: bad,
      });

      expect(response.status).toBe("invalid");
      if (response.status !== "invalid") continue;
      expect(response.fieldErrors.maxHedgeAmount).toBeTruthy();
    }
  });

  it("caps hedge stakes with maxHedgeAmount and reports limitExcludedAll per scope (D-18)", async () => {
    // $50 is below every fixture game's BEST-orientation hedge stake (the
    // longshot-bonus orientations need 220.00 / 306.92 / 217.50). Under the
    // owner's rule (UAT 01.1 Test 5), a game whose best orientation is over
    // the cap is dropped entirely -- it does NOT fall back to its
    // favorite-side orientation (8.55 / 6.25 / 4.17) even though that would
    // fit under $50. So every sport that had a result now has none -- but
    // only the sports that actually had a result before the cap should
    // report excluded.
    const capped: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "100",
      maxHedgeAmount: "50",
    });

    expect(capped.status).toBe("ok");
    if (capped.status !== "ok") return;
    expect(capped.maxHedgeAmount).toBe("50.00");
    for (const results of Object.values(capped.resultsBySport)) {
      expect(results).toHaveLength(0);
    }
    expect(capped.limitExcludedAll.all).toBe(true);
    expect(capped.limitExcludedAll.basketball_nba).toBe(true);
    expect(capped.limitExcludedAll.baseball_mlb).toBe(true);
    expect(capped.limitExcludedAll.americanfootball_nfl).toBe(true);
    // These sports had zero results even without a cap, so the cap excludes nothing.
    expect(capped.limitExcludedAll.americanfootball_ncaaf).toBe(false);
    expect(capped.limitExcludedAll.basketball_ncaab).toBe(false);

    const uncapped: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "100",
    });

    expect(uncapped.status).toBe("ok");
    if (uncapped.status !== "ok") return;
    expect(uncapped.maxHedgeAmount).toBeNull();
    expect(Object.values(uncapped.limitExcludedAll).every((v) => v === false)).toBe(true);
  });

  it("drops only games whose best orientation exceeds the cap (UAT 01.1 Test 5)", async () => {
    // $250 sits between the fixture's best-orientation hedge stakes: nba
    // (220.00) and mlb (217.50) fit under it, but nfl (306.92) does not.
    // The owner's rule (UAT 01.1 Test 5) drops the nfl game entirely rather
    // than falling back to its favorite-side orientation.
    const uncapped: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "100",
    });
    expect(uncapped.status).toBe("ok");
    if (uncapped.status !== "ok") return;
    const uncappedByEventId = new Map(uncapped.resultsBySport.all.map((r) => [r.eventId, r]));

    const capped: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "100",
      maxHedgeAmount: "250",
    });

    expect(capped.status).toBe("ok");
    if (capped.status !== "ok") return;
    expect(capped.resultsBySport.all.map((r) => r.eventId).sort()).toEqual([
      "mlb-dodgers-rockies",
      "nba-nuggets-jazz",
    ]);
    expect(capped.resultsBySport.all.some((r) => r.eventId === "nfl-packers-panthers")).toBe(
      false,
    );

    // Surviving games keep their best (uncapped) orientation's numbers.
    for (const row of capped.resultsBySport.all) {
      const uncappedRow = uncappedByEventId.get(row.eventId)!;
      expect(row.hedgeStake).toBe(uncappedRow.hedgeStake);
      expect(row.guaranteedProfit).toBe(uncappedRow.guaranteedProfit);
    }

    expect(capped.limitExcludedAll.all).toBe(false);
    expect(capped.limitExcludedAll.americanfootball_nfl).toBe(true);
  });
});

describe("findHedges (per-sport tabs, owner-requested scope change)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("shows a sport in its own tab even when it doesn't crack the overall top 10", async () => {
    // 11 NBA markets all at the reference $100@+300 / -275 fixture (profit
    // $80.00 each) so they fill every "all" top-10 slot, plus one MLB
    // market with a smaller (but still positive) profit that must still
    // surface in its own baseball_mlb tab.
    const nbaEvents = Array.from({ length: 11 }, (_, i) => ({
      id: `nba-fill-${i}`,
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: new Date(now.getTime() + (24 + i) * 60 * 60 * 1000).toISOString(),
      home_team: `Home Team ${i}`,
      away_team: `Away Team ${i}`,
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: `Away Team ${i}`, price: 300 },
                { name: `Home Team ${i}`, price: -400 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: `Away Team ${i}`, price: 250 },
                { name: `Home Team ${i}`, price: -275 },
              ],
            },
          ],
        },
      ],
    }));

    const mlbEvent = {
      id: "mlb-low-profit",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString(),
      home_team: "Home Nine",
      away_team: "Away Nine",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Away Nine", price: 150 },
                { name: "Home Nine", price: -170 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Away Nine", price: 140 },
                { name: "Home Nine", price: -140 },
              ],
            },
          ],
        },
      ],
    };

    vi.mocked(getBonusBooks).mockResolvedValueOnce(
      usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName })),
    );
    vi.mocked(getHedgeBookKeys).mockResolvedValueOnce(usableOddsBooks().map((b) => b.key));
    vi.mocked(getCachedEvents).mockResolvedValueOnce({
      events: [...nbaEvents, mlbEvent] as never,
      fetchedAt: now,
    });

    const response = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;

    expect(response.resultsBySport.all).toHaveLength(10);
    expect(response.resultsBySport.all.every((r) => r.sportKey === "basketball_nba")).toBe(true);
    expect(response.resultsBySport.all.some((r) => r.eventId === "mlb-low-profit")).toBe(false);

    expect(response.resultsBySport.baseball_mlb).toHaveLength(1);
    expect(response.resultsBySport.baseball_mlb[0].eventId).toBe("mlb-low-profit");
    expect(Number(response.resultsBySport.baseball_mlb[0].guaranteedProfit)).toBeGreaterThan(0);
    expect(Number(response.resultsBySport.baseball_mlb[0].guaranteedProfit)).toBeLessThan(80);
  });
});

describe("findHedges (per-user book scoping, D-13..D-20)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("flags booksExcludedAll false when the user has every usable book", async () => {
    const response = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.booksExcludedAll).toBe(false);
  });

  it("only ever suggests the user's own books on both legs (D-14)", async () => {
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(["draftkings", "betmgm"]);

    const response = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    const allowed = new Set(["draftkings", "betmgm"]);
    for (const results of Object.values(response.resultsBySport)) {
      for (const row of results) {
        expect(allowed.has(row.bonus.bookKey)).toBe(true);
        expect(allowed.has(row.hedge.bookKey)).toBe(true);
      }
    }
  });

  it("keeps the same-book hedge badge when that book is one of the user's books (D-15)", async () => {
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(["draftkings", "betmgm"]);

    const response = await findHedges({ bookKey: "draftkings", bonusAmount: "100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    const mlb = response.resultsBySport.all.find((r) => r.sportKey === "baseball_mlb");
    expect(mlb?.hedge.bookKey).toBe("draftkings");
    expect(mlb?.sameBook).toBe(true);
  });

  it("rejects a bonus book outside the user's selection (D-13)", async () => {
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(["draftkings"]);

    const response = await findHedges({ bookKey: "fanduel", bonusAmount: "100" });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.bookKey).toEqual(["Choose the book holding your bonus bet."]);
  });

  it("flags booksExcludedAll when the user's books don't cover any qualifying game (D-18)", async () => {
    vi.mocked(getUserBookKeys).mockResolvedValueOnce(["ballybet"]);

    const response = await findHedges({ bookKey: "ballybet", bonusAmount: "100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.resultsBySport.all).toEqual([]);
    expect(response.booksExcludedAll).toBe(true);
  });

  it("rejects when logged out, before any cache read (D-20)", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const callsBefore = vi.mocked(getCachedEvents).mock.calls.length;

    await expect(
      findHedges({ bookKey: "draftkings", bonusAmount: "100" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(vi.mocked(getCachedEvents).mock.calls.length).toBe(callsBefore);
  });
});
