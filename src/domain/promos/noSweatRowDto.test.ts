import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ConversionRateFor } from "@/domain/hedge/conversionRate";
import { buildPriceAgeContext } from "./priceAge";
import { rankNoSweatFeed } from "./rankNoSweatFeed";
import {
  noSweatAriaLabel,
  toNoSweatNoteRowDTO,
  toNoSweatRowDTO,
  type PresentableNoSweatPromo,
} from "./noSweatRowDto";

const NOW = new Date("2026-09-27T00:00:00Z");
const MONEY = /^-?\d+\.\d{2}$/;

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
    lowProfile: {
      oddsCapEnabled: true,
      oddsCapAmerican: 300,
      mainLinesOnly: false,
      naturalStakes: false,
    },
    conversionRateFor: rate,
  });
  expect(r.ranked).toHaveLength(1);
  return r.ranked[0];
}

describe("toNoSweatRowDTO", () => {
  const names = new Map([["bookA", "Book A"], ["draftkings", "DraftKings"]]);

  it("marks the row as an estimate with 2dp money strings", () => {
    const dto = toNoSweatRowDTO(entry(), names);
    expect(dto.kind).toBe("no_sweat");
    expect(dto.estimated).toBe(true);
    expect(dto.pctLabel).toBe("Est. ROI");
    expect(dto.rowKey).toBe("nosweat-7");
    expect(dto.ratePct).toBe("78.00");
    expect(dto.title).toBe("No-sweat up to $25.00");
    expect(dto.bookName).toBe("Book A");
    for (const v of [
      dto.estimatedProfit,
      dto.worstCaseProfit,
      dto.profitIfWin,
      dto.profitIfLose,
      dto.estRoiPct,
      dto.refundCap,
      dto.refundAmount,
      dto.refundValue,
      dto.qualifying.stake,
      dto.qualifying.winnings,
      dto.hedge.stake,
      dto.hedge.payout,
    ]) {
      expect(v).toMatch(MONEY);
    }
  });

  it("pricesAsOf is the older of the qualifying and conversion game times", () => {
    const older = new Date("2026-09-26T23:00:00Z");
    const newer = new Date("2026-09-26T23:50:00Z");
    // g1 is a moneyline event cached at `newer`; conv-game is not in the
    // moneyline set so it reads the extended cache at `older`.
    const ctx = buildPriceAgeContext([event], newer, older);
    expect(toNoSweatRowDTO(entry(), names, ctx).pricesAsOf).toBe(older.toISOString());
    const ctx2 = buildPriceAgeContext([event], older, newer);
    expect(toNoSweatRowDTO(entry(), names, ctx2).pricesAsOf).toBe(older.toISOString());
    expect(toNoSweatRowDTO(entry(), names).pricesAsOf).toBeNull();
  });
});

describe("noSweatAriaLabel", () => {
  it("speaks plus/minus dollars and cents", () => {
    expect(
      noSweatAriaLabel({ estimatedProfit: "14.20", ratePct: "78.00" }),
    ).toBe("Estimate plus 14 dollars 20 cents at 78 percent.");
    expect(
      noSweatAriaLabel({ estimatedProfit: "-3.10", ratePct: "78.50" }),
    ).toBe("Estimate minus 3 dollars 10 cents at 78.50 percent.");
  });
});

describe("toNoSweatNoteRowDTO", () => {
  it("carries only the refund cap as a money figure", () => {
    const dto = toNoSweatNoteRowDTO(promo, "cant_price", new Map());
    expect(dto.kind).toBe("no_sweat_note");
    expect(dto.note).toBe("cant_price");
    expect(dto.refundCap).toBe("25.00");
    expect(Object.keys(dto).filter((k) => /profit|stake|roi/i.test(k))).toEqual([]);
  });
});
