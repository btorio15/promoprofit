import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("./client", () => ({ getDb: mockGetDb }));

import { buildPairSnapshot } from "@/domain/promos/pairSnapshot";
import { getProfitObservationsSince, unmarkPairDone, unmarkPromoUsed } from "./promoTracking";

/** Chainable drizzle stub: select().from().where().limit() resolves to `rows`; delete().where() is recorded. */
function makeDb(rows: { snapshot: unknown }[]) {
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
    })),
    delete: vi.fn(() => ({ where: deleteWhere })),
  };
  mockGetDb.mockReturnValue(db);
  return { db, deleteWhere };
}

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
    if (node.constructor.name === "Param") {
      out.push(n.value);
    }
  };
  walk(condition);
  return out;
}

const leg = (promoId: number, bookKey: string) => ({
  promoId,
  bookKey,
  bookName: bookKey,
  promoTypeLabel: "Boost" as const,
  promoTitle: "50% profit boost",
  selectionLabel: "Team",
  oddsAmerican: -110,
  stake: "50.00",
  payout: "122.73",
  capNote: null,
  bonusNote: null,
});
const terms = (id: number, bookKey: string) => ({
  id,
  bookKey,
  promoType: "profit_boost" as const,
  title: "50% profit boost",
  boostPercent: "50.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "50.00",
  winningsCap: null,
  minOddsAmerican: null,
});
const pairSnapshot = buildPairSnapshot(
  {
    row: {
      rowKey: "pair-1-2",
      promoIdA: 1,
      promoIdB: 2,
      kind: "boost_boost",
      pairTypeLabel: "Boost + Boost",
      sportLabel: "NFL",
      commenceTime: "2026-09-30T00:20:00.000Z",
      homeTeam: "DEN Broncos",
      awayTeam: "LA Rams",
      marketBadge: "Moneyline",
      tieRisk: false,
      legA: leg(1, "draftkings"),
      legB: leg(2, "fanduel"),
      totalStaked: "100.00",
      netIfAWins: "22.73",
      netIfBWins: "22.73",
      guaranteedProfit: "22.73",
      roiPct: "22.73",
      rateLabel: "ROI",
      separateProfitA: "10.00",
      separateProfitB: "10.00",
      gain: "2.73",
      worstCase: false,
    },
    termsA: terms(1, "draftkings"),
    termsB: terms(2, "fanduel"),
  },
  { now: new Date("2026-09-29T15:00:00.000Z"), precision: "cents", oddsFetchedAt: { moneyline: null, spreadsTotals: null } },
).primary.snapshot;

beforeEach(() => vi.clearAllMocks());

describe("unmarkPairDone", () => {
  it("is a no-op when the member has no row for that promo", async () => {
    const { db } = makeDb([]);
    await unmarkPairDone({ userId: 7, promoId: 1 });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("a single (non-pair) completion deletes only that row", async () => {
    const { db, deleteWhere } = makeDb([{ snapshot: null }]);
    await unmarkPairDone({ userId: 7, promoId: 5 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    const params = paramsOf(deleteWhere.mock.calls[0][0]);
    expect(params).toContain(7);
    expect(params).toContain(5);
    expect(params).toHaveLength(2);
  });

  it("from the partner's marker row, one delete removes both ids scoped to the user", async () => {
    const { db, deleteWhere } = makeDb([{ snapshot: { version: 1, kind: "pair_member", pairedWithPromoId: 1 } }]);
    await unmarkPairDone({ userId: 7, promoId: 2 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    const params = paramsOf(deleteWhere.mock.calls[0][0]);
    expect(params).toContain(7);
    expect(params).toContain(1);
    expect(params).toContain(2);
  });

  it("an unreadable pair-like snapshot falls back to deleting just that row", async () => {
    const { db, deleteWhere } = makeDb([{ snapshot: { version: 1, kind: "pair", junk: true } }]);
    await unmarkPairDone({ userId: 7, promoId: 1 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(paramsOf(deleteWhere.mock.calls[0][0])).toHaveLength(2);
  });

  it("unmarkPromoUsed routes through the pair-aware path", async () => {
    const { db, deleteWhere } = makeDb([{ snapshot: JSON.parse(JSON.stringify(pairSnapshot)) }]);
    await unmarkPromoUsed({ userId: 7, promoId: 1 });
    expect(db.delete).toHaveBeenCalledTimes(1);
    const params = paramsOf(deleteWhere.mock.calls[0][0]);
    expect(params).toEqual(expect.arrayContaining([7, 1, 2]));
  });
});

describe("getProfitObservationsSince (T-5-04 visibility)", () => {
  it("inner-joins promos and binds the viewer id and since date", async () => {
    const innerJoin = vi.fn();
    const where = vi.fn().mockResolvedValue([]);
    innerJoin.mockReturnValue({ where });
    const db = { select: vi.fn(() => ({ from: () => ({ innerJoin }) })) };
    mockGetDb.mockReturnValue(db);

    await getProfitObservationsSince("2026-09-01", 7);

    expect(innerJoin).toHaveBeenCalledTimes(1);
    const params = paramsOf(where.mock.calls[0][0]);
    expect(params).toContain(7);
    expect(params).toContain("2026-09-01");
  });
});
