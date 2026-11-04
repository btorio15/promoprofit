import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { topConversionFor } from "./conversionRate";
import { buildConversionSnapshotRows, CONVERSION_REFERENCE_AMOUNT } from "./conversionSnapshot";

const NOW = new Date("2026-11-03T18:00:00Z");
const DAY = 24 * 3600 * 1000;

/** prices[bookKey] = [home price, away price] on an h2h market. */
function game(id: string, daysOut: number, prices: Record<string, [number, number]>): OddsEvent {
  return {
    id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: new Date(NOW.getTime() + daysOut * DAY).toISOString(),
    home_team: `${id} H`,
    away_team: `${id} A`,
    bookmakers: Object.entries(prices).map(([key, [home, away]]) => ({
      key,
      title: key,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: `${id} H`, price: home },
            { name: `${id} A`, price: away },
          ],
        },
      ],
    })),
  };
}

const BOOKS = ["bookA", "bookB"] as const;

describe("buildConversionSnapshotRows", () => {
  it("(a) pins the single-game top profit and pct for a $100 bonus bet", () => {
    // Bonus $100 on A home +200 (stake not returned: win pays $200); hedge B
    // away -150 ... rows pinned from calculateBonusBetHedge; hand check:
    // hedge stake H = 200 / (1 + 100/150) = 120.00 -> if bonus wins: 200 - 120 = 80;
    // if hedge wins: 120 * (100/150) = 80. Both equal the guaranteed profit.
    const events = [game("g1", 1, { bookA: [200, -250], bookB: [-300, -150] })];
    const [rowA] = buildConversionSnapshotRows({ events, now: NOW, bookKeys: ["bookA", "bookB"] });
    expect(rowA).toMatchObject({
      bookKey: "bookA",
      referenceAmount: "100.00",
      candidateCount: 1,
      topNCount: 1,
      topProfit: "80.00",
      topPct: "80.00",
      medianTopPct: "80",
      topEventId: "g1",
      topSportKey: "americanfootball_nfl",
      topHedgeBookKey: "bookB",
      denverDate: "2026-11-03",
      denverHour: 11,
    });
    expect(rowA.capturedAt).toEqual(NOW);
  });

  it("(b) matches topConversionFor for every book in a multi-book fixture", () => {
    const events = [
      game("g1", 1, { bookA: [200, -250], bookB: [-300, -150], bookC: [150, -170] }),
      game("g2", 2, { bookA: [-120, 105], bookB: [140, -160], bookC: [-110, 125] }),
      game("g3", 3, { bookA: [250, -300], bookB: [180, -210], bookC: [-130, 160] }),
    ];
    const bookKeys = ["bookA", "bookB", "bookC"];
    const rows = buildConversionSnapshotRows({ events, now: NOW, bookKeys });
    for (const row of rows) {
      const top = topConversionFor({
        events,
        now: NOW,
        refundBookKey: row.bookKey,
        amount: CONVERSION_REFERENCE_AMOUNT,
        hedgeBookKeys: new Set(bookKeys),
      });
      expect(top).not.toBeNull();
      expect(row.topProfit).toBe(top!.profit.toFixed(2));
      expect(row.topPct).toBe(top!.pct.toFixed(2));
      expect(row.topEventId).toBe(top!.eventId);
      expect(row.topHedgeBookKey).toBe(top!.hedgeBookKey);
    }
  });

  it("(c) two profitable games give the mean of the two pcts, stored exactly", () => {
    const events = [
      game("g1", 1, { bookA: [200, -250], bookB: [-300, -150] }),
      game("g2", 2, { bookA: [175, -250], bookB: [-300, -145] }),
    ];
    const [row] = buildConversionSnapshotRows({ events, now: NOW, bookKeys: [...BOOKS] });
    expect(row.candidateCount).toBe(2);
    expect(row.topNCount).toBe(2);
    const pcts = ["g1", "g2"].map((id) => {
      const only = buildConversionSnapshotRows({
        events: events.filter((e) => e.id === id),
        now: NOW,
        bookKeys: [...BOOKS],
      })[0];
      return new Decimal(only.topPct!);
    });
    const mean = pcts[0].plus(pcts[1]).dividedBy(2);
    // The two truncated pcts differ, so the mean has a third decimal.
    expect(row.medianTopPct).toBe(mean.toString());
    expect(row.medianTopPct!.split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("(d) seven profitable games: candidateCount 7, median over the best 5 only", () => {
    const events = [0, 1, 2, 3, 4, 5, 6].map((i) =>
      game(`g${i}`, 1 + i * 0.5, { bookA: [200 - i * 10, -250], bookB: [-300, -150 + i * 2] }),
    );
    const [row] = buildConversionSnapshotRows({ events, now: NOW, bookKeys: [...BOOKS] });
    expect(row.candidateCount).toBe(7);
    expect(row.topNCount).toBe(5);
    const perGame = events
      .map((e) =>
        new Decimal(
          buildConversionSnapshotRows({ events: [e], now: NOW, bookKeys: [...BOOKS] })[0].topPct!,
        ),
      )
      .sort((a, b) => b.comparedTo(a));
    expect(row.topPct).toBe(perGame[0].toFixed(2));
    expect(row.medianTopPct).toBe(perGame[2].toDecimalPlaces(3).toString());
  });

  it("(e) a book with no quotes / no profitable game gets null top fields and zero counts", () => {
    const events = [game("g1", 1, { bookA: [200, -250], bookB: [-300, -150] })];
    const rows = buildConversionSnapshotRows({ events, now: NOW, bookKeys: ["bookA", "ghost"] });
    expect(rows[1]).toMatchObject({
      bookKey: "ghost",
      candidateCount: 0,
      topNCount: 0,
      topProfit: null,
      topPct: null,
      medianTopPct: null,
      topEventId: null,
      topSportKey: null,
      topHedgeBookKey: null,
    });
  });

  it("(f) an event 8+ days out contributes nothing", () => {
    const events = [game("far", 8.5, { bookA: [200, -250], bookB: [-300, -150] })];
    const [row] = buildConversionSnapshotRows({ events, now: NOW, bookKeys: [...BOOKS] });
    expect(row.candidateCount).toBe(0);
    expect(row.topProfit).toBeNull();
  });

  it("(g) output order matches bookKeys order and numeric fields are strings", () => {
    const events = [game("g1", 1, { bookA: [200, -250], bookB: [-300, -150] })];
    const rows = buildConversionSnapshotRows({ events, now: NOW, bookKeys: ["bookB", "bookA"] });
    expect(rows.map((r) => r.bookKey)).toEqual(["bookB", "bookA"]);
    for (const row of rows) {
      expect(typeof row.referenceAmount).toBe("string");
      for (const f of [row.topProfit, row.topPct, row.medianTopPct]) {
        if (f !== null) expect(typeof f).toBe("string");
      }
    }
  });
});
