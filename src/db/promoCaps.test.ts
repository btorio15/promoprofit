import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("./client", () => ({ getDb: vi.fn() }));

import { getDb } from "./client";
import {
  buildCapEditablePromoQuery,
  buildMemberCapsQuery,
  getMemberPromoCaps,
  isUndefinedTableError,
} from "./promoCaps";

function buildTestDb() {
  return drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });
}

const NOW = new Date("2026-10-01T12:00:00.000Z");

function mockRowsResult(result: { rows?: unknown[]; error?: unknown }) {
  const where = vi.fn(() => (result.error ? Promise.reject(result.error) : Promise.resolve(result.rows ?? [])));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  vi.mocked(getDb).mockReturnValue({ select } as unknown as ReturnType<typeof getDb>);
}

describe("isUndefinedTableError", () => {
  it("matches code 42P01 directly, via .cause, and by message", () => {
    expect(isUndefinedTableError({ code: "42P01" })).toBe(true);
    expect(isUndefinedTableError(Object.assign(new Error("Failed query"), { cause: { code: "42P01" } }))).toBe(true);
    expect(isUndefinedTableError(new Error('relation "user_promo_caps" does not exist'))).toBe(true);
  });

  it("does not match other errors", () => {
    expect(isUndefinedTableError(new Error("fetch failed"))).toBe(false);
    expect(isUndefinedTableError({ code: "23505" })).toBe(false);
    expect(isUndefinedTableError(null)).toBe(false);
  });
});

describe("getMemberPromoCaps", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a Map of promo id to max stake", async () => {
    mockRowsResult({ rows: [{ promoId: 20, maxStake: "20.00" }] });
    expect(await getMemberPromoCaps(7)).toEqual(new Map([[20, "20.00"]]));
  });

  it("degrades to an empty Map when the table is missing (direct or wrapped)", async () => {
    mockRowsResult({ error: Object.assign(new Error("x"), { code: "42P01" }) });
    expect(await getMemberPromoCaps(7)).toEqual(new Map());
    mockRowsResult({ error: Object.assign(new Error("Failed query"), { cause: { code: "42P01" } }) });
    expect(await getMemberPromoCaps(7)).toEqual(new Map());
  });

  it("rethrows any other error", async () => {
    mockRowsResult({ error: new Error("fetch failed") });
    await expect(getMemberPromoCaps(7)).rejects.toThrow("fetch failed");
  });
});

describe("compiled queries", () => {
  it("member caps select filters on user_id", () => {
    const q = buildMemberCapsQuery(buildTestDb() as unknown as ReturnType<typeof getDb>, 7).toSQL();
    expect(q.sql).toContain('"user_id" = $');
    expect(q.params).toContain(7);
  });

  it("cap-editable promo query includes the visibility rule and the promo id", () => {
    const q = buildCapEditablePromoQuery(buildTestDb() as unknown as ReturnType<typeof getDb>, 20, 7, NOW).toSQL();
    expect(q.sql).toContain('"added_by_user_id" is null');
    expect(q.sql).toContain('"added_by_user_id" = $');
    expect(q.params).toContain(7);
    expect(q.params).toContain(20);
  });
});
