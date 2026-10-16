import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("./client", () => ({ getDb: vi.fn() }));

import { activePromoWhere, mapActivePromoRow, promoVisibilityCondition } from "./promos";

const { promos } = schema;

function buildTestDb() {
  return drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });
}

const NOW = new Date("2026-10-01T12:00:00.000Z");

function compile(viewerUserId?: number) {
  const db = buildTestDb();
  return db.select({ id: promos.id }).from(promos).where(activePromoWhere(NOW, viewerUserId)).toSQL();
}

describe("activePromoWhere visibility (D-01)", () => {
  it("no viewer: only scraped promos, no user id bound", () => {
    const q = compile(undefined);
    expect(q.sql).toContain('"added_by_user_id" is null');
    expect(q.sql).not.toContain('"added_by_user_id" = $');
    expect(q.params).not.toContain(7);
  });

  it("viewer 7: scraped promos or the viewer's own", () => {
    const q = compile(7);
    expect(q.sql).toContain('"added_by_user_id" is null');
    expect(q.sql).toContain('"added_by_user_id" = $');
    expect(q.params).toContain(7);
  });

  it("includes the games scope branch gated on window_end", () => {
    const q = compile(undefined);
    expect(q.params).toContain("games");
  });

  it("includes the unrestricted 'any' scope branch gated on expires_at", () => {
    const q = compile(undefined);
    expect(q.params).toContain("any");
    expect(q.sql).toContain('"expires_at" is not null');
  });
});

describe("promoVisibilityCondition", () => {
  it("is exported and produces a condition", () => {
    expect(promoVisibilityCondition(undefined)).toBeDefined();
    expect(promoVisibilityCondition(3)).toBeDefined();
  });
});

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bookKey: "draftkings",
    promoType: "bonus_bet",
    scopeKind: "any",
    eventId: null,
    sportKey: null,
    homeTeam: null,
    awayTeam: null,
    windowStart: null,
    windowEnd: null,
    scopeGames: null,
    marketType: null,
    line: null,
    side: null,
    parsed: {
      bookKey: "draftkings",
      externalId: null,
      promoType: "bonus_bet",
      title: "$25 Bonus Bet",
      rawText: "$25 Bonus Bet",
      sourceUrl: "https://draftkings.com/promo",
      sportKeyHint: null,
      scopeText: "any game",
      teamsText: [],
      windowStart: null,
      windowEnd: null,
      expiresAt: null,
      eligibleMarketTypes: ["moneyline"],
      pinned: null,
      boostPercent: null,
      boostedOddsAmerican: null,
      baseOddsAmerican: null,
      bonusAmount: "25.00",
      maxStake: null,
      maxWinnings: null,
      minOddsAmerican: null,
      unparsedCapFields: [],
      claimRequired: null,
      finePrintNote: null,
    },
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "25.00",
    maxStake: null,
    maxWinnings: null,
    maxWinningsKind: null,
    minOddsAmerican: null,
    finePrintNote: null,
    autoMatched: false,
    addedByUserId: null,
    confirmedByName: null,
    correctedByName: null,
    capEnteredByName: null,
    ...overrides,
  };
}

describe("mapActivePromoRow", () => {
  it("maps scope_kind 'any' to an unrestricted scope labelled 'Any game'", () => {
    const mapped = mapActivePromoRow(makeRow());
    expect(mapped).not.toBeNull();
    expect(mapped?.scope).toEqual({ kind: "any" });
    expect(mapped?.scopeLabel).toBe("Any game");
  });

  it("drops an 'any' promo that carries a market pin", () => {
    expect(mapActivePromoRow(makeRow({ marketType: "moneyline", side: "home" }))).toBeNull();
  });

  it("addedByYou reflects ownership by the viewer", () => {
    expect(mapActivePromoRow(makeRow({ addedByUserId: 7 }), 7)?.addedByYou).toBe(true);
    expect(mapActivePromoRow(makeRow({ addedByUserId: null }), 7)?.addedByYou).toBe(false);
    expect(mapActivePromoRow(makeRow({ addedByUserId: 7 }), undefined)?.addedByYou).toBe(false);
  });

  it("scraped is true only when the promo has no owner (quick-261002-dqn)", () => {
    expect(mapActivePromoRow(makeRow({ addedByUserId: null }), 7)?.scraped).toBe(true);
    expect(mapActivePromoRow(makeRow({ addedByUserId: 7 }), 7)?.scraped).toBe(false);
    expect(mapActivePromoRow(makeRow({ addedByUserId: 9 }), undefined)?.scraped).toBe(false);
  });
});

const GAME_A = { eventId: "A", homeTeam: "BUF Bills", awayTeam: "KC Chiefs", commenceTime: "2026-10-04T17:00:00.000Z" };
const GAME_B = { eventId: "B", homeTeam: "DAL Cowboys", awayTeam: "PHI Eagles", commenceTime: "2026-10-05T00:20:00.000Z" };

function gamesRow(games: unknown, overrides: Record<string, unknown> = {}) {
  return makeRow({
    scopeKind: "games",
    sportKey: "americanfootball_nfl",
    windowStart: new Date(GAME_A.commenceTime),
    windowEnd: new Date(GAME_B.commenceTime),
    scopeGames: games,
    ...overrides,
  });
}

describe("mapActivePromoRow games scope", () => {
  it("maps a 2-game row to a games scope with a label naming the games", () => {
    const mapped = mapActivePromoRow(gamesRow([GAME_A, GAME_B]));
    expect(mapped?.scope).toMatchObject({ kind: "games", sportKey: "americanfootball_nfl", eventIds: ["A", "B"] });
    expect(mapped?.scopeLabel).toBe("KC Chiefs @ BUF Bills, PHI Eagles @ DAL Cowboys");
  });

  it("labels 4+ games by count and day", () => {
    const games = [GAME_A, GAME_B, { ...GAME_A, eventId: "C" }, { ...GAME_A, eventId: "D" }];
    const mapped = mapActivePromoRow(gamesRow(games));
    expect(mapped?.scopeLabel).toMatch(/^4 NFL games · /);
  });

  it("drops (never widens) null, malformed, single-game and wrong-sport rows", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapActivePromoRow(gamesRow(null))).toBeNull();
    expect(mapActivePromoRow(gamesRow([{ eventId: "A" }, GAME_B]))).toBeNull();
    expect(mapActivePromoRow(gamesRow([GAME_A]))).toBeNull();
    expect(mapActivePromoRow(gamesRow([GAME_A, GAME_B], { sportKey: "hockey_nhl" }))).toBeNull();
    expect(mapActivePromoRow(gamesRow([GAME_A, GAME_B], { windowEnd: null }))).toBeNull();
    warn.mockRestore();
  });
});
