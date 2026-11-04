import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("./client", () => ({ getDb: mockGetDb }));
vi.mock("./queries", () => ({ getCachedEvents: vi.fn(), getHedgeBookKeys: vi.fn() }));

import { getCachedEvents, getHedgeBookKeys } from "./queries";
import { recordBonusConversionSnapshots, recordCurrentBonusConversionSnapshots } from "./bonusConversionSnapshots";

const NOW = new Date("2026-11-03T18:00:00Z");

const event: OddsEvent = {
  id: "g1",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString(),
  home_team: "H",
  away_team: "A",
  bookmakers: [
    { key: "bookA", price: [200, -250] },
    { key: "bookB", price: [-300, -150] },
  ].map((b) => ({
    key: b.key,
    title: b.key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "H", price: b.price[0] },
          { name: "A", price: b.price[1] },
        ],
      },
    ],
  })),
};

function makeDb(insertResult: Promise<void> = Promise.resolve()) {
  const onConflictDoNothing = vi.fn(() => insertResult);
  const values = vi.fn<(rows: unknown) => { onConflictDoNothing: typeof onConflictDoNothing }>(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  mockGetDb.mockReturnValue({ insert });
  return { insert, values, onConflictDoNothing };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("recordBonusConversionSnapshots", () => {
  it("does not touch the DB for an empty list", async () => {
    await recordBonusConversionSnapshots([]);
    expect(mockGetDb).not.toHaveBeenCalled();
  });
});

describe("recordCurrentBonusConversionSnapshots", () => {
  it("writes nothing when no odds are cached, without loading hedge books", async () => {
    const db = makeDb();
    vi.mocked(getCachedEvents).mockResolvedValue({ events: [], fetchedAt: null });
    await recordCurrentBonusConversionSnapshots(NOW);
    expect(db.insert).not.toHaveBeenCalled();
    expect(getHedgeBookKeys).not.toHaveBeenCalled();
  });

  it("inserts one row per hedge book with onConflictDoNothing", async () => {
    const db = makeDb();
    vi.mocked(getCachedEvents).mockResolvedValue({ events: [event], fetchedAt: NOW });
    vi.mocked(getHedgeBookKeys).mockResolvedValue(["bookA", "bookB"]);
    await recordCurrentBonusConversionSnapshots(NOW);
    expect(db.insert).toHaveBeenCalledTimes(1);
    const rows = db.values.mock.calls[0][0] as { bookKey: string; capturedAt: Date; referenceAmount: string }[];
    expect(rows.map((r) => r.bookKey)).toEqual(["bookA", "bookB"]);
    for (const r of rows) {
      expect(r.capturedAt).toEqual(NOW);
      expect(r.referenceAmount).toBe("100.00");
    }
    expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("resolves and logs when getCachedEvents rejects", async () => {
    vi.mocked(getCachedEvents).mockRejectedValue(new Error("read failed"));
    await expect(recordCurrentBonusConversionSnapshots(NOW)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("resolves and logs when the insert rejects", async () => {
    makeDb(Promise.reject(new Error("no such table")));
    vi.mocked(getCachedEvents).mockResolvedValue({ events: [event], fetchedAt: NOW });
    vi.mocked(getHedgeBookKeys).mockResolvedValue(["bookA", "bookB"]);
    await expect(recordCurrentBonusConversionSnapshots(NOW)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
