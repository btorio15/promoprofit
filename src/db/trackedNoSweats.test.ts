import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("./client", () => ({ getDb: mockGetDb }));

import { buildTrackedSnapshotFixture } from "@/domain/promos/noSweatSnapshot.fixture";
import { getTrackedNoSweats, markTrackedLost, revertTrackedToTracking } from "./trackedNoSweats";

/** Collect every primitive param bound into a drizzle SQL condition. */
function paramsOf(condition: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const n = node as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if ("queryChunks" in n && Array.isArray(n.queryChunks)) {
      n.queryChunks.forEach(walk);
      return;
    }
    if (node.constructor.name === "Param") out.push(n.value);
  };
  walk(condition);
  return out;
}

const NOW = new Date("2026-11-08T12:00:00Z");

function selectDb(result: () => Promise<unknown[]>) {
  const where = vi.fn(() => ({ orderBy: result }));
  mockGetDb.mockReturnValue({ select: () => ({ from: () => ({ where }) }) });
  return where;
}

function updateDb(returned: { promoId: number }[]) {
  const where = vi.fn(() => ({ returning: () => Promise.resolve(returned) }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  mockGetDb.mockReturnValue({ update });
  return { update, set, where };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("getTrackedNoSweats", () => {
  it("returns [] on an undefined-table error for tracked_no_sweats", async () => {
    selectDb(() => Promise.reject(new Error('relation "tracked_no_sweats" does not exist')));
    await expect(getTrackedNoSweats(7)).resolves.toEqual([]);
  });

  it("rethrows other errors", async () => {
    selectDb(() => Promise.reject(new Error("boom")));
    await expect(getTrackedNoSweats(7)).rejects.toThrow("boom");
  });

  it("drops rows with an invalid snapshot and filters by userId", async () => {
    const good = {
      promoId: 1,
      state: "tracking",
      trackedAt: NOW,
      outcome: null,
      outcomeAt: null,
      correction: null,
      snapshot: buildTrackedSnapshotFixture(),
    };
    const bad = { ...good, promoId: 2, snapshot: { version: 1 } };
    const where = selectDb(() => Promise.resolve([good, bad]));
    const rows = await getTrackedNoSweats(7);
    expect(rows.map((r) => r.promoId)).toEqual([1]);
    expect(console.warn).toHaveBeenCalled();
    expect(paramsOf((where.mock.calls[0] as unknown[])[0])).toContain(7);
  });
});

describe("state transitions", () => {
  it("markTrackedLost issues one scoped update and reports a change", async () => {
    const { update, set, where } = updateDb([{ promoId: 3 }]);
    await expect(markTrackedLost({ userId: 7, promoId: 3, correction: null, now: NOW })).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0] as unknown[])[0]).toMatchObject({ state: "awaiting_refund", outcome: "lost" });
    const params = paramsOf((where.mock.calls[0] as unknown[])[0]);
    expect(params).toEqual(expect.arrayContaining([7, 3, "tracking"]));
  });

  it("revertTrackedToTracking issues one scoped update", async () => {
    const { update, set, where } = updateDb([]);
    await expect(revertTrackedToTracking({ userId: 7, promoId: 3, now: NOW })).resolves.toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0] as unknown[])[0]).toMatchObject({ state: "tracking", outcome: null, correction: null });
    const params = paramsOf((where.mock.calls[0] as unknown[])[0]);
    expect(params).toEqual(expect.arrayContaining([7, 3, "awaiting_refund"]));
  });
});
