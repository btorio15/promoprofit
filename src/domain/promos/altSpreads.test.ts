import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import {
  ALT_SPREAD_EVENT_LIMIT,
  buildAltSpreadRequests,
  countUnmatchedAltOutcomes,
  mergeAltSpreads,
  selectAltSpreadTargets,
  type AltSpreadPin,
  type AltSpreadRequests,
  type AltSpreadPromoInput,
} from "./altSpreads";

const NOW = new Date("2026-09-30T00:00:00Z");

function hours(h: number): string {
  return new Date(NOW.getTime() + h * 3600_000).toISOString();
}

function evt(id: string, commenceHours: number, mainHome = -7.5, books = ["fanduel", "betmgm"]): OddsEvent {
  return {
    id,
    sport_key: "americanfootball_nfl",
    commence_time: hours(commenceHours),
    home_team: "Home",
    away_team: "Away",
    bookmakers: books.map((key) => ({
      key,
      title: key,
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home", price: -110, point: mainHome },
            { name: "Away", price: -110, point: -mainHome },
          ],
        },
      ],
    })),
  };
}

const reqs = (pins: AltSpreadPin[], scopedEventIds: string[] = []): AltSpreadRequests => ({ pins, scopedEventIds });
const pin = (eventId: string, line: number, side: "home" | "away" = "home"): AltSpreadPin => ({ eventId, line, side });

describe("selectAltSpreadTargets", () => {
  it("returns a target for a non-main pinned line and dedupes per event", () => {
    const r = selectAltSpreadTargets(reqs([pin("a", -6.5), pin("a", -5.5)]), [evt("a", 5)], NOW);
    expect(r.targets).toEqual([{ sportKey: "americanfootball_nfl", eventId: "a", commenceTime: hours(5) }]);
    expect(r.skippedOverLimit).toBe(0);
  });

  it("skips events whose main line already covers every pin at every book", () => {
    const r = selectAltSpreadTargets(reqs([pin("a", -7.5)]), [evt("a", 5, -7.5)], NOW);
    expect(r.targets).toEqual([]);
    const r2 = selectAltSpreadTargets(reqs([pin("a", 7.5, "away")]), [evt("a", 5, -7.5)], NOW);
    expect(r2.targets).toEqual([]);
  });

  it("excludes whole-number lines, unknown events and started events", () => {
    const r = selectAltSpreadTargets(
      reqs([pin("a", -6), pin("missing", -6.5), pin("old", -6.5)]),
      [evt("a", 5), evt("old", -1)],
      NOW,
    );
    expect(r.targets).toEqual([]);
  });

  it("sorts by commence asc, caps at 5 and reports the rest as skipped", () => {
    const ids = ["g", "f", "e", "d", "c", "b", "a"];
    const events = ids.map((id, i) => evt(id, 10 + i)); // g soonest
    const r = selectAltSpreadTargets(
      reqs(ids.map((id) => pin(id, -6.5))),
      events,
      NOW,
    );
    expect(ALT_SPREAD_EVENT_LIMIT).toBe(5);
    expect(r.targets.map((t) => t.eventId)).toEqual(["g", "f", "e", "d", "c"]);
    expect(r.skippedOverLimit).toBe(2);
  });
});

describe("selectAltSpreadTargets with scoped event ids (260930-gyl)", () => {
  it("targets a scoped event even when the main line covers every book", () => {
    const r = selectAltSpreadTargets(reqs([], ["a"]), [evt("a", 5)], NOW);
    expect(r.targets.map((t) => t.eventId)).toEqual(["a"]);
  });

  it("a covered pin is still skipped unless the same event is also scoped; event appears once", () => {
    expect(selectAltSpreadTargets(reqs([pin("a", -7.5)]), [evt("a", 5, -7.5)], NOW).targets).toEqual([]);
    const r = selectAltSpreadTargets(reqs([pin("a", -6.5)], ["a"]), [evt("a", 5)], NOW);
    expect(r.targets.map((t) => t.eventId)).toEqual(["a"]);
  });

  it("excludes absent and started scoped events; caps at 5 counting both kinds, sorted by commence", () => {
    const ids = ["g", "f", "e", "d", "c", "b", "a"];
    const events = [...ids.map((id, i) => evt(id, 10 + i)), evt("old", -1)];
    const r = selectAltSpreadTargets(reqs([pin("a", -6.5), pin("b", -6.5)], ["g", "f", "e", "c", "missing", "old"]), events, NOW);
    expect(r.targets.map((t) => t.eventId)).toEqual(["g", "f", "e", "c", "b"]);
    expect(r.skippedOverLimit).toBe(1);
  });
});

describe("selectAltSpreadTargets shared cap with league-wide picks (260930-hor)", () => {
  it("7 distinct scoped ids plus a duplicate -> 5 soonest targets, skipped 2", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const events = ids.map((id, i) => evt(id, 10 + i));
    const r = selectAltSpreadTargets(reqs([], ["g", "f", "e", "d", "c", "b", "a", "c"]), events, NOW);
    expect(r.targets.map((t) => t.eventId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.skippedOverLimit).toBe(2);
  });
});

describe("buildAltSpreadRequests", () => {
  const promo = (over: Partial<AltSpreadPromoInput> = {}): AltSpreadPromoInput => ({
    promoType: "profit_boost",
    scope: { kind: "event", eventId: "a", sportKey: "americanfootball_nfl" },
    pinned: null,
    eligibleMarketTypes: ["moneyline", "spread"],
    maxStake: "25",
    ...over,
  });

  it("scopes unpinned single-game spread-eligible boosts and bonus bets, deduped", () => {
    const r = buildAltSpreadRequests([
      promo(),
      promo({ promoType: "bonus_bet", maxStake: null }),
      promo({ scope: { kind: "event", eventId: "b", sportKey: "americanfootball_nfl" } }),
    ]);
    expect(r).toEqual({ pins: [], scopedEventIds: ["a", "b"] });
  });

  it("excludes boost without max stake, non-spread, sport_window and any scopes (A1)", () => {
    const r = buildAltSpreadRequests([
      promo({ maxStake: null }),
      promo({ eligibleMarketTypes: ["moneyline", "total"] }),
      promo({
        scope: { kind: "sport_window", sportKey: "americanfootball_nfl", windowStart: NOW, windowEnd: NOW },
      }),
      promo({ scope: { kind: "any" } }),
    ]);
    expect(r).toEqual({ pins: [], scopedEventIds: [] });
  });

  it("pinned spread becomes a pin; pinned moneyline yields nothing", () => {
    const r = buildAltSpreadRequests([
      promo({ pinned: { eventId: "a", marketType: "spread", line: -6.5, side: "home" } }),
      promo({ pinned: { eventId: "a", marketType: "moneyline", line: null, side: "home" } }),
    ]);
    expect(r).toEqual({ pins: [{ eventId: "a", line: -6.5, side: "home" }], scopedEventIds: [] });
  });
});

describe("mergeAltSpreads", () => {
  const alt = (books: string[]): OddsEvent => ({
    ...evt("a", 5),
    bookmakers: books.map((key) => ({
      key,
      title: key,
      markets: [{ key: "alternate_spreads", outcomes: [{ name: "Home", price: 120, point: -6.5 }] }],
    })),
  });

  it("merges into existing bookmakers, creates missing ones, filters disallowed, and does not mutate", () => {
    const base = evt("a", 5, -7.5, ["fanduel"]);
    const snapshot = JSON.stringify(base);
    const merged = mergeAltSpreads(base, alt(["fanduel", "betmgm", "pinnacle"]), ["fanduel", "betmgm"]);

    expect(JSON.stringify(base)).toBe(snapshot);
    expect(merged).not.toBe(base);
    expect(merged.bookmakers.map((b) => b.key)).toEqual(["fanduel", "betmgm"]);
    expect(merged.bookmakers[0].markets.map((m) => m.key)).toEqual(["spreads", "alternate_spreads"]);
    expect(merged.bookmakers[1].markets.map((m) => m.key)).toEqual(["alternate_spreads"]);
  });

  it("replaces an existing alternate_spreads market", () => {
    const once = mergeAltSpreads(evt("a", 5, -7.5, ["fanduel"]), alt(["fanduel"]), ["fanduel"]);
    const twice = mergeAltSpreads(once, alt(["fanduel"]), ["fanduel"]);
    expect(twice.bookmakers[0].markets.filter((m) => m.key === "alternate_spreads")).toHaveLength(1);
  });
});

describe("countUnmatchedAltOutcomes", () => {
  it("counts alt outcomes whose name matches neither team", () => {
    const e: OddsEvent = {
      ...evt("a", 5),
      bookmakers: [
        {
          key: "fanduel",
          title: "fanduel",
          markets: [
            {
              key: "alternate_spreads",
              outcomes: [
                { name: "Home", price: 120, point: -6.5 },
                { name: "Some Other Name", price: 120, point: 6.5 },
              ],
            },
          ],
        },
      ],
    };
    expect(countUnmatchedAltOutcomes(e)).toBe(1);
  });
});
