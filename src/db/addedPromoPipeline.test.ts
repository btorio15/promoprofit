import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUsableUserBooks, mockGetCachedEvents, mockGetCachedExtendedEvents } = vi.hoisted(() => ({
  mockGetUsableUserBooks: vi.fn(),
  mockGetCachedEvents: vi.fn(),
  mockGetCachedExtendedEvents: vi.fn(),
}));

vi.mock("./queries", () => ({
  getUsableUserBooks: mockGetUsableUserBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
}));

import { prepareAddedPromoValues } from "./addedPromoPipeline";
import type { AddPromoInput } from "@/domain/promos/addedPromoInput";

const NOW = new Date("2026-10-01T16:00:00.000Z");

const bonusAtMgm = {
  promoType: "bonus_bet",
  bookKey: "betmgm",
  bonusAmount: "50",
  expires: { etDate: "2026-10-04", etTime: "23:59" },
  scope: null,
} as unknown as AddPromoInput;

beforeEach(() => {
  mockGetUsableUserBooks.mockReset().mockResolvedValue([{ key: "fanduel", displayName: "FanDuel" }]);
  mockGetCachedEvents.mockReset().mockResolvedValue({ events: [], fetchedAt: NOW });
  mockGetCachedExtendedEvents.mockReset().mockResolvedValue({ events: [], fetchedAt: NOW });
});

describe("prepareAddedPromoValues book check", () => {
  it("rejects a book the member does not have when adding", async () => {
    const r = await prepareAddedPromoValues({ userId: 7, data: bonusAtMgm, now: NOW, dedupeKey: "added:x" });
    expect(r).toEqual({ ok: false, response: { status: "invalid", fieldErrors: { bookKey: ["Pick a sportsbook."] } } });
  });

  it("accepts the promo's own locked book on edit even after the member dropped it (WR-03)", async () => {
    const r = await prepareAddedPromoValues({
      userId: 7,
      data: bonusAtMgm,
      now: NOW,
      dedupeKey: "added:edit:5",
      lockedBookKey: "betmgm",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.bookKey).toBe("betmgm");
  });

  it("still rejects a different unusable book on edit", async () => {
    const r = await prepareAddedPromoValues({
      userId: 7,
      data: bonusAtMgm,
      now: NOW,
      dedupeKey: "added:edit:5",
      lockedBookKey: "draftkings",
    });
    expect(r.ok).toBe(false);
  });
});

describe("prepareAddedPromoValues expiry bounds (WR-06)", () => {
  const bonusAtFanduel = (etDate: string) =>
    ({ ...bonusAtMgm, bookKey: "fanduel", expires: { etDate, etTime: "23:59" } }) as unknown as AddPromoInput;

  it("accepts the last day the form offers (29 ET days ahead)", async () => {
    const r = await prepareAddedPromoValues({ userId: 7, data: bonusAtFanduel("2026-10-30"), now: NOW, dedupeKey: "a" });
    expect(r.ok).toBe(true);
  });

  it("rejects an expiry far beyond the form's 30-day list", async () => {
    const r = await prepareAddedPromoValues({ userId: 7, data: bonusAtFanduel("2099-12-31"), now: NOW, dedupeKey: "a" });
    expect(r).toEqual({
      ok: false,
      response: { status: "invalid", fieldErrors: { expires: ["Pick a day in the next 30 days."] } },
    });
  });

  it("rejects an expiry just past the 30-day window plus slack", async () => {
    const r = await prepareAddedPromoValues({ userId: 7, data: bonusAtFanduel("2026-11-02"), now: NOW, dedupeKey: "a" });
    expect(r.ok).toBe(false);
  });
});
