import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";
import type { SignupOfferInput } from "./signupOffers";

/**
 * quick-260928-mgi: builds a REAL drizzle neon-http instance on a dummy,
 * never-contacted connection string, with `batch` replaced by a vi.fn that
 * records its statements and resolves a fixed shape. This lets the test
 * assert on each statement's own toSQL() output -- the real query builder,
 * not a hand-rolled mock of db.update/db.insert -- without ever touching a
 * network or a real database (the neon-http driver only sends a request
 * inside `.execute()`/`.then()`, which db.batch replaces entirely here).
 */
function buildTestDb() {
  const client = neon("postgresql://u:p@db.invalid/x");
  return drizzle({ client, schema });
}

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mockGetDb }));

import { commitSignupOffers } from "./signupStore";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function makeOffer(overrides: Partial<SignupOfferInput> = {}): SignupOfferInput {
  return {
    bookKey: "draftkings",
    dedupeKey: "signup:draftkings:1118611",
    externalId: "1118611",
    title: "New Sportsbook Customers Bet $5 Get $150 in Bonus Bets",
    description: "Bet $5, get $150 in Bonus Bets.",
    rawText: "Bet $5, get $150 in Bonus Bets over 14 days.",
    bonusAmount: "150.00",
    sourceUrl: "https://sportsbook.draftkings.com/",
    expiresAt: null,
    ...overrides,
  };
}

describe("commitSignupOffers", () => {
  it("with one offer: a single db.batch call with an expire statement (status='expired' where book_key/status/dedupe_key NOT IN) plus one upsert", async () => {
    const db = buildTestDb();
    const batchMock = vi.fn().mockResolvedValue([[{ id: 1 }]]);
    db.batch = batchMock;
    mockGetDb.mockReturnValue(db);

    const offer = makeOffer();
    const result = await commitSignupOffers("draftkings", [offer], NOW);

    expect(batchMock).toHaveBeenCalledTimes(1);
    const statements = batchMock.mock.calls[0][0] as { toSQL(): { sql: string; params: unknown[] } }[];
    expect(statements).toHaveLength(2);

    const expireSql = statements[0].toSQL();
    expect(expireSql.sql).toContain('update "signup_offers" set "status" = $1');
    expect(expireSql.sql).toContain('"signup_offers"."book_key" = $2');
    expect(expireSql.sql).toContain('"signup_offers"."status" = $3');
    expect(expireSql.sql).toContain('"signup_offers"."dedupe_key" not in ($4)');
    expect(expireSql.params).toEqual(["expired", "draftkings", "active", offer.dedupeKey]);

    const upsertSql = statements[1].toSQL();
    expect(upsertSql.sql).toContain('insert into "signup_offers"');
    expect(upsertSql.sql).toContain('on conflict ("dedupe_key") do update set');
    // The update SET clause includes last_seen_at, status and bonus_amount...
    expect(upsertSql.sql).toContain('"last_seen_at" =');
    expect(upsertSql.sql).toContain('"status" =');
    expect(upsertSql.sql).toContain('"bonus_amount" =');
    // ...and does NOT include first_seen_at (only appears once, in the
    // INSERT column list, never a second time in the ON CONFLICT SET list).
    const setClauseSql = upsertSql.sql.split("on conflict")[1];
    expect(setClauseSql).not.toContain("first_seen_at");

    expect(result).toEqual({ upserted: 1, expired: 1 });
  });

  it("empty offers: exactly one batch statement (the expire, with NO dedupe_key NOT IN clause), expiring every active row for the book", async () => {
    const db = buildTestDb();
    const batchMock = vi.fn().mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
    db.batch = batchMock;
    mockGetDb.mockReturnValue(db);

    const result = await commitSignupOffers("draftkings", [], NOW);

    expect(batchMock).toHaveBeenCalledTimes(1);
    const statements = batchMock.mock.calls[0][0] as { toSQL(): { sql: string; params: unknown[] } }[];
    expect(statements).toHaveLength(1);

    const expireSql = statements[0].toSQL();
    expect(expireSql.sql).toContain('update "signup_offers" set "status" = $1');
    expect(expireSql.sql).toContain('"signup_offers"."book_key" = $2');
    expect(expireSql.sql).toContain('"signup_offers"."status" = $3');
    expect(expireSql.sql).not.toContain("not in");
    expect(expireSql.params).toEqual(["expired", "draftkings", "active"]);

    expect(result).toEqual({ upserted: 0, expired: 2 });
  });

  it("two offers: one expire statement plus one upsert per offer, all in the same batch", async () => {
    const db = buildTestDb();
    const batchMock = vi.fn().mockResolvedValue([[]]);
    db.batch = batchMock;
    mockGetDb.mockReturnValue(db);

    const offerA = makeOffer({ dedupeKey: "signup:draftkings:a", externalId: "a" });
    const offerB = makeOffer({ dedupeKey: "signup:draftkings:b", externalId: "b", bonusAmount: null });

    const result = await commitSignupOffers("draftkings", [offerA, offerB], NOW);

    expect(batchMock).toHaveBeenCalledTimes(1);
    const statements = batchMock.mock.calls[0][0] as { toSQL(): { sql: string; params: unknown[] } }[];
    expect(statements).toHaveLength(3);

    const expireSql = statements[0].toSQL();
    expect(expireSql.sql).toContain("not in ($4, $5)");
    expect(expireSql.params).toEqual(["expired", "draftkings", "active", "signup:draftkings:a", "signup:draftkings:b"]);

    expect(result).toEqual({ upserted: 2, expired: 0 });
  });
});
