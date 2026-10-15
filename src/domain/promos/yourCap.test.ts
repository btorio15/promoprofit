import { describe, expect, it } from "vitest";
import type { RankablePromo } from "./rankPromoHedges";
import {
  applyMemberCaps,
  DEFAULT_MAX_STAKE,
  resolveEffectiveMaxStake,
  SetBookCapInputSchema,
  SetPromoCapInputSchema,
  stripMemberCaps,
} from "./yourCap";
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
  const r = (promoCap: string | null, promoOverride: string | null, bookCap: string | null) =>
    resolveEffectiveMaxStake({ promoCap, promoOverride, bookCap });

  it("defaults to $25 and never raises above the book's own cap", () => {
    expect(DEFAULT_MAX_STAKE).toBe("25.00");
    expect(r("50.00", null, null)).toEqual({ maxStake: "25.00", source: "default" });
    expect(r("10.00", null, null)).toEqual({ maxStake: "10.00", source: "book_page" });
    expect(r(null, null, null)).toEqual({ maxStake: "25.00", source: "default" });
  });

  it("uses the per-book cap, bounded by the promo's own cap", () => {
    expect(r("50.00", null, "40.00")).toEqual({ maxStake: "40.00", source: "your_book_cap" });
    expect(r("30.00", null, "40.00")).toEqual({ maxStake: "30.00", source: "book_page" });
    expect(r(null, null, "15.00")).toEqual({ maxStake: "15.00", source: "your_book_cap" });
  });

  it("a tie goes to the book's cap and outputs are normalized", () => {
    expect(r("25.00", null, null)).toEqual({ maxStake: "25.00", source: "book_page" });
    expect(r("25", null, null).maxStake).toBe("25.00");
  });

  it("the per-promo override wins outright, even above the book cap", () => {
    expect(r("50.00", "60.00", "10.00")).toEqual({ maxStake: "60.00", source: "your_promo_cap" });
    expect(r("50.00", "20", null)).toEqual({ maxStake: "20.00", source: "your_promo_cap" });
  });
});

describe("applyMemberCaps / stripMemberCaps", () => {
  const list = [
    promo({ id: 20, maxStake: "25.00" }),
    promo({ id: 21, maxStake: "50.00" }),
    promo({ id: 22, promoType: "bonus_bet", maxStake: null, bonusAmount: "10.00" }),
    promo({ id: 23, bookKey: "fanduel", maxStake: "100.00" }),
    promo({ id: 24, maxStake: null }),
  ];
  const none = new Map<string, string>();

  it("overrides only boosts that have a cap row and never mutates the input", () => {
    const snapshot = JSON.stringify(list);
    const out = applyMemberCaps(list, new Map([[20, "20.00"], [22, "5.00"]]), none);
    expect(out[0]).toMatchObject({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00", capSource: "your_promo_cap" });
    expect(out[1]).toMatchObject({ maxStake: "25.00", promoMaxStake: "50.00", capOverride: null, capSource: "default" });
    expect(out[2]).toMatchObject({ maxStake: null, capOverride: null, capSource: null });
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it("applies the per-book cap to that book's boosts and $25 to the rest", () => {
    const out = applyMemberCaps(list, new Map(), new Map([["fanduel", "40.00"]]));
    expect(out[3]).toMatchObject({ maxStake: "40.00", capSource: "your_book_cap", fallbackCap: "40.00", fallbackSource: "your_book_cap" });
    expect(out[1].maxStake).toBe("25.00");
  });

  it("an unknown-cap boost is evaluated at $25 instead of skipped", () => {
    const out = applyMemberCaps(list, new Map(), none);
    expect(out[4]).toMatchObject({ maxStake: "25.00", promoMaxStake: null, capSource: "default" });
  });

  it("a cleared override (empty map) goes back to min(promo cap, $25)", () => {
    const out = applyMemberCaps(list, new Map(), none);
    expect(out[0].maxStake).toBe("25.00");
    expect(out[0].capOverride).toBeNull();
    expect(out[0].fallbackCap).toBe("25.00");
  });

  it("is per-member: member A's caps do not affect member B's result", () => {
    const a = applyMemberCaps(list, new Map([[20, "20.00"]]), new Map([["draftkings", "30.00"]]));
    const b = applyMemberCaps(list, new Map(), none);
    expect(a[0].maxStake).toBe("20.00");
    expect(a[1].maxStake).toBe("30.00");
    expect(b[0].maxStake).toBe("25.00");
    expect(b[1].maxStake).toBe("25.00");
  });

  it("stripMemberCaps restores the promo's own cap (including null) and passes through un-annotated promos", () => {
    const stripped = stripMemberCaps(applyMemberCaps(list, new Map([[20, "20.00"]]), none));
    expect(stripped[0].maxStake).toBe("25.00");
    expect(stripped[4].maxStake).toBeNull();
    const plain = promo({ id: 5, maxStake: "9.00" });
    expect(stripMemberCaps([plain])[0]).toBe(plain);
  });
});

describe("SetBookCapInputSchema", () => {
  it.each([
    { bookKey: "fanduel", maxStake: "40" },
    { bookKey: "fanduel", maxStake: null },
  ])("accepts %j", (input) => {
    expect(SetBookCapInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { bookKey: "fanduel", maxStake: "0" },
    { bookKey: "fanduel", maxStake: "-5" },
    { bookKey: "fanduel", maxStake: "10000.01" },
    { bookKey: "fanduel", maxStake: "abc" },
    { bookKey: "", maxStake: "40" },
    { bookKey: "fanduel", maxStake: "40", userId: 1 },
    { maxStake: "40" },
  ])("rejects %j", (input) => {
    expect(SetBookCapInputSchema.safeParse(input).success).toBe(false);
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

  it("describes the source of each non-override cap", () => {
    expect(capNoteFor(boost({ maxStake: "40.00", promoMaxStake: "50.00", capSource: "your_book_cap" }), "max_stake", names)).toContain(
      "your $40.00 max bet for DraftKings (set in Settings)",
    );
    expect(capNoteFor(boost({ maxStake: "25.00", promoMaxStake: "50.00", capSource: "default" }), "max_stake", names)).toContain(
      "the $25.00 default max bet (change it per book in Settings)",
    );
    expect(capNoteFor(boost({ maxStake: "20.00", promoMaxStake: null, capOverride: "20.00", capSource: "your_promo_cap" }), "max_stake", names)).not.toContain(
      "page says",
    );
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
      entry(boost({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00", fallbackCap: "25.00", fallbackSource: "book_page" })),
      names,
      new Set(),
    );
    expect(withOverride.yourCap).toEqual({ promoCap: "25.00", override: "20.00", fallbackCap: "25.00", fallbackSource: "book_page" });
    const noOverride = toUnprofitablePromoRowDTO(entry(boost({ promoMaxStake: "25.00", capOverride: null, fallbackCap: "25.00", fallbackSource: "book_page" })), names, new Set());
    expect(noOverride.yourCap).toEqual({ promoCap: "25.00", override: null, fallbackCap: "25.00", fallbackSource: "book_page" });
    const bonus = toUnprofitablePromoRowDTO(
      entry(boost({ promoType: "bonus_bet", promoMaxStake: "25.00" })),
      names,
      new Set(),
    );
    expect(bonus.yourCap).toBeUndefined();
  });

  it("profitable boost row DTO carries yourCap", () => {
    const p = boost({ maxStake: "20.00", promoMaxStake: "25.00", capOverride: "20.00", fallbackCap: "25.00", fallbackSource: "book_page" });
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
    expect(dto.yourCap).toEqual({ promoCap: "25.00", override: "20.00", fallbackCap: "25.00", fallbackSource: "book_page" });
    expect(dto.capNote).toContain("your $20.00 max stake");
  });
});
