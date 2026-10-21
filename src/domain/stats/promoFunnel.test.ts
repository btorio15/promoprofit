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
  it("counts available, expired, dismissed and pending promos", () => {
    const stats = promoFunnel(promos);
    expect(stats.totals).toEqual({
      total: 5,
      available: 1,
      expired: 2,
      dismissed: 1,
      pendingReview: 1,
    });
  });

  it("gives per-book stake limits and removals, biggest book first", () => {
    const stats = promoFunnel(promos);
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
    const stats = promoFunnel([{ promoId: 9, bookKey: "ballybet", status: "active", maxStake: null }], new Date());
    expect(stats.books[0]).toMatchObject({ avgMaxStake: null, maxStakeKnown: 0 });
  });

  it("treats an active promo past its end time as expired (quick-261021-gy4)", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const stats = promoFunnel(
      [
        { promoId: 20, bookKey: "fanduel", status: "active", maxStake: null, expiresAt: new Date("2026-10-21T06:00:00Z") },
        { promoId: 21, bookKey: "fanduel", status: "active", maxStake: null, expiresAt: new Date("2026-10-22T06:00:00Z") },
        { promoId: 22, bookKey: "fanduel", status: "active", maxStake: null, expiresAt: null },
      ],
      now,
    );
    expect(stats.totals).toMatchObject({ available: 2, expired: 1 });
    expect(stats.books[0]).toMatchObject({ active: 2, removed: 1 });
  });
});
