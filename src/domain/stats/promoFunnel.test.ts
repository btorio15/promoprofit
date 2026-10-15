import { describe, expect, it } from "vitest";
import { promoFunnel, type FunnelPromo } from "./promoFunnel";

const promos: FunnelPromo[] = [
  { promoId: 1, bookKey: "draftkings", status: "active", maxStake: "100.00" },
  { promoId: 2, bookKey: "draftkings", status: "expired", maxStake: null },
  { promoId: 3, bookKey: "draftkings", status: "expired", maxStake: "50.00" },
  { promoId: 4, bookKey: "fanduel", status: "dismissed", maxStake: "20.00" },
  { promoId: 5, bookKey: "fanduel", status: "pending_review", maxStake: null },
];

describe("promoFunnel", () => {
  it("counts available, marked-done, expired-unused, dismissed and pending promos", () => {
    const stats = promoFunnel(promos, new Set([3]));
    expect(stats.totals).toEqual({
      total: 5,
      available: 1,
      markedDone: 1,
      expiredUnused: 1,
      dismissed: 1,
      pendingReview: 1,
    });
  });

  it("gives per-book stake limits and removals, biggest book first", () => {
    const stats = promoFunnel(promos, new Set());
    expect(stats.books[0]).toEqual({
      bookKey: "draftkings",
      promos: 3,
      active: 1,
      removed: 2,
      avgMaxStake: "75.00",
      maxStakeKnown: 2,
    });
    expect(stats.books[1]).toMatchObject({ bookKey: "fanduel", removed: 1, avgMaxStake: "20.00", maxStakeKnown: 1 });
  });

  it("reports no average when no max stake is known", () => {
    const stats = promoFunnel([{ promoId: 9, bookKey: "ballybet", status: "active", maxStake: null }], new Set());
    expect(stats.books[0]).toMatchObject({ avgMaxStake: null, maxStakeKnown: 0 });
  });
});
