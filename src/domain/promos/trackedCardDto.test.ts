import { describe, expect, it } from "vitest";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { buildTrackedSnapshotFixture } from "./noSweatSnapshot.fixture";
import { lostTotal } from "./noSweatSettle";
import { buildTrackedCardDTO, WAITING_REMINDER_AFTER_HOURS, type TrackedCardSource } from "./trackedCardDto";

const now = new Date("2026-10-01T12:00:00.000Z");
const events = buildFixtureEvents(now);
const hedgeBookKeys = new Set(usableOddsBooks().map((b) => b.key));
const bookNames = new Map<string, string>([["draftkings", "DraftKings"]]);

function plusMs(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

function source(overrides: Partial<TrackedCardSource> = {}, commence = "2026-10-01T10:00:00.000Z"): TrackedCardSource {
  const snap = buildTrackedSnapshotFixture();
  snap.game.commenceTime = commence;
  return { promoId: 101, state: "tracking", correction: null, snapshot: snap, ...overrides };
}

const build = (row: TrackedCardSource, at: Date) =>
  buildTrackedCardDTO(row, { now: at, moneylineEvents: events, hedgeBookKeys, bookNames });

describe("buildTrackedCardDTO", () => {
  it("before kickoff: not past kickoff, no reminder, no refund options", () => {
    const commence = new Date("2026-10-02T00:00:00.000Z");
    const dto = build(source({}, commence.toISOString()), now);
    expect(dto.pastKickoff).toBe(false);
    expect(dto.showWaitingReminder).toBe(false);
    expect(dto.refundOptions).toEqual([]);
  });

  it("waiting reminder appears exactly 6h after kickoff", () => {
    expect(WAITING_REMINDER_AFTER_HOURS).toBe(6);
    const commence = new Date("2026-10-01T00:00:00.000Z");
    const row = source({}, commence.toISOString());
    const before = build(row, plusMs(commence, 5 * 3600_000 + 59 * 60_000));
    expect(before.pastKickoff).toBe(true);
    expect(before.showWaitingReminder).toBe(false);
    expect(build(row, plusMs(commence, 6 * 3600_000)).showWaitingReminder).toBe(true);
  });

  it("awaiting_refund caps the refund and prices up to 3 options consistently", () => {
    const correction = {
      qualifyingStake: "30.00",
      qualifyingOddsAmerican: 150,
      hedgeStake: "28.00",
      hedgeOddsAmerican: -160,
    };
    const row = source({ state: "awaiting_refund", correction });
    row.snapshot.promo.refundCap = "25.00";
    row.snapshot.promo.bookKey = "draftkings";
    const dto = build(row, now);
    expect(dto.refundAmount).toBe("25.00");
    expect(dto.lostStake).toBe("30.00");
    expect(dto.showWaitingReminder).toBe(false);
    expect(dto.hedgeWinningsOnFirstBet).toBe("17.50");
    expect(dto.refundOptions.length).toBeGreaterThan(0);
    expect(dto.refundOptions.length).toBeLessThanOrEqual(3);
    for (const o of dto.refundOptions) {
      expect(o.allInTotal).toBe(lostTotal(row.snapshot, correction, o.profit));
      expect(o.allInTotal).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it("awaiting_refund with no refund-book odds gives no options", () => {
    const row = source({ state: "awaiting_refund" });
    row.snapshot.promo.bookKey = "no_such_book";
    expect(build(row, now).refundOptions).toEqual([]);
  });

  it("returns money as 2dp strings", () => {
    const dto = build(source(), now);
    for (const v of [dto.qualifying.stake, dto.hedge.stake, dto.refundAmount, dto.lostStake, dto.hedgeWinningsOnFirstBet]) {
      expect(v).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});
