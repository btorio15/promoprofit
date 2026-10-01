import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { OddsEvent } from "@/domain/odds/schemas";

interface Recorded {
  op: "delete" | "insert";
  table: string;
  where?: string;
  params?: unknown[];
  rows?: Record<string, unknown>[];
}

const dialect = new PgDialect();
const batches: Recorded[][] = [];

vi.mock("@/db/client", () => ({
  getDb: () => ({
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: (cond: SQL): Recorded => {
        const q = dialect.sqlToQuery(cond);
        return { op: "delete", table: getTableName(table), where: q.sql, params: q.params };
      },
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (rows: Record<string, unknown>[]): Recorded => ({
        op: "insert",
        table: getTableName(table),
        rows,
      }),
    }),
    batch: async (stmts: Recorded[]) => {
      batches.push(stmts);
    },
  }),
}));

import { commitPromoSportsRefresh, commitSpreadsTotalsRefresh } from "./store";

function evt(id: string, sport: string): OddsEvent {
  return {
    id,
    sport_key: sport,
    sport_title: sport,
    commence_time: "2026-10-02T00:00:00Z",
    home_team: "H",
    away_team: "A",
    bookmakers: [],
  };
}

const T = new Date("2026-10-01T17:00:00.000Z");

beforeEach(() => {
  batches.length = 0;
});

describe("commitPromoSportsRefresh (quick-261001-jbc, D-06)", () => {
  it("replaces only the refreshed sport in BOTH tables in ONE batch, never purging by fetched_at", async () => {
    const nfl = evt("n1", "americanfootball_nfl");
    await commitPromoSportsRefresh(
      [{ sportKey: "americanfootball_nfl", extendedEvents: [nfl], h2hEvents: [nfl] }],
      T,
    );

    expect(batches).toHaveLength(1);
    const stmts = batches[0];
    for (const table of ["cached_extended_odds", "cached_odds"]) {
      const forTable = stmts.filter((s) => s.table === table);
      const deletes = forTable.filter((s) => s.op === "delete");
      const sportDelete = deletes.filter((s) => s.where?.includes("sport_key"));
      expect(sportDelete).toHaveLength(1);
      expect(sportDelete[0].params).toEqual(["americanfootball_nfl"]);
      const inserts = forTable.filter((s) => s.op === "insert");
      expect(inserts).toHaveLength(1);
      for (const row of inserts[0].rows ?? []) {
        expect(row.fetchedAt).toEqual(T);
        expect(row.sportKey).toBe("americanfootball_nfl");
      }
      expect(deletes.some((s) => s.where?.includes("commence_time"))).toBe(true);
      expect(deletes.some((s) => s.where?.includes("fetched_at"))).toBe(false);
    }
  });

  it("issues no batch for an empty write list", async () => {
    await commitPromoSportsRefresh([], T);
    expect(batches).toHaveLength(0);
  });
});

describe("commitSpreadsTotalsRefresh (full search unchanged)", () => {
  it("still purges fetched_at < t on both tables", async () => {
    const nfl = evt("n1", "americanfootball_nfl");
    await commitSpreadsTotalsRefresh(
      [{ sportKey: "americanfootball_nfl", extendedEvents: [nfl], h2hEvents: [nfl] }],
      T,
    );
    const stmts = batches[0];
    for (const table of ["cached_extended_odds", "cached_odds"]) {
      expect(stmts.some((s) => s.op === "delete" && s.table === table && s.where?.includes("fetched_at"))).toBe(true);
    }
  });
});
