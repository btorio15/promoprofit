import { describe, expect, it } from "vitest";
import {
  DonePromoSnapshotSchema,
  buildDoneSnapshot,
  isSameDisplayedProfit,
  sumProfitExtracted,
  toDonePromoDTO,
  type DonePromoTerms,
} from "./doneSnapshot";
import type { PromoRowDTO, UnprofitablePromoRowDTO } from "./dto";

const NOW = new Date("2026-09-29T15:00:00.000Z");
const ML = new Date("2026-09-29T14:00:00.000Z");

const terms: DonePromoTerms = {
  id: 5,
  bookKey: "draftkings",
  promoType: "profit_boost",
  title: "10% profit boost",
  boostPercent: "10.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "50.00",
  winningsCap: { kind: "extra_winnings", amount: "25.00" },
  minOddsAmerican: null,
};

function makeRow(over: Partial<PromoRowDTO> = {}): PromoRowDTO {
  return {
    rowKey: "promo-5",
    promoId: 5,
    promoType: "profit_boost",
    promoTypeLabel: "Boost",
    sportLabel: "NFL",
    commenceTime: "2026-09-30T00:20:00.000Z",
    homeTeam: "Home",
    awayTeam: "Away",
    marketBadge: "Moneyline",
    scopeLabel: "Away @ Home",
    candidatesEvaluated: 2,
    autoMatched: false,
    finePrintNote: null,
    claimHint: null,
    tieRisk: false,
    sameBook: false,
    promo: { bookKey: "draftkings", bookName: "DraftKings", selectionLabel: "Away", oddsAmerican: 150, oddsDerived: false },
    hedge: { bookKey: "fanduel", bookName: "FanDuel", selectionLabel: "Home", oddsAmerican: -140 },
    promoStake: "50.00",
    hedgeStake: "60.00",
    totalStaked: "110.00",
    promoPayout: "137.50",
    hedgePayout: "120.00",
    netIfPromoWins: "27.50",
    netIfHedgeWins: "10.00",
    guaranteedProfit: "12.34",
    rateLabel: "ROI",
    ratePct: "11.22",
    capNote: null,
    attribution: null,
    worstCase: true,
    hasPromoBook: true,
    ...over,
  };
}

const ctx = { now: NOW, precision: "cents" as const, oddsFetchedAt: { moneyline: ML, spreadsTotals: null } };

describe("buildDoneSnapshot", () => {
  it("hedge boost row: freezes row, terms, precision, fetchedAt and profit", () => {
    const row = makeRow();
    const { snapshot, profitExtracted } = buildDoneSnapshot({ kind: "hedge", terms, row }, ctx);
    expect(snapshot.kind).toBe("hedge");
    expect(snapshot.version).toBe(1);
    expect(snapshot.row).toEqual(row);
    expect(snapshot.promo.boostPercent).toBe("10.00");
    expect(snapshot.promo.maxStake).toBe("50.00");
    expect(snapshot.promo.winningsCap).toEqual({ kind: "extra_winnings", amount: "25.00" });
    expect(snapshot.promo.title).toBe("10% profit boost");
    expect(snapshot.precision).toBe("cents");
    expect(snapshot.oddsFetchedAt).toEqual({ moneyline: ML.toISOString(), spreadsTotals: null });
    expect(snapshot.recordedAt).toBe(NOW.toISOString());
    expect(profitExtracted).toBe("12.34");
  });

  it("bonus bet row keeps cents formatting", () => {
    const row = makeRow({ promoType: "bonus_bet", promoTypeLabel: "Bonus bet", rateLabel: "Conversion", guaranteedProfit: "7.10" });
    const { profitExtracted } = buildDoneSnapshot({ kind: "hedge", terms: { ...terms, promoType: "bonus_bet" }, row }, ctx);
    expect(profitExtracted).toBe("7.10");
  });

  it("no_hedge: null row, note kept, $0.00", () => {
    const row: UnprofitablePromoRowDTO = {
      rowKey: "unprofitable-promo-5",
      promoId: 5,
      promoType: "profit_boost",
      promoTypeLabel: "Boost",
      bookKey: "draftkings",
      bookName: "DraftKings",
      title: "10% profit boost",
      scopeLabel: "Away @ Home",
      autoMatched: false,
      bestGuaranteedProfit: "-0.65",
      note: "No profitable hedge right now (best: −$0.65)",
      hasPromoBook: true,
    };
    const { snapshot, profitExtracted } = buildDoneSnapshot({ kind: "no_hedge", terms, row }, ctx);
    expect(snapshot.kind).toBe("no_hedge");
    expect(snapshot.row).toBeNull();
    expect(snapshot.note).toBe("No profitable hedge right now (best: −$0.65)");
    expect(profitExtracted).toBe("0.00");
  });

  it("round-trips through JSON and the schema", () => {
    const { snapshot } = buildDoneSnapshot({ kind: "hedge", terms, row: makeRow() }, ctx);
    const parsed = DonePromoSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).toEqual(snapshot);
  });
});

describe("toDonePromoDTO", () => {
  const names = new Map([["draftkings", "DraftKings"]]);
  const completedAt = new Date("2026-09-29T16:00:00.000Z");
  const completion = {
    promoId: 5,
    completedAt,
    profitExtracted: "12.34",
    promoBookKey: "draftkings",
    promoType: "profit_boost",
    promoParsed: {},
  };

  it("hedge snapshot", () => {
    const { snapshot } = buildDoneSnapshot({ kind: "hedge", terms, row: makeRow() }, ctx);
    const dto = toDonePromoDTO({ ...completion, snapshot: JSON.parse(JSON.stringify(snapshot)) }, names);
    expect(dto.kind).toBe("hedge");
    expect(dto.row).not.toBeNull();
    expect(dto.profitExtracted).toBe("12.34");
    expect(dto.completedAt).toBe(completedAt.toISOString());
    expect(dto.title).toBe("10% profit boost");
  });

  it("no_hedge snapshot", () => {
    const row: UnprofitablePromoRowDTO = {
      rowKey: "x", promoId: 5, promoType: "profit_boost", promoTypeLabel: "Boost", bookKey: "draftkings",
      bookName: "DraftKings", title: "t", scopeLabel: "s", autoMatched: false, bestGuaranteedProfit: null,
      note: "No eligible bets right now", hasPromoBook: true,
    };
    const { snapshot } = buildDoneSnapshot({ kind: "no_hedge", terms, row }, ctx);
    const dto = toDonePromoDTO({ ...completion, profitExtracted: "0.00", snapshot: JSON.parse(JSON.stringify(snapshot)) }, names);
    expect(dto.kind).toBe("no_hedge");
    expect(dto.row).toBeNull();
    expect(dto.note).toBe("No eligible bets right now");
  });

  it("null snapshot is legacy with $0 regardless of column", () => {
    const dto = toDonePromoDTO({ ...completion, snapshot: null, promoParsed: { title: "Scraped title" } }, names);
    expect(dto.kind).toBe("legacy");
    expect(dto.note).toBe("Marked done before profit tracking");
    expect(dto.profitExtracted).toBe("0.00");
    expect(dto.title).toBe("Scraped title");
    expect(dto.bookName).toBe("DraftKings");
  });

  it("legacy title falls back to the promo terms, then to the id; unknown book keeps raw key", () => {
    const withTerms = toDonePromoDTO(
      { ...completion, snapshot: null, promoBoostPercent: "10.00", promoBoostedOddsAmerican: null, promoBonusAmount: null },
      names,
    );
    expect(withTerms.title).toBe("10% profit boost");
    const bare = toDonePromoDTO({ ...completion, snapshot: null, promoBookKey: "mystery" }, names);
    expect(bare.title).toBe("Promo #5");
    expect(bare.bookName).toBe("mystery");
  });

  it("unreadable snapshot is legacy with the column amount", () => {
    const dto = toDonePromoDTO({ ...completion, snapshot: { version: 99 } }, names);
    expect(dto.kind).toBe("legacy");
    expect(dto.note).toBe("Saved details unavailable");
    expect(dto.profitExtracted).toBe("12.34");
  });
});

describe("sumProfitExtracted", () => {
  it.each([
    [[], "0.00"],
    [["0.10", "0.20"], "0.30"],
    [["12.34", "0.00", "7.66"], "20.00"],
  ])("%j -> %s", (values, expected) => {
    expect(sumProfitExtracted(values.map((profitExtracted) => ({ profitExtracted })))).toBe(expected);
  });
});

describe("isSameDisplayedProfit", () => {
  it.each([
    ["12.34", "12.34", true],
    ["12.34", "12.35", false],
    ["12.30", "12.3", true],
    [null, null, true],
    [null, "1.00", false],
    ["1.00", null, false],
  ])("(%s, %s) -> %s", (a, b, expected) => {
    expect(isSameDisplayedProfit(a, b)).toBe(expected);
  });
});
