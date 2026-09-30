import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { enumerateScopeSelections, resolveSelection } from "./selection";
import type { PromoScope } from "./scope";

const NOW = new Date("2026-09-27T00:00:00Z");

function plusHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

/** NFL event with a 2-way h2h at two books, a half-point spread (home -3.5) and a half-point total (44.5). */
function fullEvent(overrides: Partial<OddsEvent> = {}): OddsEvent {
  return {
    id: "nfl-rams-broncos",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: plusHours(24),
    home_team: "DEN Broncos",
    away_team: "LA Rams",
    bookmakers: [
      {
        key: "fanduel",
        title: "FanDuel",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "LA Rams", price: 150 },
              { name: "DEN Broncos", price: -180 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "LA Rams", price: -110, point: 3.5 },
              { name: "DEN Broncos", price: -110, point: -3.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -105, point: 44.5 },
              { name: "Under", price: -115, point: 44.5 },
            ],
          },
        ],
      },
      {
        key: "betmgm",
        title: "BetMGM",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "LA Rams", price: 140 },
              { name: "DEN Broncos", price: -170 },
            ],
          },
          {
            key: "spreads",
            outcomes: [
              { name: "LA Rams", price: -105, point: 3.5 },
              { name: "DEN Broncos", price: -115, point: -3.5 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: -110, point: 44.5 },
              { name: "Under", price: -110, point: 44.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("resolveSelection", () => {
  it("moneyline home: promoSideQuotes = every book's home price, oppositeSideQuotes = away price", () => {
    const event = fullEvent();
    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "moneyline",
      line: null,
      side: "home",
    });

    expect(result).not.toBeNull();
    expect(result!.promoSideQuotes).toEqual(
      expect.arrayContaining([
        { bookKey: "fanduel", oddsAmerican: -180 },
        { bookKey: "betmgm", oddsAmerican: -170 },
      ]),
    );
    expect(result!.oppositeSideQuotes).toEqual(
      expect.arrayContaining([
        { bookKey: "fanduel", oddsAmerican: 150 },
        { bookKey: "betmgm", oddsAmerican: 140 },
      ]),
    );
    expect(result!.sideSelection).toBe("DEN Broncos");
    expect(result!.oppositeSelection).toBe("LA Rams");
  });

  it("h2h market with 3 outcomes at one book -> that book is skipped, other book's quotes survive", () => {
    const event = fullEvent();
    event.bookmakers[0].markets[0] = {
      key: "h2h",
      outcomes: [
        { name: "LA Rams", price: 150 },
        { name: "DEN Broncos", price: -180 },
        { name: "Draw", price: 900 },
      ],
    };

    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "moneyline",
      line: null,
      side: "home",
    });

    expect(result).not.toBeNull();
    expect(result!.promoSideQuotes).toEqual([{ bookKey: "betmgm", oddsAmerican: -170 }]);
    expect(result!.oppositeSideQuotes).toEqual([{ bookKey: "betmgm", oddsAmerican: 140 }]);
  });

  it("spread away 3.5 -> away outcomes at 3.5 vs home outcomes at -3.5", () => {
    const event = fullEvent();
    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "spread",
      line: 3.5,
      side: "away",
    });

    expect(result).not.toBeNull();
    expect(result!.sideSelection).toBe("LA Rams");
    expect(result!.sidePoint).toBe(3.5);
    expect(result!.oppositeSelection).toBe("DEN Broncos");
    expect(result!.oppositePoint).toBe(-3.5);
    expect(result!.promoSideQuotes).toEqual(
      expect.arrayContaining([
        { bookKey: "fanduel", oddsAmerican: -110 },
        { bookKey: "betmgm", oddsAmerican: -105 },
      ]),
    );
    expect(result!.oppositeSideQuotes).toEqual(
      expect.arrayContaining([
        { bookKey: "fanduel", oddsAmerican: -110 },
        { bookKey: "betmgm", oddsAmerican: -115 },
      ]),
    );
  });

  it("total over 44.5 -> Over@44.5 vs Under@44.5", () => {
    const event = fullEvent();
    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "total",
      line: 44.5,
      side: "over",
    });

    expect(result).not.toBeNull();
    expect(result!.sideSelection).toBe("Over");
    expect(result!.oppositeSelection).toBe("Under");
    expect(result!.sidePoint).toBe(44.5);
    expect(result!.oppositePoint).toBe(44.5);
    expect(result!.promoSideQuotes).toEqual(
      expect.arrayContaining([
        { bookKey: "fanduel", oddsAmerican: -105 },
        { bookKey: "betmgm", oddsAmerican: -110 },
      ]),
    );
  });

  it("whole-number spread line -> null (CALC-05)", () => {
    const event = fullEvent();
    event.bookmakers[0].markets[1] = {
      key: "spreads",
      outcomes: [
        { name: "LA Rams", price: -110, point: 3 },
        { name: "DEN Broncos", price: -110, point: -3 },
      ],
    };
    event.bookmakers[1].markets[1] = {
      key: "spreads",
      outcomes: [
        { name: "LA Rams", price: -105, point: 3 },
        { name: "DEN Broncos", price: -115, point: -3 },
      ],
    };

    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "spread",
      line: 3,
      side: "away",
    });

    expect(result).toBeNull();
  });

  it("whole-number total line -> null (CALC-05)", () => {
    const event = fullEvent();
    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "total",
      line: 45,
      side: "over",
    });

    expect(result).toBeNull();
  });

  it("unknown eventId -> null", () => {
    const event = fullEvent();
    const result = resolveSelection([event], {
      eventId: "does-not-exist",
      marketType: "moneyline",
      line: null,
      side: "home",
    });
    expect(result).toBeNull();
  });

  it("no quotes on either side -> null", () => {
    const event = fullEvent({
      bookmakers: [
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [],
        },
      ],
    });
    const result = resolveSelection([event], {
      eventId: event.id,
      marketType: "moneyline",
      line: null,
      side: "home",
    });
    expect(result).toBeNull();
  });
});

describe("enumerateScopeSelections", () => {
  it("event scope with 2-way h2h, spreads and total -> exactly 6 selections, each equal to resolveSelection", () => {
    const event = fullEvent();
    const scope: PromoScope = { kind: "event", eventId: event.id, sportKey: event.sport_key };

    const results = enumerateScopeSelections(
      { moneyline: [event], extended: [event] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline", "spread", "total"] },
    );

    expect(results).toHaveLength(6);

    const expectedSelections = [
      { marketType: "moneyline" as const, line: null, side: "home" as const },
      { marketType: "moneyline" as const, line: null, side: "away" as const },
      { marketType: "spread" as const, line: -3.5, side: "home" as const },
      { marketType: "spread" as const, line: 3.5, side: "away" as const },
      { marketType: "total" as const, line: 44.5, side: "over" as const },
      { marketType: "total" as const, line: 44.5, side: "under" as const },
    ];

    for (const sel of expectedSelections) {
      const expected = resolveSelection([event], { eventId: event.id, ...sel });
      const actual = results.find(
        (r) => r.marketType === sel.marketType && r.line === sel.line && r.side === sel.side,
      );
      expect(actual).toEqual(expected);
    }
  });

  it("whole-number spread/total points in the cache produce no selections", () => {
    const event = fullEvent();
    for (const bm of event.bookmakers) {
      bm.markets = bm.markets.map((m) => {
        if (m.key === "spreads") {
          return {
            key: "spreads",
            outcomes: m.outcomes.map((o) => ({ ...o, point: o.point! > 0 ? 3 : -3 })),
          };
        }
        if (m.key === "totals") {
          return { key: "totals", outcomes: m.outcomes.map((o) => ({ ...o, point: 45 })) };
        }
        return m;
      });
    }

    const scope: PromoScope = { kind: "event", eventId: event.id, sportKey: event.sport_key };
    const results = enumerateScopeSelections(
      { moneyline: [event], extended: [event] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline", "spread", "total"] },
    );

    expect(results).toHaveLength(2); // moneyline only
    expect(results.every((r) => r.marketType === "moneyline")).toBe(true);
  });

  it("eligibleMarketTypes ['moneyline'] -> only the 2 moneyline selections", () => {
    const event = fullEvent();
    const scope: PromoScope = { kind: "event", eventId: event.id, sportKey: event.sport_key };

    const results = enumerateScopeSelections(
      { moneyline: [event], extended: [event] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline"] },
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.marketType === "moneyline")).toBe(true);
  });

  it("sport_window scope: excludes an NFL event outside the window and an NCAAF event inside it", () => {
    const inWindowNfl = fullEvent({ id: "nfl-in-window", commence_time: plusHours(6) });
    const outOfWindowNfl = fullEvent({ id: "nfl-out-of-window", commence_time: plusHours(72) });
    const inWindowNcaaf = fullEvent({
      id: "ncaaf-in-window",
      sport_key: "americanfootball_ncaaf",
      commence_time: plusHours(6),
    });

    const scope: PromoScope = {
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: new Date(plusHours(0)),
      windowEnd: new Date(plusHours(24)),
    };

    const results = enumerateScopeSelections(
      { moneyline: [inWindowNfl, outOfWindowNfl, inWindowNcaaf], extended: [inWindowNfl, outOfWindowNfl, inWindowNcaaf] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline"] },
    );

    expect(results.every((r) => r.eventId === "nfl-in-window")).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("events with commence <= now are excluded", () => {
    const pastEvent = fullEvent({ id: "past-event", commence_time: new Date(NOW.getTime() - 1000).toISOString() });
    const scope: PromoScope = { kind: "event", eventId: pastEvent.id, sportKey: pastEvent.sport_key };

    const results = enumerateScopeSelections(
      { moneyline: [pastEvent], extended: [pastEvent] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline"] },
    );

    expect(results).toHaveLength(0);
  });

  it("moneyline selections fall back to the extended cache when the event is absent from the moneyline cache", () => {
    const event = fullEvent();
    const scope: PromoScope = { kind: "event", eventId: event.id, sportKey: event.sport_key };

    const results = enumerateScopeSelections(
      { moneyline: [], extended: [event] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline"] },
    );

    expect(results).toHaveLength(2);
  });

  it("output is ordered by commence asc, eventId, market, line asc, side", () => {
    const event = fullEvent();
    const scope: PromoScope = { kind: "event", eventId: event.id, sportKey: event.sport_key };

    const results = enumerateScopeSelections(
      { moneyline: [event], extended: [event] },
      scope,
      { now: NOW, eligibleMarketTypes: ["moneyline", "spread", "total"] },
    );

    const orderKey = (r: (typeof results)[number]) =>
      `${r.marketType}:${r.line}:${r.side}`;
    expect(results.map(orderKey)).toEqual([
      "moneyline:null:home",
      "moneyline:null:away",
      "spread:-3.5:home",
      "spread:3.5:away",
      "total:44.5:over",
      "total:44.5:under",
    ]);
  });
});

describe("resolveSelection -- alternate spreads fallback (260930-gam)", () => {
  function altEvent(): OddsEvent {
    return {
      id: "alt-evt",
      sport_key: "americanfootball_nfl",
      commence_time: plusHours(24),
      home_team: "DEN Broncos",
      away_team: "LA Rams",
      bookmakers: [
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "DEN Broncos", price: -110, point: -7.5 },
                { name: "LA Rams", price: -110, point: 7.5 },
              ],
            },
            {
              key: "alternate_spreads",
              outcomes: [
                { name: "DEN Broncos", price: 110, point: -6.5 },
                { name: "LA Rams", price: -130, point: 6.5 },
                { name: "LA Rams", price: -150, point: 5.5 },
                { name: "LA Rams", price: -105, point: 7.5 },
                { name: "DEN Broncos", price: 130, point: -5.5 },
              ],
            },
          ],
        },
        {
          key: "betmgm",
          title: "BetMGM",
          markets: [
            {
              key: "alternate_spreads",
              outcomes: [
                { name: "DEN Broncos", price: 115, point: -6.5 },
                { name: "LA Rams", price: -140, point: 6.5 },
              ],
            },
          ],
        },
      ],
    };
  }

  it("home -6.5 pinned reads the exact alt line and only the exact +6.5 opposite", () => {
    const r = resolveSelection([altEvent()], { eventId: "alt-evt", marketType: "spread", line: -6.5, side: "home" });
    expect(r).not.toBeNull();
    expect(r!.promoSideQuotes).toEqual([
      { bookKey: "fanduel", oddsAmerican: 110 },
      { bookKey: "betmgm", oddsAmerican: 115 },
    ]);
    expect(r!.oppositeSideQuotes).toEqual([
      { bookKey: "fanduel", oddsAmerican: -130 },
      { bookKey: "betmgm", oddsAmerican: -140 },
    ]);
  });

  it("away +6.5 pinned -> promo {away,+6.5}, opposite {home,-6.5}", () => {
    const r = resolveSelection([altEvent()], { eventId: "alt-evt", marketType: "spread", line: 6.5, side: "away" });
    expect(r!.promoSideQuotes).toEqual([
      { bookKey: "fanduel", oddsAmerican: -130 },
      { bookKey: "betmgm", oddsAmerican: -140 },
    ]);
    expect(r!.oppositeSideQuotes).toEqual([
      { bookKey: "fanduel", oddsAmerican: 110 },
      { bookKey: "betmgm", oddsAmerican: 115 },
    ]);
  });

  it("a book with a main-line quote uses it and ignores its alt market", () => {
    const r = resolveSelection([altEvent()], { eventId: "alt-evt", marketType: "spread", line: -7.5, side: "home" });
    expect(r!.promoSideQuotes).toEqual([{ bookKey: "fanduel", oddsAmerican: -110 }]);
    expect(r!.oppositeSideQuotes).toEqual([{ bookKey: "fanduel", oddsAmerican: -110 }]);
  });

  it("alt points never enter unpinned enumeration", () => {
    const out = enumerateScopeSelections(
      { moneyline: [], extended: [altEvent()] },
      { kind: "event", eventId: "alt-evt", sportKey: "americanfootball_nfl" },
      { now: NOW, eligibleMarketTypes: ["spread"] },
    );
    expect(out.map((s) => `${s.line}:${s.side}`).sort()).toEqual(["-7.5:home", "7.5:away"]);
  });
});
