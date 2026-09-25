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
      sportKey: "all",
    });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;

    expect(response.results).toHaveLength(3);

    const [first] = response.results;
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

    const nfl = response.results.find((r) => r.sportKey === "americanfootball_nfl");
    expect(nfl?.tieRisk).toBe(true);

    const mlb = response.results.find((r) => r.sportKey === "baseball_mlb");
    expect(mlb?.hedge.bookKey).toBe("draftkings");
    expect(mlb?.sameBook).toBe(true);
  });

  it("rejects a zero bonus amount", async () => {
    const response: FindHedgesResponse = await findHedges({
      bookKey: "draftkings",
      bonusAmount: "0",
      sportKey: "all",
    });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.bonusAmount).toBeTruthy();
  });

  it("rejects a book with no Odds API coverage", async () => {
    const response: FindHedgesResponse = await findHedges({
      bookKey: "circa",
      bonusAmount: "100",
      sportKey: "all",
    });

    expect(response.status).toBe("invalid");
    if (response.status !== "invalid") return;
    expect(response.fieldErrors.bookKey).toBeTruthy();
  });
});
