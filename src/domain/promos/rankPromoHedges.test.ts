import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { calculateProfitBoostHedge } from "@/domain/hedge/profitBoost";
import { findUnprofitablePromos, rankPromoHedges, type RankablePromo } from "./rankPromoHedges";
import type { PromoScope } from "./scope";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function moneylineEvent(opts: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime?: string;
  sportKey?: string;
  quotes: { bookKey: string; homePrice: number; awayPrice: number }[];
}): OddsEvent {
  return {
    id: opts.id,
    sport_key: opts.sportKey ?? "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: opts.commenceTime ?? plusHours(24),
    home_team: opts.homeTeam,
    away_team: opts.awayTeam,
    bookmakers: opts.quotes.map((q) => ({
      key: q.bookKey,
      title: q.bookKey,
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: opts.homeTeam, price: q.homePrice },
            { name: opts.awayTeam, price: q.awayPrice },
          ],
        },
      ],
    })),
  };
}

function eventScope(eventId: string, sportKey = "americanfootball_nfl"): PromoScope {
  return { kind: "event", eventId, sportKey };
}

const defaultPromo: RankablePromo = {
  id: 1,
  bookKey: "ballybet",
  promoType: "profit_boost",
  scope: eventScope("nfl-pinned"),
  pinned: null,
  eligibleMarketTypes: ["moneyline"],
  boostPercent: null,
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "50",
  winningsCap: null,
  minOddsAmerican: null,
};

describe("rankPromoHedges", () => {
  it("pinned boost with published price: reproduces Plan 02 fixture B1 at cents, candidatesEvaluated 1", () => {
    const event = moneylineEvent({
      id: "nfl-pinned",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      quotes: [
        { bookKey: "fanduel", homePrice: -275, awayPrice: 220 },
        { bookKey: "betmgm", homePrice: -300, awayPrice: 250 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      pinned: { eventId: "nfl-pinned", marketType: "moneyline", line: null, side: "away" },
      boostedOddsAmerican: 300,
      maxStake: "50",
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel", "betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.candidatesEvaluated).toBe(1);
    expect(opportunity.hedge).toEqual({ bookKey: "fanduel", oddsAmerican: -275 });
    expect(opportunity.result.kind).toBe("boost");
    if (opportunity.result.kind === "boost") {
      const b = opportunity.result.boost;
      expect(b.hedgeStake.toFixed(2)).toBe("146.66");
      expect(b.guaranteedProfit.toFixed(2)).toBe("3.33");
      expect(b.promoStake.toFixed(2)).toBe("50.00");
    }
  });

  it("unpinned boost: picks the argmax-profit candidate across a sport_window scope with two events", () => {
    const eventA = moneylineEvent({
      id: "nfl-a",
      homeTeam: "Team H1",
      awayTeam: "Team A1",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: 200, awayPrice: -250 },
        { bookKey: "fanduel", homePrice: 190, awayPrice: -240 },
      ],
    });
    const eventB = moneylineEvent({
      id: "nfl-b",
      homeTeam: "Team H2",
      awayTeam: "Team A2",
      commenceTime: plusHours(12),
      quotes: [
        { bookKey: "draftkings", homePrice: 300, awayPrice: -400 },
        { bookKey: "fanduel", homePrice: 280, awayPrice: -380 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: { kind: "sport_window", sportKey: "americanfootball_nfl", windowStart: NOW, windowEnd: new Date(plusHours(48)) },
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
    };

    const opts = {
      moneylineEvents: [eventA, eventB],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents" as const,
      now: NOW,
    };

    const [opportunity] = rankPromoHedges([promo], opts);
    expect(opportunity).toBeDefined();

    // Compute every candidate's expected result directly via the engine
    // (both sides of both events, since draftkings quotes both home and
    // away on each event) and assert the ranker picked the argmax.
    const candidateResults = [
      calculateProfitBoostHedge({
        boostedOddsAmerican: null,
        baseOddsAmerican: 200, // event A home (draftkings)
        boostPercent: new Decimal(50),
        hedgeOddsAmerican: -240, // fanduel away
        maxStake: new Decimal(25),
        winningsCap: null,
        minOddsAmerican: null,
        precision: "cents",
      }),
      calculateProfitBoostHedge({
        boostedOddsAmerican: null,
        baseOddsAmerican: -250, // event A away (draftkings)
        boostPercent: new Decimal(50),
        hedgeOddsAmerican: 190, // fanduel home
        maxStake: new Decimal(25),
        winningsCap: null,
        minOddsAmerican: null,
        precision: "cents",
      }),
      calculateProfitBoostHedge({
        boostedOddsAmerican: null,
        baseOddsAmerican: 300, // event B home (draftkings)
        boostPercent: new Decimal(50),
        hedgeOddsAmerican: -380, // fanduel away
        maxStake: new Decimal(25),
        winningsCap: null,
        minOddsAmerican: null,
        precision: "cents",
      }),
      calculateProfitBoostHedge({
        boostedOddsAmerican: null,
        baseOddsAmerican: -400, // event B away (draftkings)
        boostPercent: new Decimal(50),
        hedgeOddsAmerican: 280, // fanduel home
        maxStake: new Decimal(25),
        winningsCap: null,
        minOddsAmerican: null,
        precision: "cents",
      }),
    ];

    const nonNullResults = candidateResults.filter((r) => r !== null);
    const expectedBest = nonNullResults.reduce((best, r) =>
      r.guaranteedProfit.gt(best.guaranteedProfit) ? r : best,
    );

    expect(opportunity.result.kind).toBe("boost");
    if (opportunity.result.kind === "boost") {
      expect(opportunity.result.boost.guaranteedProfit.toFixed(2)).toBe(expectedBest.guaranteedProfit.toFixed(2));
    }
    expect(opportunity.candidatesEvaluated).toBe(nonNullResults.length);
  });

  it("tie on guaranteedProfit and roiPct -> earlier commence wins", () => {
    const eventEarly = moneylineEvent({
      id: "nfl-early",
      homeTeam: "Team H1",
      awayTeam: "Team A1",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "draftkings", homePrice: 200, awayPrice: -250 },
        { bookKey: "fanduel", homePrice: -240, awayPrice: 190 },
      ],
    });
    const eventLate = moneylineEvent({
      id: "nfl-late",
      homeTeam: "Team H1",
      awayTeam: "Team A1",
      commenceTime: plusHours(12),
      quotes: [
        { bookKey: "draftkings", homePrice: 200, awayPrice: -250 },
        { bookKey: "fanduel", homePrice: -240, awayPrice: 190 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: { kind: "sport_window", sportKey: "americanfootball_nfl", windowStart: NOW, windowEnd: new Date(plusHours(48)) },
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [eventEarly, eventLate],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.selection.eventId).toBe("nfl-early");
  });

  it("minOddsAmerican -200: promo-book quote -250 excluded even though boosted price would pass", () => {
    const event = moneylineEvent({
      id: "nfl-minodds-excl",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: -250, awayPrice: 210 },
        { bookKey: "fanduel", homePrice: 240, awayPrice: -200 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-minodds-excl"),
      pinned: { eventId: "nfl-minodds-excl", marketType: "moneyline", line: null, side: "home" },
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: -200,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(0);
  });

  it("WR-06: pinned boost with no live promo-book quote applies min odds to its published base price", () => {
    const event = moneylineEvent({
      id: "nfl-minodds-published",
      homeTeam: "Team H",
      awayTeam: "Team A",
      // No draftkings (promo book) quote at all -- only the hedge book.
      quotes: [{ bookKey: "fanduel", homePrice: 180, awayPrice: 200 }],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-minodds-published"),
      pinned: { eventId: "nfl-minodds-published", marketType: "moneyline", line: null, side: "home" },
      bookKey: "draftkings",
      baseOddsAmerican: -250,
      boostedOddsAmerican: -150,
      maxStake: "25",
      minOddsAmerican: -200,
    };
    const opts = {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents" as const,
      now: NOW,
    };

    // Control: without the min-odds rule the published boost IS profitable...
    expect(rankPromoHedges([{ ...promo, minOddsAmerican: null }], opts)).toHaveLength(1);
    // ...but its -250 base is below the -200 minimum, so it's excluded.
    expect(rankPromoHedges([promo], opts)).toHaveLength(0);
    // A published base at the minimum is allowed.
    expect(rankPromoHedges([{ ...promo, baseOddsAmerican: -200 }], opts)).toHaveLength(1);
  });

  it("minOddsAmerican -200: promo-book quote exactly -200 is allowed", () => {
    const event = moneylineEvent({
      id: "nfl-minodds-allow",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: -200, awayPrice: 210 },
        { bookKey: "fanduel", homePrice: 190, awayPrice: 170 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-minodds-allow"),
      pinned: { eventId: "nfl-minodds-allow", marketType: "moneyline", line: null, side: "home" },
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: -200,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(1);
  });

  it("minOddsAmerican +100: promo-book quote -110 excluded", () => {
    const event = moneylineEvent({
      id: "nfl-minodds-plus-excl",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: -110, awayPrice: 105 },
        { bookKey: "fanduel", homePrice: 120, awayPrice: -140 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-minodds-plus-excl"),
      pinned: { eventId: "nfl-minodds-plus-excl", marketType: "moneyline", line: null, side: "home" },
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: 100,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(0);
  });

  it("minOddsAmerican +100: promo-book quote exactly +100 is allowed", () => {
    const event = moneylineEvent({
      id: "nfl-minodds-plus-allow",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: 100, awayPrice: -120 },
        { bookKey: "fanduel", homePrice: 110, awayPrice: -130 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-minodds-plus-allow"),
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: 100,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(1);
  });

  it("unpinned boost: candidate with no promo-book quote is skipped (no base price to boost)", () => {
    const event = moneylineEvent({
      id: "nfl-no-own-quote",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [{ bookKey: "fanduel", homePrice: -200, awayPrice: 180 }],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-no-own-quote"),
      bookKey: "draftkings", // never quotes this event
      boostPercent: "50",
      maxStake: "25",
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(0);
  });

  it("derived price: boostPercent 50 with promo book quoting +200 -> promoOddsAmerican +300, derived true", () => {
    const event = moneylineEvent({
      id: "nfl-derived",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: 200, awayPrice: -250 },
        { bookKey: "fanduel", homePrice: 190, awayPrice: -240 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-derived"),
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: "25",
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.promoOddsAmerican).toBe(300);
    expect(opportunity.promoOddsDerived).toBe(true);
  });

  it("boost with maxStake null is never computed (D-18) -- promo skipped", () => {
    const event = moneylineEvent({
      id: "nfl-no-max-stake",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [
        { bookKey: "draftkings", homePrice: 200, awayPrice: -250 },
        { bookKey: "fanduel", homePrice: 190, awayPrice: -240 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      scope: eventScope("nfl-no-max-stake"),
      bookKey: "draftkings",
      boostPercent: "50",
      maxStake: null,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(0);
  });

  it("bonus_bet pinned 25.00 at +250 vs hedge -300, precision whole -> hedgeStake 47, profit 15.50", () => {
    const event = moneylineEvent({
      id: "nba-bonus-pinned",
      homeTeam: "Lakers",
      awayTeam: "Celtics",
      sportKey: "basketball_nba",
      quotes: [
        { bookKey: "fanduel", homePrice: 250, awayPrice: -350 },
        { bookKey: "betmgm", homePrice: 240, awayPrice: -300 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: eventScope("nba-bonus-pinned", "basketball_nba"),
      pinned: { eventId: "nba-bonus-pinned", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel", "betmgm"]),
      precision: "whole",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.hedge).toEqual({ bookKey: "betmgm", oddsAmerican: -300 });
    expect(opportunity.result.kind).toBe("bonus");
    if (opportunity.result.kind === "bonus") {
      expect(opportunity.result.bonus.hedgeStake.toFixed(0)).toBe("47");
      expect(opportunity.result.bonus.guaranteedProfit.toFixed(2)).toBe("15.50");
    }
  });

  it("unpinned bonus_bet picks the max-profit candidate the same way", () => {
    const eventA = moneylineEvent({
      id: "nba-bonus-a",
      homeTeam: "Team H1",
      awayTeam: "Team A1",
      sportKey: "basketball_nba",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "fanduel", homePrice: 150, awayPrice: -180 },
        { bookKey: "betmgm", homePrice: 140, awayPrice: -170 },
      ],
    });
    const eventB = moneylineEvent({
      id: "nba-bonus-b",
      homeTeam: "Team H2",
      awayTeam: "Team A2",
      sportKey: "basketball_nba",
      commenceTime: plusHours(12),
      quotes: [
        { bookKey: "fanduel", homePrice: 300, awayPrice: -400 },
        { bookKey: "betmgm", homePrice: 280, awayPrice: -380 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: { kind: "sport_window", sportKey: "basketball_nba", windowStart: NOW, windowEnd: new Date(plusHours(48)) },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [eventA, eventB],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    // Event B has much longer promo odds (+300) -> larger bonus payout -> higher profit.
    expect(opportunity.selection.eventId).toBe("nba-bonus-b");
  });

  it("bonus_bet with scope any searches every cached game across sports and picks the single best conversion (D-07/A2)", () => {
    const nba = moneylineEvent({
      id: "any-nba",
      homeTeam: "Lakers",
      awayTeam: "Celtics",
      sportKey: "basketball_nba",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "fanduel", homePrice: 150, awayPrice: -180 },
        { bookKey: "betmgm", homePrice: 140, awayPrice: -170 },
      ],
    });
    const nfl = moneylineEvent({
      id: "any-nfl",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      sportKey: "americanfootball_nfl",
      commenceTime: plusHours(30),
      quotes: [
        { bookKey: "fanduel", homePrice: 300, awayPrice: -400 },
        { bookKey: "betmgm", homePrice: 280, awayPrice: -380 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: { kind: "any" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [nba, nfl],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(1);
    const [opportunity] = opportunities;
    // Both sports were evaluated as candidates, and the longer +300 NFL price wins.
    expect(opportunity.candidatesEvaluated).toBeGreaterThanOrEqual(4);
    expect(opportunity.selection.eventId).toBe("any-nfl");
    expect(opportunity.result.kind).toBe("bonus");
    if (opportunity.result.kind === "bonus") {
      const { hedgeStake, guaranteedProfit } = opportunity.result.bonus;
      expect(hedgeStake.gt(0)).toBe(true);
      expect(guaranteedProfit.gt(0)).toBe(true);
    }
  });

  it("sameBook true when the promo's own book also has the best hedge price (D-04)", () => {
    const event = moneylineEvent({
      id: "nba-samebook",
      homeTeam: "Lakers",
      awayTeam: "Celtics",
      sportKey: "basketball_nba",
      quotes: [
        { bookKey: "fanduel", homePrice: 250, awayPrice: -110 },
        { bookKey: "betmgm", homePrice: 240, awayPrice: -150 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: eventScope("nba-samebook", "basketball_nba"),
      pinned: { eventId: "nba-samebook", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel", "betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.hedge.bookKey).toBe("fanduel");
    expect(opportunity.sameBook).toBe(true);
  });

  it("a book not in hedgeBookKeys is never chosen even when it has the best price", () => {
    const event = moneylineEvent({
      id: "nba-hedge-restricted",
      homeTeam: "Lakers",
      awayTeam: "Celtics",
      sportKey: "basketball_nba",
      quotes: [
        { bookKey: "fanduel", homePrice: 250, awayPrice: -110 }, // best price, not a hedge book
        { bookKey: "betmgm", homePrice: 240, awayPrice: -150 },
      ],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: eventScope("nba-hedge-restricted", "basketball_nba"),
      pinned: { eventId: "nba-hedge-restricted", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const [opportunity] = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunity).toBeDefined();
    expect(opportunity.hedge.bookKey).toBe("betmgm");
  });

  it("no allowed opposite quote for any candidate -> promo skipped", () => {
    const event = moneylineEvent({
      id: "nba-no-hedge",
      homeTeam: "Lakers",
      awayTeam: "Celtics",
      sportKey: "basketball_nba",
      quotes: [{ bookKey: "fanduel", homePrice: 250, awayPrice: -110 }],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      promoType: "bonus_bet",
      scope: eventScope("nba-no-hedge", "basketball_nba"),
      pinned: { eventId: "nba-no-hedge", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const opportunities = rankPromoHedges([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]), // no quote from betmgm on this event
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(0);
  });

  it("output: one opportunity per promo, sorted by guaranteedProfit desc, then commence asc, then promo id asc", () => {
    const smallProfitEvent = moneylineEvent({
      id: "nba-small",
      homeTeam: "Team H1",
      awayTeam: "Team A1",
      sportKey: "basketball_nba",
      commenceTime: plusHours(6),
      quotes: [
        { bookKey: "fanduel", homePrice: 110, awayPrice: -115 },
        { bookKey: "betmgm", homePrice: 105, awayPrice: -110 },
      ],
    });
    const bigProfitEvent = moneylineEvent({
      id: "nba-big",
      homeTeam: "Team H2",
      awayTeam: "Team A2",
      sportKey: "basketball_nba",
      commenceTime: plusHours(12),
      quotes: [
        { bookKey: "fanduel", homePrice: 400, awayPrice: -600 },
        { bookKey: "betmgm", homePrice: 380, awayPrice: -580 },
      ],
    });

    const promoSmall: RankablePromo = {
      ...defaultPromo,
      id: 1,
      promoType: "bonus_bet",
      scope: eventScope("nba-small", "basketball_nba"),
      pinned: { eventId: "nba-small", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };
    const promoBig: RankablePromo = {
      ...defaultPromo,
      id: 2,
      promoType: "bonus_bet",
      scope: eventScope("nba-big", "basketball_nba"),
      pinned: { eventId: "nba-big", marketType: "moneyline", line: null, side: "home" },
      bookKey: "fanduel",
      bonusAmount: "25.00",
      maxStake: null,
    };

    const opportunities = rankPromoHedges([promoSmall, promoBig], {
      moneylineEvents: [smallProfitEvent, bigProfitEvent],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "cents",
      now: NOW,
    });

    expect(opportunities).toHaveLength(2);
    expect(opportunities[0].promo.id).toBe(2); // bigger profit first
    expect(opportunities[1].promo.id).toBe(1);
  });
});

// quick-260927-edt: findUnprofitablePromos is purely informational -- it
// must never affect rankPromoHedges' own output, and its entries must
// never carry stakes/hedge fields (see UnprofitablePromo's shape).
describe("findUnprofitablePromos", () => {
  const workedExampleEvent = moneylineEvent({
    id: "nfl-worked",
    homeTeam: "Denver Broncos",
    awayTeam: "Los Angeles Rams",
    quotes: [
      { bookKey: "ballybet", homePrice: 107, awayPrice: -135 },
      { bookKey: "betmgm", homePrice: 105, awayPrice: -125 },
    ],
  });

  const workedExamplePromo: RankablePromo = {
    ...defaultPromo,
    id: 2,
    bookKey: "ballybet",
    promoType: "profit_boost",
    scope: eventScope("nfl-worked"),
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "10.00",
    maxStake: "20.00",
    minOddsAmerican: 100,
    winningsCap: null,
  };

  it("worked example, cents: rankPromoHedges returns [], findUnprofitablePromos returns one entry at exactly -0.65", () => {
    const opts = {
      moneylineEvents: [workedExampleEvent],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "cents" as const,
      now: NOW,
    };

    expect(rankPromoHedges([workedExamplePromo], opts)).toEqual([]);

    const [entry] = findUnprofitablePromos([workedExamplePromo], opts);
    expect(entry).toBeDefined();
    expect(entry.promo.id).toBe(workedExamplePromo.id);
    expect(entry.bestGuaranteedProfit?.equals(new Decimal("-0.65"))).toBe(true);
    expect(entry.candidatesEvaluated).toBe(1);
  });

  it("worked example, whole: bestGuaranteedProfit equals -0.80", () => {
    const opts = {
      moneylineEvents: [workedExampleEvent],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]),
      precision: "whole" as const,
      now: NOW,
    };

    const [entry] = findUnprofitablePromos([workedExamplePromo], opts);
    expect(entry.bestGuaranteedProfit?.equals(new Decimal("-0.80"))).toBe(true);
  });

  it("promo with no evaluable candidate (no hedge book quotes the opposite side) -> bestGuaranteedProfit null, candidatesEvaluated 0", () => {
    const noHedgeEvent = moneylineEvent({
      id: "nfl-no-hedge-unprofitable",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [{ bookKey: "ballybet", homePrice: 110, awayPrice: -140 }],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      id: 3,
      bookKey: "ballybet",
      promoType: "profit_boost",
      scope: eventScope("nfl-no-hedge-unprofitable"),
      pinned: null,
      eligibleMarketTypes: ["moneyline"],
      boostPercent: "10.00",
      maxStake: "20.00",
      minOddsAmerican: null,
      winningsCap: null,
    };

    const [entry] = findUnprofitablePromos([promo], {
      moneylineEvents: [noHedgeEvent],
      extendedEvents: [],
      hedgeBookKeys: new Set(["betmgm"]), // no quote from betmgm on this event
      precision: "cents",
      now: NOW,
    });

    expect(entry.bestGuaranteedProfit).toBeNull();
    expect(entry.candidatesEvaluated).toBe(0);
  });

  it("boost with maxStake null (D-18) -> entry with bestGuaranteedProfit null, candidatesEvaluated 0", () => {
    const event = moneylineEvent({
      id: "nfl-maxstake-null",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [{ bookKey: "ballybet", homePrice: 110, awayPrice: -140 }],
    });

    const promo: RankablePromo = {
      ...defaultPromo,
      id: 4,
      bookKey: "ballybet",
      promoType: "profit_boost",
      scope: eventScope("nfl-maxstake-null"),
      pinned: null,
      eligibleMarketTypes: ["moneyline"],
      boostPercent: "10.00",
      maxStake: null,
      minOddsAmerican: null,
      winningsCap: null,
    };

    const [entry] = findUnprofitablePromos([promo], {
      moneylineEvents: [event],
      extendedEvents: [],
      hedgeBookKeys: new Set(["ballybet"]),
      precision: "cents",
      now: NOW,
    });

    expect(entry.bestGuaranteedProfit).toBeNull();
    expect(entry.candidatesEvaluated).toBe(0);
  });

  it("a profitable promo is excluded; mixed [profitable, negative, null] returns only [negative, null] in that order (profit desc, nulls last, then promo id asc)", () => {
    const pinnedEvent = moneylineEvent({
      id: "nfl-pinned-mix",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      quotes: [
        { bookKey: "fanduel", homePrice: -275, awayPrice: 220 },
        { bookKey: "betmgm", homePrice: -300, awayPrice: 250 },
      ],
    });

    const noHedgeEvent = moneylineEvent({
      id: "nfl-no-hedge-mix",
      homeTeam: "Team H",
      awayTeam: "Team A",
      quotes: [{ bookKey: "ballybet", homePrice: 110, awayPrice: -140 }],
    });

    const profitablePromo: RankablePromo = {
      ...defaultPromo,
      id: 10,
      scope: eventScope("nfl-pinned-mix"),
      pinned: { eventId: "nfl-pinned-mix", marketType: "moneyline", line: null, side: "away" },
      boostedOddsAmerican: 300,
      maxStake: "50",
    };

    const negativePromo: RankablePromo = {
      ...workedExamplePromo,
      id: 20,
    };

    const nullPromo: RankablePromo = {
      ...defaultPromo,
      id: 30,
      bookKey: "ballybet",
      pinned: null,
      scope: eventScope("nfl-no-hedge-mix"),
      eligibleMarketTypes: ["moneyline"],
      boostPercent: "10.00",
      maxStake: "20.00",
      minOddsAmerican: null,
    };

    const opts = {
      moneylineEvents: [pinnedEvent, workedExampleEvent, noHedgeEvent],
      extendedEvents: [],
      hedgeBookKeys: new Set(["fanduel", "betmgm"]),
      precision: "cents" as const,
      now: NOW,
    };

    const opportunities = rankPromoHedges([profitablePromo, negativePromo, nullPromo], opts);
    expect(opportunities.map((o) => o.promo.id)).toEqual([10]);

    const unprofitable = findUnprofitablePromos([profitablePromo, negativePromo, nullPromo], opts);
    expect(unprofitable.map((e) => e.promo.id)).toEqual([20, 30]);
    expect(unprofitable[0].bestGuaranteedProfit?.equals(new Decimal("-0.65"))).toBe(true);
    expect(unprofitable[1].bestGuaranteedProfit).toBeNull();
  });
});
