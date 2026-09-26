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

vi.mock("@/db/queries", () => {
  const books = usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
  const hedgeBookKeys = books.map((b) => b.key);
  return {
    getBonusBooks: vi.fn().mockResolvedValue(books),
    getHedgeBookKeys: vi.fn().mockResolvedValue(hedgeBookKeys),
    getCachedEvents: vi.fn().mockResolvedValue({ events: buildFixtureEvents(now), fetchedAt: now }),
  };
});

import { getBonusBooks, getHedgeBookKeys, getCachedEvents } from "@/db/queries";
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
    // $50 is below every fixture hedge stake (220.00 / 306.92 / 217.50), so
    // every sport that had a result now has none -- but only the sports
    // that actually had a result before the cap should report excluded.
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
