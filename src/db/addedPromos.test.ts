import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import {
  buildCountOwnLiveAddedPromosQuery,
  buildExpireOwnStatement,
  buildSoftDeleteStatements,
  buildUpdateOwnStatements,
} from "./addedPromos";
import type { AddedPromoInsert } from "@/domain/promos/buildAddedPromo";
import { mapOwnPromoToEditValues } from "./addedPromos";

const db = drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });

describe("buildExpireOwnStatement", () => {
  it("updates promos status with id, owner and active status in WHERE", () => {
    const { sql, params } = buildExpireOwnStatement(db, { promoId: 5, userId: 7 }).toSQL();
    expect(sql).toMatch(/^update "promos" set "status" = \$1/);
    expect(sql).toContain('"id" = $');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(sql).toContain('"status" = $');
    expect(params).toEqual(expect.arrayContaining([5, 7, "expired", "active"]));
  });
});

describe("buildSoftDeleteStatements", () => {
  const [update, del, delMember] = buildSoftDeleteStatements(db, { promoId: 5, userId: 7 });
  it("soft-deletes with ownership in WHERE", () => {
    const { sql, params } = update.toSQL();
    expect(sql).toMatch(/^update "promos" set "status" = \$1/);
    expect(sql).toContain('"added_by_user_id" = $');
    expect(sql).toContain('"status" in (');
    expect(params).toEqual(expect.arrayContaining([5, 7, "deleted", "active", "expired"]));
  });
  it("removes observations scoped by an ownership subquery, and never deletes from promos", () => {
    const { sql, params } = del.toSQL();
    expect(sql).toMatch(/^delete from "promo_profit_observations"/);
    expect(sql).toContain('"promo_id" in (select "id" from "promos"');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, 7]));
    for (const s of [update.toSQL().sql, sql]) expect(s).not.toMatch(/delete from "promos"/);
  });
  it("clears the owner's member observations for the promo and pairs it is partner in (quick-261022-hn4)", () => {
    const { sql, params } = delMember.toSQL();
    expect(sql).toMatch(/^delete from "member_profit_observations"/);
    expect(sql).toContain('"member_profit_observations"."user_id" = $');
    expect(sql).toMatch(/"member_profit_observations"\."promo_id" = \$\d+ or "member_profit_observations"\."partner_promo_id" = \$\d+/);
    expect(sql).toContain('exists (select "id" from "promos"');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, 7]));
    expect(params).not.toContain("active");
  });
});

describe("buildCountOwnLiveAddedPromosQuery (CR-01)", () => {
  const NOW = new Date("2026-10-01T16:00:00.000Z");
  it("counts only the member's promos that are still live by the feed rule", () => {
    const { sql, params } = buildCountOwnLiveAddedPromosQuery(db, 7, NOW).toSQL();
    expect(sql).toMatch(/^select count\(\*\) from "promos"/);
    expect(sql).toContain('"added_by_user_id" = $');
    expect(sql).toContain('"status" = $');
    // Lapsed promos (past expiry, game started, window ended) must not count.
    expect(sql).toContain('"expires_at" > $');
    expect(sql).toContain('"event_commence_time" > $');
    expect(sql).toContain('"window_end" > $');
    expect(params).toEqual(expect.arrayContaining([7, "active"]));
  });
});

describe("buildUpdateOwnStatements (WR-01)", () => {
  const values = {
    dedupeKey: "added:edit:5",
    bookKey: "fanduel",
    promoType: "bonus_bet",
    bonusAmount: "10",
    addedByUserId: 7,
    status: "active",
  } as unknown as AddedPromoInsert;
  const [update, del, delMember] = buildUpdateOwnStatements(db, { promoId: 5, userId: 7, values });
  it("updates in place with owner, active status and locked book/type in WHERE", () => {
    const { sql, params } = update.toSQL();
    expect(sql).toMatch(/^update "promos" set/);
    expect(sql).toContain('"added_by_user_id" = $');
    expect(sql).not.toMatch(/set[^]*"dedupe_key"[^]*where/);
    expect(params).toEqual(expect.arrayContaining([5, 7, "active", "fanduel", "bonus_bet", "10"]));
  });
  it("clears the promo's stale profit observations, scoped by an ownership subquery", () => {
    const { sql, params } = del.toSQL();
    expect(sql).toMatch(/^delete from "promo_profit_observations"/);
    expect(sql).toContain('"promo_id" in (select "id" from "promos"');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, 7, "active"]));
    expect(sql).not.toMatch(/delete from "promos"/);
  });
  it("clears the owner's stale member observations, only while the promo is active (quick-261022-hn4)", () => {
    const { sql, params } = delMember.toSQL();
    expect(sql).toMatch(/^delete from "member_profit_observations"/);
    expect(sql).toContain('"partner_promo_id" = $');
    expect(sql).toContain('exists (select "id" from "promos"');
    expect(params).toEqual(expect.arrayContaining([5, 7, "active"]));
  });
});

describe("mapOwnPromoToEditValues (no-sweat edit prefill)", () => {
  const baseRow = {
    id: 5,
    bookKey: "betmgm",
    promoType: "no_sweat",
    bonusAmount: "25.00",
    boostPercent: null,
    boostedOddsAmerican: null,
    maxStake: null,
    maxWinnings: null,
    maxWinningsKind: null,
    minOddsAmerican: -200,
    scopeKind: "any",
    eventId: null,
    scopeGames: null,
    sportKey: null,
    windowStart: null,
    windowEnd: null,
    marketType: null,
    line: null,
    side: null,
    expiresAt: new Date("2026-10-05T03:59:00.000Z"),
  };
  const parsedWith = (eligibleMarketTypes: string[]) => ({
    bookKey: "betmgm",
    externalId: null,
    promoType: "no_sweat",
    title: "No-sweat up to $25.00",
    rawText: "",
    sourceUrl: "user-added",
    sportKeyHint: null,
    scopeText: "Any game",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: "2026-10-05T03:59:00.000Z",
    eligibleMarketTypes,
    pinned: null,
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "25.00",
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican: -200,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
  });
  type Row = Parameters<typeof mapOwnPromoToEditValues>[0];

  it("reads the refund cap from bonus_amount and a single market from parsed.eligibleMarketTypes", () => {
    const v = mapOwnPromoToEditValues({ ...baseRow, parsed: parsedWith(["spread"]) } as unknown as Row);
    expect(v.refundCap).toBe("25.00");
    expect(v.marketType).toBe("spread");
    expect(v.minOddsAmerican).toBe(-200);
  });

  it("maps all three markets to no limit", () => {
    const v = mapOwnPromoToEditValues({
      ...baseRow,
      parsed: parsedWith(["moneyline", "spread", "total"]),
    } as unknown as Row);
    expect(v.marketType).toBeNull();
  });

  it("leaves refundCap null for a bonus bet", () => {
    const v = mapOwnPromoToEditValues({ ...baseRow, promoType: "bonus_bet", parsed: {} } as unknown as Row);
    expect(v.refundCap).toBeNull();
  });
});
