import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import { buildExpireUnseenStatement } from "./store";

describe("buildExpireUnseenStatement", () => {
  it("never expires hand-added promos (Research Pitfall 4)", () => {
    const db = drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });
    const q = buildExpireUnseenStatement(db, "draftkings", ["k1"]).toSQL();
    expect(q.sql).toContain('"added_by_user_id" is null');
    expect(q.sql).toContain('"book_key" = $');
    expect(q.params).toContain("draftkings");
    expect(q.params).toContain("expired");
  });
});
