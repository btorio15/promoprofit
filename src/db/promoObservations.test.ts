import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { calculateProfitBoostHedge } from "@/domain/hedge/profitBoost";
import { applyMemberCaps } from "@/domain/promos/yourCap";
import type { ActivePromo } from "./promos";

vi.mock("./queries", () => ({
  getCachedEvents: vi.fn(),
  getCachedExtendedEvents: vi.fn(),
  getHedgeBookKeys: vi.fn(),
}));
vi.mock("./promoTracking", () => ({ recordProfitObservations: vi.fn() }));
vi.mock("./promos", () => ({ getActivePromos: vi.fn() }));

import { getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys } from "./queries";
import { recordProfitObservations } from "./promoTracking";
import { recordCurrentProfitObservations } from "./promoObservations";

const NOW = new Date("2026-09-27T00:00:00Z");

const event: OddsEvent = {
  id: "nfl-obs",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString(),
  home_team: "Team H",
  away_team: "Team A",
  bookmakers: [
    { key: "ballybet", price: [120, -140] },
    { key: "betmgm", price: [-130, 115] },
  ].map((b) => ({
    key: b.key,
    title: b.key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "Team H", price: b.price[0] },
          { name: "Team A", price: b.price[1] },
        ],
      },
    ],
  })),
};

const boost: ActivePromo = {
  id: 20,
  bookKey: "ballybet",
  promoType: "profit_boost",
  scope: { kind: "event", eventId: "nfl-obs", sportKey: "americanfootball_nfl" },
  pinned: null,
  eligibleMarketTypes: ["moneyline"],
  boostPercent: "50.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "25.00",
  winningsCap: null,
  minOddsAmerican: null,
  finePrintNote: null,
  claimHint: null,
  scopeLabel: "Team A @ Team H",
  autoMatched: false,
  attribution: [],
  addedByYou: false,
};

function solve(maxStake: string, baseOdds: number, hedgeOdds: number) {
  return calculateProfitBoostHedge({
    boostedOddsAmerican: null,
    baseOddsAmerican: baseOdds,
    boostPercent: new Decimal("50.00"),
    hedgeOddsAmerican: hedgeOdds,
    maxStake: new Decimal(maxStake),
    winningsCap: null,
    minOddsAmerican: null,
    precision: "cents",
  })!;
}

describe("recordCurrentProfitObservations (quick-261001-dhn)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCachedEvents).mockResolvedValue({ events: [event], fetchedAt: NOW });
    vi.mocked(getCachedExtendedEvents).mockResolvedValue({ events: [], fetchedAt: null });
    vi.mocked(getHedgeBookKeys).mockResolvedValue(["betmgm"]);
    vi.mocked(recordProfitObservations).mockResolvedValue(undefined);
  });

  it("records the promo's own-cap profit even when the viewer's override is lower", async () => {
    const [capped] = applyMemberCaps([boost], new Map([[20, "20.00"]]));
    expect(capped.maxStake).toBe("20.00");

    await recordCurrentProfitObservations(NOW, { activePromos: [capped], precision: "cents" });

    expect(recordProfitObservations).toHaveBeenCalledTimes(1);
    const [entries] = vi.mocked(recordProfitObservations).mock.calls[0];
    expect(entries).toHaveLength(1);
    // Hedge at betmgm away +115 -> boost on ballybet home +120.
    const at25 = solve("25", 120, 115).guaranteedProfit.toFixed(2);
    const at20 = solve("20", 120, 115).guaranteedProfit.toFixed(2);
    expect(at25).not.toBe(at20);
    expect(entries[0].maxGuaranteedProfit).toBe(at25);
  });
});
