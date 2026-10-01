import { describe, expect, it } from "vitest";
import type { RankablePromo } from "./rankPromoHedges";
import { applyMemberCaps, resolveEffectiveMaxStake, SetPromoCapInputSchema, stripMemberCaps } from "./yourCap";
import { capNoteFor, toPromoRowDTO, toUnprofitablePromoRowDTO, type PresentablePromo } from "./promoRowDto";
import type { PromoOpportunity, UnprofitablePromo } from "./rankPromoHedges";
import Decimal from "decimal.js";

function promo(overrides: Partial<RankablePromo>): RankablePromo {
  return {
    id: 1,
    bookKey: "draftkings",
    promoType: "profit_boost",
    scope: { kind: "any" },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "25.00",
    winningsCap: null,
    minOddsAmerican: null,
    ...overrides,
  };
}

describe("resolveEffectiveMaxStake", () => {
  it("uses the override when set, else the promo cap", () => {
    expect(resolveEffectiveMaxStake("25.00", null)).toBe("25.00");
    expect(resolveEffectiveMaxStake("25.00", "20.00")).toBe("20.00");
    expect(resolveEffectiveMaxStake("25.00", "30.00")).toBe("30.00");
    expect(resolveEffectiveMaxStake(null, null)).toBeNull();
  });
});

describe("applyMemberCaps / stripMemberCaps", () => {
  const list = [
    promo({ id: 20, maxStake: "25.00" }),
    promo({ id: 21, maxStake: "50.00" }),
    promo({ id: 22, promoType: "bonus_bet", maxStake: null, bonusAmount: "10.00" }),
  ];

  it("overrides only boosts that have a cap row and never mutates the input", () => {
    const snapshot = JSON.stringify(list);
    const out = applyMemberCaps(list, new Map([[20, "20.00"], [22, "5.00"]]));
    expect(out[0]).toMatchObject({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00" });
    expect(out[1]).toMatchObject({ maxStake: "50.00", promoMaxStake: "50.00", capOverride: null });
    expect(out[2]).toMatchObject({ maxStake: null, capOverride: null });
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it("a cleared override (empty map) goes back to each promo's own cap", () => {
    for (const p of applyMemberCaps(list, new Map())) {
      expect(p.maxStake).toBe(p.promoMaxStake);
      expect(p.capOverride).toBeNull();
    }
  });

  it("is per-member: member A's cap does not affect member B's result", () => {
    const a = applyMemberCaps(list, new Map([[20, "20.00"]]));
    const b = applyMemberCaps(list, new Map());
    expect(a[0].maxStake).toBe("20.00");
    expect(b[0].maxStake).toBe("25.00");
  });

  it("stripMemberCaps restores the promo's own cap and passes through un-annotated promos", () => {
    const stripped = stripMemberCaps(applyMemberCaps(list, new Map([[20, "20.00"]])));
    expect(stripped[0].maxStake).toBe("25.00");
    const plain = promo({ id: 5, maxStake: "9.00" });
    expect(stripMemberCaps([plain])[0]).toBe(plain);
  });
});

describe("SetPromoCapInputSchema", () => {
  it.each([
    { promoId: 20, maxStake: "20" },
    { promoId: 20, maxStake: "20.5" },
    { promoId: 20, maxStake: "10000.00" },
    { promoId: 20, maxStake: null },
  ])("accepts %j", (input) => {
    expect(SetPromoCapInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { promoId: 20, maxStake: "0" },
    { promoId: 20, maxStake: "0.00" },
    { promoId: 20, maxStake: "-5" },
    { promoId: 20, maxStake: "20.555" },
    { promoId: 20, maxStake: "1e3" },
    { promoId: 20, maxStake: "abc" },
    { promoId: 20, maxStake: "" },
    { promoId: 20, maxStake: " 20" },
    { promoId: 20, maxStake: "10000.01" },
    { promoId: 20, maxStake: 20 },
    { promoId: 20 },
    { promoId: 20, maxStake: "20", userId: 1 },
    { promoId: 0, maxStake: "20" },
    { promoId: "20", maxStake: "20" },
    { promoId: 1.5, maxStake: "20" },
  ])("rejects %j", (input) => {
    expect(SetPromoCapInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("cap note and row DTO cap info", () => {
  const names = new Map([["draftkings", "DraftKings"]]);
  const boost = (extra: Partial<PresentablePromo> = {}): PresentablePromo => ({
    ...promo({ id: 20 }),
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any game",
    autoMatched: false,
    attribution: [],
    ...extra,
  });

  it("names the member's cap and the book's cap when an override is set", () => {
    const note = capNoteFor(boost({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00" }), "max_stake", names);
    expect(note).toContain("your $20.00 max stake");
    expect(note).toContain("$25.00");
  });

  it("is unchanged without an override", () => {
    expect(capNoteFor(boost(), "max_stake", names)).toBe(
      "Capped at DraftKings's $25.00 max stake — a smaller stake keeps guaranteed profit equal on both sides.",
    );
  });

  it("unprofitable row DTO carries yourCap for boosts only", () => {
    const entry = (p: PresentablePromo): UnprofitablePromo<PresentablePromo> =>
      ({ promo: p, bestGuaranteedProfit: new Decimal("-0.65"), candidatesEvaluated: 1 }) as UnprofitablePromo<PresentablePromo>;
    const withOverride = toUnprofitablePromoRowDTO(
      entry(boost({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00" })),
      names,
      new Set(),
    );
    expect(withOverride.yourCap).toEqual({ promoCap: "25.00", override: "20.00" });
    const noOverride = toUnprofitablePromoRowDTO(entry(boost({ promoMaxStake: "25.00", capOverride: null })), names, new Set());
    expect(noOverride.yourCap).toEqual({ promoCap: "25.00", override: null });
    const bonus = toUnprofitablePromoRowDTO(
      entry(boost({ promoType: "bonus_bet", promoMaxStake: "25.00" })),
      names,
      new Set(),
    );
    expect(bonus.yourCap).toBeUndefined();
  });

  it("profitable boost row DTO carries yourCap", () => {
    const p = boost({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00" });
    const opportunity = {
      promo: p,
      selection: {
        sportKey: "americanfootball_nfl",
        commenceTime: new Date("2026-10-04T17:00:00Z"),
        homeTeam: "H",
        awayTeam: "A",
        marketType: "moneyline",
        line: null,
        sideSelection: "H",
        sidePoint: null,
        oppositeSelection: "A",
        oppositePoint: null,
        tieRisk: false,
      },
      promoOddsAmerican: 180,
      promoOddsDerived: true,
      hedge: { bookKey: "betmgm", oddsAmerican: 115 },
      sameBook: false,
      candidatesEvaluated: 1,
      result: {
        kind: "boost",
        boost: {
          promoStake: new Decimal(20),
          hedgeStake: new Decimal(25),
          totalStaked: new Decimal(45),
          promoPayout: new Decimal(56),
          hedgePayout: new Decimal(53.75),
          netIfPromoWins: new Decimal(11),
          netIfHedgeWins: new Decimal(8.75),
          guaranteedProfit: new Decimal(8.75),
          roiPct: new Decimal(19.4),
          capBound: "max_stake",
        },
      },
    } as unknown as PromoOpportunity<PresentablePromo>;
    const dto = toPromoRowDTO(opportunity, names, new Set());
    expect(dto.yourCap).toEqual({ promoCap: "25.00", override: "20.00" });
    expect(dto.capNote).toContain("your $20.00 max stake");
  });
});
