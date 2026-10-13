import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("./client", () => ({ getDb: vi.fn() }));

import { getDb } from "./client";
import { isUndefinedTableErrorFor } from "./undefinedTable";
import {
  buildGraphStartDayQuery,
  buildMemberObservationsQuery,
  getMemberProfitHistory,
  recordMemberProfitObservations,
} from "./memberObservations";

function buildTestDb() {
  return drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });
}

const NOW = new Date("2026-10-01T12:00:00.000Z");
const T = "member_profit_observations";
const entry = { promoId: 3, bookKey: "fanduel", denverDate: "2026-10-01", profit: "12.34", partnerPromoId: null };

function mockInsert(error?: unknown) {
  const onConflictDoUpdate = vi.fn(() => (error ? Promise.reject(error) : Promise.resolve()));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  vi.mocked(getDb).mockReturnValue({ insert } as unknown as ReturnType<typeof getDb>);
  return { insert, values, onConflictDoUpdate };
}

function mockReads(opts: { rows?: unknown[]; start?: string | null; error?: unknown }) {
  let call = 0;
  const select = vi.fn(() => {
    const isFirst = call++ === 0;
    const result = () =>
      opts.error
        ? Promise.reject(opts.error)
        : Promise.resolve(isFirst ? (opts.rows ?? []) : [{ start: opts.start ?? null }]);
    return { from: vi.fn(() => ({ where: vi.fn(result), then: (a: never, b: never) => result().then(a, b) })) };
  });
  vi.mocked(getDb).mockReturnValue({ select } as unknown as ReturnType<typeof getDb>);
}

describe("isUndefinedTableErrorFor", () => {
  it("matches code, cause chain and message for the named table", () => {
    expect(isUndefinedTableErrorFor({ code: "42P01" }, T)).toBe(true);
    expect(isUndefinedTableErrorFor(Object.assign(new Error("x"), { cause: { code: "42P01" } }), T)).toBe(true);
    expect(isUndefinedTableErrorFor(new Error(`relation "${T}" does not exist`), T)).toBe(true);
  });
  it("rejects other errors", () => {
    expect(isUndefinedTableErrorFor({ code: "23505" }, T)).toBe(false);
    expect(isUndefinedTableErrorFor(null, T)).toBe(false);
    expect(isUndefinedTableErrorFor(new Error('relation "other" does not exist'), T)).toBe(false);
  });
});

describe("recordMemberProfitObservations", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getDb).mockReset();
  });

  it("does not touch the db for empty entries", async () => {
    const m = mockInsert();
    await recordMemberProfitObservations(7, [], NOW);
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("inserts once with userId and lastObservedAt on every value", async () => {
    const m = mockInsert();
    await recordMemberProfitObservations(7, [entry, { ...entry, promoId: 4 }], NOW);
    expect(m.insert).toHaveBeenCalledTimes(1);
    const rows = (m.values.mock.calls[0] as unknown as [Record<string, unknown>[]])[0];
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.userId).toBe(7);
      expect(r.lastObservedAt).toBe(NOW);
    }
  });

  it("never throws, on 42P01 or any other error", async () => {
    mockInsert({ code: "42P01" });
    await expect(recordMemberProfitObservations(7, [entry], NOW)).resolves.toBeUndefined();
    mockInsert(new Error("boom"));
    await expect(recordMemberProfitObservations(7, [entry], NOW)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("query builders", () => {
  it("member observations query filters by user_id", () => {
    const q = buildMemberObservationsQuery(buildTestDb(), 7).toSQL();
    expect(q.sql).toMatch(/"user_id" = \$1/);
    expect(q.params).toEqual([7]);
    expect(q.sql).toContain('"promo_id"');
    expect(q.sql).toContain('"denver_date"');
    expect(q.sql).toContain('"profit"');
  });

  it("graph start day query selects min(denver_date)", () => {
    const q = buildGraphStartDayQuery(buildTestDb()).toSQL();
    expect(q.sql).toContain("min(denver_date)");
    expect(q.sql).toContain('"member_profit_observations"');
  });
});

describe("getMemberProfitHistory", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ready with start day and rows", async () => {
    const rows = [{ promoId: 3, denverDate: "2026-10-04", profit: "5.00" }];
    mockReads({ rows, start: "2026-10-04" });
    expect(await getMemberProfitHistory(7)).toEqual({ status: "ready", graphStartDay: "2026-10-04", rows });
  });

  it("graphStartDay is null when min is null", async () => {
    mockReads({ rows: [], start: null });
    expect(await getMemberProfitHistory(7)).toEqual({ status: "ready", graphStartDay: null, rows: [] });
  });

  it("returns not-ready on 42P01 and rethrows others", async () => {
    mockReads({ error: Object.assign(new Error("x"), { code: "42P01" }) });
    expect(await getMemberProfitHistory(7)).toEqual({ status: "not-ready" });
    mockReads({ error: new Error("boom") });
    await expect(getMemberProfitHistory(7)).rejects.toThrow("boom");
  });
});
