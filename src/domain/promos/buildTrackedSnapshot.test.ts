import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ConversionRateFor } from "@/domain/hedge/conversionRate";
import { buildTrackedSnapshot } from "./buildTrackedSnapshot";
import { toNoSweatRowDTO, type PresentableNoSweatPromo } from "./noSweatRowDto";
import { TrackedNoSweatSnapshotSchema } from "./noSweatSnapshot";
import { rankNoSweatFeed } from "./rankNoSweatFeed";

const NOW = new Date("2026-09-27T00:00:00Z");
const LOW = { oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false };

const promo: PresentableNoSweatPromo = {
  id: 7,
  bookKey: "bookA",
  title: "",
  refundCap: new Decimal("25.00"),
  minOddsAmerican: null,
  scope: { kind: "any" },
  scopeLabel: null,
  addedByYou: true,
  finePrintNote: null,
  claimHint: null,
  expiresAt: null,
  attribution: [],
};

const event: OddsEvent = {
  id: "g1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString(),
  home_team: "H",
  away_team: "A",
  bookmakers: [
    { key: "bookA", price: [150, -170] },
    { key: "draftkings", price: [-165, 145] },
  ].map((b) => ({
    key: b.key,
    title: b.key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "H", price: b.price[0] },
          { name: "A", price: b.price[1] },
        ],
      },
    ],
  })),
};

const rate: ConversionRateFor = (bookKey, amount) => {
  const profit = new Decimal(20);
  return {
    refundBookKey: bookKey,
    amount,
    profit,
    rate: profit.dividedBy(amount),
    pct: new Decimal(78),
    eventId: "conv-game",
    hedgeBookKey: "draftkings",
  };
};

function entry() {
  const r = rankNoSweatFeed({
    promos: [promo],
    moneylineEvents: [event],
    extendedEvents: [],
    now: NOW,
    hedgeBookKeys: new Set(["draftkings"]),
    precision: "cents",
    lowProfile: LOW,
    conversionRateFor: rate,
  });
  expect(r.ranked).toHaveLength(1);
  return r.ranked[0];
}

describe("buildTrackedSnapshot", () => {
  const names = new Map([["bookA", "Book A"], ["draftkings", "DraftKings"]]);
  const ctx = {
    bookNames: names,
    precision: "cents" as const,
    lowProfile: LOW,
    oddsFetchedAt: new Date("2026-09-26T23:55:00Z"),
    now: NOW,
  };

  it("passes the snapshot schema and matches the row figures", () => {
    const e = entry();
    const snap = buildTrackedSnapshot(e, ctx);
    expect(TrackedNoSweatSnapshotSchema.safeParse(snap).success).toBe(true);
    const row = toNoSweatRowDTO(e, names);
    expect(snap.qualifying.stake).toBe(row.qualifying.stake);
    expect(snap.qualifying.winnings).toBe(row.qualifying.winnings);
    expect(snap.hedge.stake).toBe(row.hedge.stake);
    expect(snap.hedge.payout).toBe(row.hedge.payout);
    expect(snap.estimate).toEqual({
      estimatedProfit: row.estimatedProfit,
      worstCaseProfit: row.worstCaseProfit,
      profitIfWin: row.profitIfWin,
      profitIfLose: row.profitIfLose,
      estRoiPct: row.estRoiPct,
    });
    expect(snap.conversion.ratePct).toBe(row.ratePct);
    expect(snap.conversion.refundValue).toBe(row.refundValue);
    expect(snap.promo.refundCap).toBe("25.00");
    expect(snap.promo.id).toBe(7);
    expect(snap.game.eventId).toBe("g1");
    expect(snap.game.commenceTime).toBe(row.commenceTime);
    expect(snap.recordedAt).toBe(NOW.toISOString());
    expect(snap.oddsFetchedAt).toBe("2026-09-26T23:55:00.000Z");
    expect(snap.lowProfile).toEqual(LOW);
  });

  it("stores null oddsFetchedAt when unknown", () => {
    expect(buildTrackedSnapshot(entry(), { ...ctx, oddsFetchedAt: null }).oddsFetchedAt).toBeNull();
  });
});
