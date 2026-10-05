import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { PairCandidate } from "./pairPromos";
import type { PromoOpportunity, RankablePromo } from "./rankPromoHedges";
import { buildMemberObservationEntries } from "./memberObservationEntries";

const DATE = "2026-09-27";

function promo(id: number, bookKey: string): RankablePromo {
  return { id, bookKey } as RankablePromo;
}

function single(id: number, bookKey: string, profit: string, kind: "boost" | "bonus" = "boost"): PromoOpportunity {
  const g = new Decimal(profit);
  return {
    promo: promo(id, bookKey),
    result: kind === "boost" ? { kind, boost: { guaranteedProfit: g } } : { kind, bonus: { guaranteedProfit: g } },
  } as unknown as PromoOpportunity;
}

function pair(a: number, b: number, sepA: string, pairProfit: string): PairCandidate {
  return {
    promoA: promo(a, `book${a}`),
    promoB: promo(b, `book${b}`),
    separateProfitA: new Decimal(sepA),
    separateProfitB: new Decimal(0),
    result: { guaranteedProfit: new Decimal(pairProfit) },
    gain: new Decimal(pairProfit),
  } as unknown as PairCandidate;
}

const ALL = new Set(["dk", "fd", "book3", "book8", "book1", "book2"]);

describe("buildMemberObservationEntries", () => {
  it("records a member-book single rounded to cents with no partner", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [single(1, "dk", "4.256")],
      chosenPairs: [],
      userBookSet: ALL,
    });
    expect(out).toEqual([{ promoId: 1, bookKey: "dk", denverDate: DATE, profit: "4.26", partnerPromoId: null }]);
  });

  it("reads bonus-bet profit too", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [single(1, "dk", "10", "bonus")],
      chosenPairs: [],
      userBookSet: ALL,
    });
    expect(out[0].profit).toBe("10.00");
  });

  it("skips singles at books the member does not have", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [single(1, "betmgm", "5")],
      chosenPairs: [],
      userBookSet: ALL,
    });
    expect(out).toEqual([]);
  });

  it("skips zero and negative singles", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [single(1, "dk", "0"), single(2, "fd", "-1.5")],
      chosenPairs: [],
      userBookSet: ALL,
    });
    expect(out).toEqual([]);
  });

  it("splits a pair into two shares summing exactly to the pair profit (7.35)", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [],
      chosenPairs: [pair(3, 8, "2.10", "7.35")],
      userBookSet: ALL,
    });
    expect(out).toEqual([
      { promoId: 3, bookKey: "book3", denverDate: DATE, profit: "2.10", partnerPromoId: 8 },
      { promoId: 8, bookKey: "book8", denverDate: DATE, profit: "5.25", partnerPromoId: 3 },
    ]);
    const sum = out.reduce((s, e) => s.plus(e.profit), new Decimal(0));
    expect(sum.toFixed(2)).toBe("7.35");
  });

  it("rounding case: sepA 2.105, pair 7.349 -> 2.11 + 5.24 = 7.35", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [],
      chosenPairs: [pair(3, 8, "2.105", "7.349")],
      userBookSet: ALL,
    });
    expect(out.map((e) => e.profit)).toEqual(["2.11", "5.24"]);
    expect(out.reduce((s, e) => s.plus(e.profit), new Decimal(0)).toFixed(2)).toBe("7.35");
  });

  it("pair replaces the two singles (no duplicates)", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [single(3, "book3", "2.10"), single(8, "book8", "1.00"), single(9, "dk", "3")],
      chosenPairs: [pair(3, 8, "2.10", "7.35")],
      userBookSet: ALL,
    });
    const ids = out.map((e) => e.promoId);
    expect(ids).toEqual([3, 8, 9]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(out.find((e) => e.promoId === 9)?.partnerPromoId).toBeNull();
  });

  it("pair with zero separateProfitA emits only B with the whole pair profit", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [],
      chosenPairs: [pair(3, 8, "0", "7.35")],
      userBookSet: ALL,
    });
    expect(out).toEqual([{ promoId: 8, bookKey: "book8", denverDate: DATE, profit: "7.35", partnerPromoId: 3 }]);
  });

  it("clamps shareA to the pair profit", () => {
    const out = buildMemberObservationEntries({
      denverDate: DATE,
      singles: [],
      chosenPairs: [pair(3, 8, "9", "7.35")],
      userBookSet: ALL,
    });
    expect(out).toEqual([{ promoId: 3, bookKey: "book3", denverDate: DATE, profit: "7.35", partnerPromoId: 8 }]);
  });
});
