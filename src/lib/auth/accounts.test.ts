import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  getDb: () => ({ execute: mockExecute }),
}));

import { reserveLoginAttempt } from "./accounts";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS } from "./lockout";

const dialect = new PgDialect();

function compile(arg: SQL) {
  const { sql, params } = dialect.sqlToQuery(arg);
  return { sql: sql.replace(/\s+/g, " ").trim(), params };
}

const NOW = new Date("2026-09-26T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reserveLoginAttempt", () => {
  it("issues exactly ONE getDb().execute call (no select, no second update)", async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    await reserveLoginAttempt(7, NOW);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("compiles to a single UPDATE ... WHERE (locked_until IS NULL OR locked_until <= ...) RETURNING id statement", async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    await reserveLoginAttempt(7, NOW);

    const arg = mockExecute.mock.calls[0][0] as SQL;
    const { sql } = compile(arg);

    expect(sql.toLowerCase()).toContain("update");
    expect(sql.toLowerCase()).toContain("users");
    expect(sql).toContain("id =");
    expect(sql).toContain("(locked_until IS NULL OR locked_until <=");
    expect(sql.trim().toLowerCase().endsWith("returning id")).toBe(true);
  });

  it("uses a CASE on failed_login_attempts + 1 >= threshold for both failed_login_attempts and locked_until", async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    await reserveLoginAttempt(7, NOW);

    const arg = mockExecute.mock.calls[0][0] as SQL;
    const { sql } = compile(arg);

    expect(sql).toContain("failed_login_attempts + 1 >=");
    const caseCount = (sql.match(/CASE WHEN failed_login_attempts \+ 1 >=/g) ?? []).length;
    expect(caseCount).toBe(2);
  });

  it("binds userId, now, now+15min lockUntil, and MAX_FAILED_LOGIN_ATTEMPTS as params", async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    await reserveLoginAttempt(7, NOW);

    const arg = mockExecute.mock.calls[0][0] as SQL;
    const { params } = compile(arg);

    expect(params).toContain(7);
    expect(params).toContain(MAX_FAILED_LOGIN_ATTEMPTS);
    const lockUntil = new Date(NOW.getTime() + LOCKOUT_MINUTES * 60_000);
    const dateParams = params.filter((p): p is Date => p instanceof Date);
    expect(dateParams.some((d) => d.getTime() === NOW.getTime())).toBe(true);
    expect(dateParams.some((d) => d.getTime() === lockUntil.getTime())).toBe(true);
  });

  it("returns true when execute resolves rows: [{ id: 7 }]", async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 7 }] });

    await expect(reserveLoginAttempt(7, NOW)).resolves.toBe(true);
  });

  it("returns false when execute resolves rows: []", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await expect(reserveLoginAttempt(7, NOW)).resolves.toBe(false);
  });
});
