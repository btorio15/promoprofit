import { afterEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { rankPromoHedges, type RankablePromo, type RankOptions } from "./rankPromoHedges";
import type { ResolvedSelection } from "./selection";
import type { PromoScope } from "./scope";
import {
  findPairCandidates,
  marketKeyOf,
  selectPairs,
  singleProfitMap,
  type PairCandidate,
} from "./pairPromos";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function moneylineEvent(opts: {
  id: string;
  commenceTime?: string;
  quotes: { bookKey: string; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  return {
    id: opts.id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: opts.commenceTime ?? plusHours(24),
    home_team: "Home Team",
    away_team: "Away Team",
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Home Team", price: q.homePrice },
            { name: "Away Team", price: q.awayPrice },
          ],
        },
      ],
    })),
  };
}

function spreadEvent(opts: {
  id: string;
  quotes: { bookKey: string; homePoint: number; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  return {
    id: opts.id,
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: plusHours(24),
    home_team: "Home Team",
    away_team: "Away Team",
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home Team", price: q.homePrice, point: q.homePoint },
            { name: "Away Team", price: q.awayPrice, point: -q.homePoint },
          ],
        },
      ],
    })),
  };
}

function eventScope(eventId: string): PromoScope {
  return { kind: "event", eventId, sportKey: "americanfootball_nfl" };
}

const windowScope: PromoScope = {
  kind: "sport_window",
  sportKey: "americanfootball_nfl",
  windowStart: NOW,
  windowEnd: new Date(plusHours(72)),
};

function boostPromo(overrides: Partial<RankablePromo> & { id: number; bookKey: string }): RankablePromo {
  return {
    promoType: "profit_boost",
    scope: eventScope("e1"),
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "50",
    winningsCap: null,
    minOddsAmerican: null,
    ...overrides,
  };
}

function bonusPromo(overrides: Partial<RankablePromo> & { id: number; bookKey: string }): RankablePromo {
  return {
    promoType: "bonus_bet",
    scope: eventScope("e1"),
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "50",
    maxStake: null,
    winningsCap: null,
    minOddsAmerican: null,
    ...overrides,
  };
}

const baseEvent = moneylineEvent({
  id: "e1",
  quotes: [
    { bookKey: "draftkings", homePrice: 150, awayPrice: -180 },
    { bookKey: "fanduel", homePrice: -170, awayPrice: 140 },
  ],
});

function optsFor(
  events: OddsEvent[],
  members: string[] = ["draftkings", "fanduel", "betmgm"],
  extended: OddsEvent[] = [],
): RankOptions & { memberBookKeys: ReadonlySet<string> } {
  return {
    moneylineEvents: events,
    extendedEvents: extended,
    hedgeBookKeys: new Set(members),
    precision: "cents",
    now: NOW,
    memberBookKeys: new Set(members),
  };
}

const NO_SINGLES: ReadonlyMap<number, Decimal> = new Map();

afterEach(() => {
  vi.restoreAllMocks();
});

function selectionStub(partial: Partial<ResolvedSelection>): ResolvedSelection {
  return {
    eventId: "e1",
    sportKey: "americanfootball_nfl",
    commenceTime: new Date(plusHours(24)),
    homeTeam: "Home Team",
    awayTeam: "Away Team",
    tieRisk: false,
    marketType: "moneyline",
    line: null,
    side: "home",
    sideSelection: "Home Team",
    sidePoint: null,
    oppositeSelection: "Away Team",
    oppositePoint: null,
    promoSideQuotes: [],
    oppositeSideQuotes: [],
    ...partial,
  };
}

describe("marketKeyOf", () => {
  it("moneyline is one key for both sides", () => {
    expect(marketKeyOf(selectionStub({ side: "home" }))).toBe("e1|moneyline|ml");
    expect(marketKeyOf(selectionStub({ side: "away" }))).toBe("e1|moneyline|ml");
  });

  it("spread keys on the HOME team's signed point: home -3.5 and away +3.5 share a key", () => {
    const home = marketKeyOf(selectionStub({ marketType: "spread", side: "home", line: -3.5 }));
    const away = marketKeyOf(selectionStub({ marketType: "spread", side: "away", line: 3.5 }));
    expect(home).toBe(away);
    expect(home).toBe("e1|spread|-3.5");
    const other = marketKeyOf(selectionStub({ marketType: "spread", side: "away", line: 2.5 }));
    expect(other).not.toBe(home);
  });

  it("total keys on the total line for over and under", () => {
    const over = marketKeyOf(selectionStub({ marketType: "total", side: "over", line: 45.5 }));
    const under = marketKeyOf(selectionStub({ marketType: "total", side: "under", line: 45.5 }));
    expect(over).toBe(under);
    expect(over).toBe("e1|total|45.5");
  });
});

describe("singleProfitMap", () => {
  it("maps promo id to its single guaranteed profit", () => {
    const promo = boostPromo({ id: 1, bookKey: "draftkings" });
    const opts = optsFor([baseEvent]);
    const opps = rankPromoHedges([promo], opts);
    expect(opps).toHaveLength(1);
    const map = singleProfitMap(opps);
    const expected = opps[0].result.kind === "boost" ? opps[0].result.boost.guaranteedProfit : new Decimal(0);
    expect(map.get(1)?.equals(expected)).toBe(true);
  });
});

describe("findPairCandidates: discovery rules", () => {
  it("boost at DraftKings + boost at FanDuel on opposite sides -> one boost_boost candidate", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings" });
    const b = boostPromo({ id: 2, bookKey: "fanduel" });
    const found = findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    const c = found[0];
    expect(c.kind).toBe("boost_boost");
    expect(c.promoA.id).toBe(1);
    expect(c.promoB.id).toBe(2);
    expect(c.selectionA.side).not.toBe(c.selectionB.side);
    expect(c.marketKey).toBe("e1|moneyline|ml");
    expect(c.result.guaranteedProfit.gt(0)).toBe(true);
    expect(c.gain.equals(c.result.guaranteedProfit)).toBe(true);
  });

  it("boost_boost promoA is the lower id regardless of input order", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings" });
    const b = boostPromo({ id: 2, bookKey: "fanduel" });
    const found = findPairCandidates([b, a], NO_SINGLES, optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    expect(found[0].promoA.id).toBe(1);
  });

  it("boost + bonus bet at two member books -> boost_bonus with promoA = the boost", () => {
    const boost = boostPromo({ id: 9, bookKey: "draftkings" });
    const bonus = bonusPromo({ id: 3, bookKey: "fanduel" });
    const found = findPairCandidates([bonus, boost], NO_SINGLES, optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("boost_bonus");
    expect(found[0].promoA.id).toBe(9);
    expect(found[0].promoB.id).toBe(3);
  });

  it("bonus + bonus is never a pair (D-09)", () => {
    const a = bonusPromo({ id: 1, bookKey: "draftkings" });
    const b = bonusPromo({ id: 2, bookKey: "fanduel" });
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))).toEqual([]);
  });

  it("two promos at the same book never pair", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings" });
    const b = boostPromo({ id: 2, bookKey: "draftkings" });
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))).toEqual([]);
  });

  it("a promo at a book the member does not have is excluded (D-18)", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings" });
    const b = boostPromo({ id: 2, bookKey: "fanduel" });
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent], ["draftkings", "betmgm"]))).toEqual([]);
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent], ["fanduel", "betmgm"]))).toEqual([]);
  });

  it("same side on both promos (both pinned home) -> no candidate", () => {
    const pin = { eventId: "e1", marketType: "moneyline" as const, line: null, side: "home" as const };
    const a = boostPromo({ id: 1, bookKey: "draftkings", pinned: pin, boostedOddsAmerican: 300, baseOddsAmerican: 150 });
    const b = boostPromo({ id: 2, bookKey: "fanduel", pinned: pin, boostedOddsAmerican: 300, baseOddsAmerican: -170 });
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))).toEqual([]);
  });

  it("opposite pinned sides on the same moneyline pair up", () => {
    const a = boostPromo({
      id: 1,
      bookKey: "draftkings",
      pinned: { eventId: "e1", marketType: "moneyline", line: null, side: "home" },
      boostedOddsAmerican: 300,
      baseOddsAmerican: 150,
    });
    const b = boostPromo({
      id: 2,
      bookKey: "fanduel",
      pinned: { eventId: "e1", marketType: "moneyline", line: null, side: "away" },
      boostedOddsAmerican: 250,
      baseOddsAmerican: 140,
    });
    const found = findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    expect(found[0].oddsAAmerican).toBe(300);
    expect(found[0].oddsBAmerican).toBe(250);
  });

  it("spread: home -3.5 with away +3.5 pairs; home -3.5 with away +2.5 does not", () => {
    const ext = spreadEvent({
      id: "s1",
      quotes: [
        { bookKey: "draftkings", homePoint: -3.5, homePrice: -110, awayPrice: -110 },
        { bookKey: "fanduel", homePoint: -2.5, homePrice: -110, awayPrice: -110 },
      ],
    });
    const spreadScope: PromoScope = { kind: "event", eventId: "s1", sportKey: "americanfootball_nfl" };
    const mk = (id: number, bookKey: string, line: number, side: "home" | "away", boosted: number) =>
      boostPromo({
        id,
        bookKey,
        scope: spreadScope,
        eligibleMarketTypes: ["spread"],
        pinned: { eventId: "s1", marketType: "spread", line, side },
        boostedOddsAmerican: boosted,
        baseOddsAmerican: -110,
      });

    const opts = optsFor([], ["draftkings", "fanduel"], [ext]);

    const mismatched = findPairCandidates([mk(1, "draftkings", -3.5, "home", 200), mk(2, "fanduel", 2.5, "away", 250)], NO_SINGLES, opts);
    expect(mismatched).toEqual([]);

    const ext2 = spreadEvent({
      id: "s1",
      quotes: [
        { bookKey: "draftkings", homePoint: -3.5, homePrice: -110, awayPrice: -110 },
        { bookKey: "fanduel", homePoint: -3.5, homePrice: -110, awayPrice: -110 },
      ],
    });
    const matched = findPairCandidates(
      [mk(1, "draftkings", -3.5, "home", 200), mk(2, "fanduel", 3.5, "away", 250)],
      NO_SINGLES,
      optsFor([], ["draftkings", "fanduel"], [ext2]),
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].marketKey).toBe("s1|spread|-3.5");
  });

  it("unpinned promo without a live own-book quote is not a leg option", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings" });
    const b = boostPromo({ id: 2, bookKey: "betmgm" }); // betmgm has no quote in baseEvent
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))).toEqual([]);
  });

  it("base min-odds rule: a leg whose base quote is below the minimum is skipped", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings", minOddsAmerican: 400 });
    const b = boostPromo({ id: 2, bookKey: "fanduel" });
    expect(findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))).toEqual([]);
  });

  it("a RangeError from a bad boost leg is skipped with console.warn, not a crash", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = boostPromo({ id: 1, bookKey: "draftkings", boostPercent: "0" });
    const good = boostPromo({ id: 2, bookKey: "fanduel" });
    const found = findPairCandidates([bad, good], NO_SINGLES, optsFor([baseEvent]));
    expect(found).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe("findPairCandidates: D-08 gate", () => {
  const a = boostPromo({ id: 1, bookKey: "draftkings" });
  const b = boostPromo({ id: 2, bookKey: "fanduel" });
  const pairProfit = findPairCandidates([a, b], NO_SINGLES, optsFor([baseEvent]))[0].result.guaranteedProfit;

  it("keeps the pair when it beats the separate hedges, with gain = pair - singleA - singleB", () => {
    const singleA = pairProfit.dividedBy(4);
    const singleB = pairProfit.dividedBy(4);
    const singles = new Map<number, Decimal>([
      [1, singleA],
      [2, singleB],
    ]);
    const found = findPairCandidates([a, b], singles, optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    expect(found[0].gain.equals(pairProfit.minus(singleA).minus(singleB))).toBe(true);
    expect(found[0].separateProfitA.equals(singleA)).toBe(true);
    expect(found[0].separateProfitB.equals(singleB)).toBe(true);
  });

  it("drops the pair when the singles sum is larger", () => {
    const singles = new Map<number, Decimal>([
      [1, pairProfit.times(2).dividedBy(3)],
      [2, pairProfit.dividedBy(2)],
    ]);
    expect(findPairCandidates([a, b], singles, optsFor([baseEvent]))).toEqual([]);
  });

  it("drops the pair on an exact tie (strict gate)", () => {
    const singles = new Map<number, Decimal>([
      [1, pairProfit.minus(1)],
      [2, new Decimal(1)],
    ]);
    expect(findPairCandidates([a, b], singles, optsFor([baseEvent]))).toEqual([]);
  });

  it("a promo with no profitable single counts as 0.00", () => {
    const found = findPairCandidates([a, b], new Map([[1, new Decimal(0)]]), optsFor([baseEvent]));
    expect(found).toHaveLength(1);
    expect(found[0].separateProfitB.equals(0)).toBe(true);
  });
});

describe("findPairCandidates: best market per pair", () => {
  const better = moneylineEvent({
    id: "e-better",
    quotes: [
      { bookKey: "draftkings", homePrice: 300, awayPrice: -400 },
      { bookKey: "fanduel", homePrice: -400, awayPrice: 300 },
    ],
  });
  const worse = moneylineEvent({
    id: "e-worse",
    quotes: [
      { bookKey: "draftkings", homePrice: 120, awayPrice: -150 },
      { bookKey: "fanduel", homePrice: -150, awayPrice: 120 },
    ],
  });

  it("two eligible markets -> keeps the higher-profit one", () => {
    const a = boostPromo({ id: 1, bookKey: "draftkings", scope: windowScope });
    const b = boostPromo({ id: 2, bookKey: "fanduel", scope: windowScope });
    const found = findPairCandidates([a, b], NO_SINGLES, optsFor([worse, better]));
    expect(found).toHaveLength(1);
    expect(found[0].selectionA.eventId).toBe("e-better");
  });

  it("identical-profit markets tie-break deterministically (eventId asc) regardless of input order", () => {
    const one = moneylineEvent({ id: "e-a", quotes: better.bookmakers.map((bk) => ({ bookKey: bk.key, homePrice: bk.key === "draftkings" ? 300 : -400, awayPrice: bk.key === "draftkings" ? -400 : 300 })) });
    const two = moneylineEvent({ id: "e-b", quotes: one.bookmakers.map((bk) => ({ bookKey: bk.key, homePrice: bk.key === "draftkings" ? 300 : -400, awayPrice: bk.key === "draftkings" ? -400 : 300 })) });
    const a = boostPromo({ id: 1, bookKey: "draftkings", scope: windowScope });
    const b = boostPromo({ id: 2, bookKey: "fanduel", scope: windowScope });
    const first = findPairCandidates([a, b], NO_SINGLES, optsFor([one, two]));
    const second = findPairCandidates([b, a], NO_SINGLES, optsFor([two, one]));
    expect(first[0].selectionA.eventId).toBe("e-a");
    expect(second[0].selectionA.eventId).toBe("e-a");
    expect(second[0].result.guaranteedProfit.equals(first[0].result.guaranteedProfit)).toBe(true);
  });
});

interface StubPair {
  a: number;
  b: number;
  gain: string;
}

function stubCandidate(s: StubPair): PairCandidate<RankablePromo> {
  const gain = new Decimal(s.gain);
  return {
    promoA: { id: s.a } as RankablePromo,
    promoB: { id: s.b } as RankablePromo,
    kind: "boost_boost",
    selectionA: selectionStub({}),
    selectionB: selectionStub({}),
    marketKey: "e1|moneyline|ml",
    oddsAAmerican: 100,
    oddsBAmerican: 100,
    result: { guaranteedProfit: gain } as PairCandidate<RankablePromo>["result"],
    separateProfitA: new Decimal(0),
    separateProfitB: new Decimal(0),
    gain,
  };
}

function idPairs(chosen: PairCandidate<RankablePromo>[]): string[] {
  return chosen.map((c) => `${Math.min(c.promoA.id, c.promoB.id)}-${Math.max(c.promoA.id, c.promoB.id)}`).sort();
}

function assertConflictFree(chosen: PairCandidate<RankablePromo>[]): void {
  const ids = chosen.flatMap((c) => [c.promoA.id, c.promoB.id]);
  expect(new Set(ids).size).toBe(ids.length);
}

describe("selectPairs: exact non-conflicting choice (D-10)", () => {
  it("V12: gains AB=10, BC=9, AD=9 -> chooses {BC, AD} (18), not greedy AB", () => {
    // A=1, B=2, C=3, D=4
    const chosen = selectPairs([
      stubCandidate({ a: 1, b: 2, gain: "10" }),
      stubCandidate({ a: 2, b: 3, gain: "9" }),
      stubCandidate({ a: 1, b: 4, gain: "9" }),
    ]);
    expect(idPairs(chosen)).toEqual(["1-4", "2-3"]);
    assertConflictFree(chosen);
  });

  it("ties: equal total gain -> fewer pairs wins", () => {
    // {1-2}=10 vs {3-4 + 5-6}... make a component: 1-2 (10), 2-3 (5), 1-4 (5): {2-3,1-4}=10 with two pairs vs {1-2}=10 with one.
    const chosen = selectPairs([
      stubCandidate({ a: 1, b: 2, gain: "10" }),
      stubCandidate({ a: 2, b: 3, gain: "5" }),
      stubCandidate({ a: 1, b: 4, gain: "5" }),
    ]);
    expect(idPairs(chosen)).toEqual(["1-2"]);
  });

  it("ties: same total and pair count -> lexicographically smaller sorted pair-id list", () => {
    // path 1-2, 2-3, 3-4 with gains 5, 10, 5: {2-3}=10 vs {1-2,3-4}=10 (2 pairs) -> fewer pairs {2-3}
    // to force equal counts: square 1-2,3-4 vs 1-3,2-4 all 5 each.
    const chosen = selectPairs([
      stubCandidate({ a: 1, b: 3, gain: "5" }),
      stubCandidate({ a: 2, b: 4, gain: "5" }),
      stubCandidate({ a: 1, b: 2, gain: "5" }),
      stubCandidate({ a: 3, b: 4, gain: "5" }),
    ]);
    expect(idPairs(chosen)).toEqual(["1-2", "3-4"]);
  });

  it("is deterministic across input order permutations", () => {
    const base: StubPair[] = [
      { a: 1, b: 2, gain: "7" },
      { a: 2, b: 3, gain: "7" },
      { a: 3, b: 4, gain: "7" },
      { a: 4, b: 5, gain: "7" },
      { a: 1, b: 5, gain: "7" },
      { a: 6, b: 7, gain: "3" },
    ];
    const reference = idPairs(selectPairs(base.map(stubCandidate)));
    const permutations = [
      [...base].reverse(),
      [base[3], base[0], base[5], base[1], base[4], base[2]],
      [base[2], base[4], base[1], base[5], base[0], base[3]],
    ];
    for (const perm of permutations) {
      expect(idPairs(selectPairs(perm.map(stubCandidate)))).toEqual(reference);
    }
    expect(reference).toContain("6-7");
  });

  it("a component with more than 20 promos uses the greedy fallback and stays conflict-free", () => {
    // A path of 22 promos (21 edges) is one connected component of size 22.
    const stubs: StubPair[] = [];
    for (let i = 1; i <= 21; i++) stubs.push({ a: i, b: i + 1, gain: String(10 + (i % 3)) });
    const sizes: number[] = [];
    const chosen = selectPairs(stubs.map(stubCandidate), { onFallback: (n) => sizes.push(n) });
    expect(sizes).toEqual([22]);
    assertConflictFree(chosen);
    expect(chosen.length).toBeGreaterThan(0);
  });

  it("a component of exactly 20 promos is solved exactly (no fallback)", () => {
    const stubs: StubPair[] = [];
    for (let i = 1; i <= 19; i++) stubs.push({ a: i, b: i + 1, gain: "1" });
    const sizes: number[] = [];
    const chosen = selectPairs(stubs.map(stubCandidate), { onFallback: (n) => sizes.push(n) });
    expect(sizes).toEqual([]);
    expect(chosen).toHaveLength(10);
    assertConflictFree(chosen);
  });

  it("never emits a promo id twice and sorts by profit desc", () => {
    const chosen = selectPairs([
      stubCandidate({ a: 1, b: 2, gain: "4" }),
      stubCandidate({ a: 3, b: 4, gain: "9" }),
      stubCandidate({ a: 2, b: 3, gain: "8" }),
    ]);
    assertConflictFree(chosen);
    expect(chosen.map((c) => c.result.guaranteedProfit.toString())).toEqual(["9", "4"]);
  });

  it("empty input -> empty output", () => {
    expect(selectPairs([])).toEqual([]);
  });
});
