import { describe, expect, it, vi } from "vitest";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { usableOddsBooks } from "@/config/books";
import type { FindHedgesResponse } from "@/domain/finder/types";

/**
 * MVP end-to-end finder test (walking-skeleton Task 1). This is intended
 * to be RED until Plan 02 creates src/app/actions/find-hedges.ts — do not
 * "fix" the missing module here.
 */
const now = new Date("2026-10-01T12:00:00.000Z");

vi.mock("@/db/queries", () => {
  const books = usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
  const hedgeBookKeys = books.map((b) => b.key);
  return {
    getBonusBooks: vi.fn().mockResolvedValue(books),
    getHedgeBookKeys: vi.fn().mockResolvedValue(hedgeBookKeys),
    getCachedEvents: vi.fn().mockResolvedValue({ events: buildFixtureEvents(now), fetchedAt: now }),
  };
});

// @ts-expect-error - ./find-hedges is created in Plan 02; this import intentionally
// fails (module not found) until then, so this test stays RED by design.
import { findHedges } from "./find-hedges";

describe("findHedges (MVP happy path — RED until Plan 02)", () => {
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
