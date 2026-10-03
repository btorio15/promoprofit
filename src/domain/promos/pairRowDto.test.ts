import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { findPairCandidates, type PairCandidate } from "./pairPromos";
import type { RankOptions } from "./rankPromoHedges";
import type { PresentablePromo } from "./promoRowDto";
import { toPairRowDTO } from "./pairRowDto";

const NOW = new Date("2026-09-27T00:00:00Z");
const COMMENCE = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();

const event: OddsEvent = {
  id: "e1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: COMMENCE,
  home_team: "Home Team",
  away_team: "Away Team",
  bookmakers: [
    {
      key: "draftkings",
      title: "draftkings",
      markets: [{ key: "h2h", outcomes: [{ name: "Home Team", price: 150 }, { name: "Away Team", price: -180 }] }],
    },
    {
      key: "fanduel",
      title: "fanduel",
      markets: [{ key: "h2h", outcomes: [{ name: "Home Team", price: -170 }, { name: "Away Team", price: 140 }] }],
    },
  ],
};

function base(id: number, bookKey: string): PresentablePromo {
  return {
    id,
    bookKey,
    promoType: "profit_boost",
    scope: { kind: "event", eventId: "e1", sportKey: "americanfootball_nfl" },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "50",
    winningsCap: null,
    minOddsAmerican: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any game",
    autoMatched: false,
    attribution: [],
  };
}

function bonus(id: number, bookKey: string): PresentablePromo {
  return { ...base(id, bookKey), promoType: "bonus_bet", boostPercent: null, bonusAmount: "50", maxStake: null };
}

const opts: RankOptions & { memberBookKeys: ReadonlySet<string> } = {
  moneylineEvents: [event],
  extendedEvents: [],
  hedgeBookKeys: new Set(["draftkings", "fanduel"]),
  precision: "cents",
  now: NOW,
  memberBookKeys: new Set(["draftkings", "fanduel"]),
};

const bookNames = new Map([
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
]);

function candidate(promos: PresentablePromo[]): PairCandidate<PresentablePromo> {
  const found = findPairCandidates(promos, new Map(), opts);
  expect(found).toHaveLength(1);
  return found[0];
}

describe("toPairRowDTO", () => {
  it("maps a boost + boost pair", () => {
    const c = candidate([base(1, "draftkings"), base(2, "fanduel")]);
    const dto = toPairRowDTO(c, bookNames);
    expect(dto.rowKey).toBe("pair-1-2");
    expect(dto.pairTypeLabel).toBe("Boost + Boost");
    expect(dto.rateLabel).toBe("ROI");
    expect(dto.commenceTime).toBe(COMMENCE);
    expect(dto.legA.bookName).toBe("DraftKings");
    expect(dto.legB.bookName).toBe("FanDuel");
    expect(dto.legA.stake).toBe(c.result.legA.stake.toFixed(2));
    expect(dto.legB.payout).toBe(c.result.legB.payout.toFixed(2));
    expect(dto.legA.oddsAmerican).toBe(c.oddsAAmerican);
    expect(dto.guaranteedProfit).toBe(c.result.guaranteedProfit.toFixed(2));
    expect(dto.roiPct).toBe(c.result.roiPct.toFixed(2));
    expect(dto.legA.bonusNote).toBeNull();
  });

  it("gain is pair profit minus the two separate profits, exact", () => {
    const c = candidate([base(1, "draftkings"), base(2, "fanduel")]);
    const forced: PairCandidate<PresentablePromo> = {
      ...c,
      result: { ...c.result, guaranteedProfit: new Decimal("60.00") },
      separateProfitA: new Decimal("20.00"),
      separateProfitB: new Decimal("15.00"),
    };
    const dto = toPairRowDTO(forced, bookNames);
    expect(dto.separateProfitA).toBe("20.00");
    expect(dto.separateProfitB).toBe("15.00");
    expect(dto.gain).toBe("25.00");
    expect(dto.guaranteedProfit).toBe("60.00");
  });

  it("worstCase is true only when the two outcomes differ", () => {
    const c = candidate([base(1, "draftkings"), base(2, "fanduel")]);
    const equal: PairCandidate<PresentablePromo> = {
      ...c,
      result: { ...c.result, netIfAWins: new Decimal("10.00"), netIfBWins: new Decimal("10.00") },
    };
    const differ: PairCandidate<PresentablePromo> = {
      ...c,
      result: { ...c.result, netIfAWins: new Decimal("10.00"), netIfBWins: new Decimal("9.99") },
    };
    expect(toPairRowDTO(equal, bookNames).worstCase).toBe(false);
    expect(toPairRowDTO(differ, bookNames).worstCase).toBe(true);
  });

  it("a bonus leg gets the stake-not-returned note and a Boost + Bonus bet label", () => {
    const c = candidate([base(9, "draftkings"), bonus(3, "fanduel")]);
    const dto = toPairRowDTO(c, bookNames);
    expect(dto.pairTypeLabel).toBe("Boost + Bonus bet");
    expect(dto.legA.promoTypeLabel).toBe("Boost");
    expect(dto.legB.promoTypeLabel).toBe("Bonus bet");
    expect(dto.legB.bonusNote).toBe("The bonus bet's stake isn't returned, so this leg only pays out its winnings.");
    expect(dto.legB.capNote).toBeNull();
  });

  it("a max-stake-bound boost leg carries the Phase 3 cap note", () => {
    const c = candidate([base(1, "draftkings"), base(2, "fanduel")]);
    const forced: PairCandidate<PresentablePromo> = {
      ...c,
      result: { ...c.result, legA: { ...c.result.legA, capBound: "max_stake" } },
    };
    const dto = toPairRowDTO(forced, bookNames);
    expect(dto.legA.capNote).toContain("Capped at DraftKings's $50.00 max stake");
  });

  it("a 2-bet pair has legC null", () => {
    const dto = toPairRowDTO(candidate([base(1, "draftkings"), bonus(2, "fanduel")]), bookNames);
    expect(dto.legC).toBeNull();
  });

  it("a top-up candidate maps legC with 2-dp money and the third stake in the total", () => {
    const c = candidate([base(1, "draftkings"), base(2, "fanduel")]);
    const topUpLeg = {
      stake: new Decimal("30.76"),
      payout: new Decimal("48.63"),
      oddsDecimal: new Decimal("1.5814"),
      priceSource: "quote" as const,
      capBound: null,
    };
    const forced: PairCandidate<PresentablePromo> = {
      ...c,
      result: {
        ...c.result,
        totalStaked: c.result.totalStaked.plus(topUpLeg.stake),
        topUp: { side: "B", leg: topUpLeg },
      },
      topUp: { side: "B", selection: c.selectionB, bookKey: "fanduel", oddsAmerican: -172 },
    };
    const dto = toPairRowDTO(forced, bookNames);
    expect(dto.legC).toEqual({
      side: "B",
      bookKey: "fanduel",
      bookName: "FanDuel",
      selectionLabel: expect.any(String),
      oddsAmerican: -172,
      stake: "30.76",
      payout: "48.63",
      note: expect.stringContaining("Ordinary bet (no promo)"),
    });
    expect(dto.totalStaked).toBe(forced.result.totalStaked.toFixed(2));
    expect(dto.legC?.note).toContain(dto.legC!.selectionLabel);
  });
});
