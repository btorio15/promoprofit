import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import { buildDailyProfitHistoryQuery, buildFunnelPromosQuery } from "./profitHistory";

const db = drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });

// Statistics is site-wide: members' private hand-added promos never appear
// (07.1 WR-02 and review follow-up; tests added in quick-261022-hn4).
describe("Statistics loaders exclude members' private promos", () => {
  it("daily profit history keeps only promos with no added_by_user_id", () => {
    const { sql } = buildDailyProfitHistoryQuery(db).toSQL();
    expect(sql).toMatch(/^select .* from "promo_profit_observations" left join "promos"/);
    expect(sql).toMatch(/where "promos"\."added_by_user_id" is null$/);
  });

  it("funnel and book health keep only promos with no added_by_user_id", () => {
    const { sql } = buildFunnelPromosQuery(db).toSQL();
    expect(sql).toMatch(/^select .* from "promos"/);
    expect(sql).toMatch(/where "promos"\."added_by_user_id" is null$/);
  });
});
