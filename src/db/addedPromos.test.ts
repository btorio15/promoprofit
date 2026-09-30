import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import {
  buildCountOwnLiveAddedPromosQuery,
  buildExpireOwnStatement,
  buildSoftDeleteStatements,
} from "./addedPromos";

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
  const [update, del] = buildSoftDeleteStatements(db, { promoId: 5, userId: 7 });
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
