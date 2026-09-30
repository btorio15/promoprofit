import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import { activePromoForFlagWhere } from "./promoReview";
import { promos } from "./schema";

const db = drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });

describe("activePromoForFlagWhere (WR-05)", () => {
  it("scopes the flag lookup to promos visible to the viewer", () => {
    const { sql, params } = db.select({ id: promos.id }).from(promos).where(activePromoForFlagWhere(5, 7)).toSQL();
    expect(sql).toContain('"id" = $');
    expect(sql).toContain('"status" = $');
    // Scraped/group promos (no owner) or the viewer's own added promos only.
    expect(sql).toContain('"added_by_user_id" is null');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, "active", 7]));
  });
});
