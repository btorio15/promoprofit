import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { usableOddsBooks } from "@/config/books";
import { buildFixtureEvents } from "@/test/fixtures/oddsEvents";
import { rankRefundOpportunities } from "@/domain/hedge/conversionRate";
import { buildTrackedSnapshotFixture } from "./noSweatSnapshot.fixture";
import { RefundConversionSchema, type NoSweatCorrection } from "./noSweatSnapshot";
import {
  PUSH_OR_VOID_PROFIT,
  effectiveBets,
  lostTotal,
  refundAmountFor,
  settleProfit,
  toRefundConversion,
  wonProfit,
} from "./noSweatSettle";

const snap = buildTrackedSnapshotFixture();
const corr = (o: Partial<NoSweatCorrection> = {}): NoSweatCorrection => ({
  qualifyingStake: "25.00",
  qualifyingOddsAmerican: 150,
  hedgeStake: "20.00",
  hedgeOddsAmerican: -160,
  ...o,
});

describe("wonProfit", () => {
  it("uses the estimate without a correction", () => {
    expect(wonProfit(snap, null)).toBe(snap.estimate.profitIfWin);
  });
  it("recomputes from corrected stakes/odds", () => {
    expect(wonProfit(snap, corr())).toBe("17.50");
  });
});

describe("refundAmountFor", () => {
  it("is min(actual stake, cap)", () => {
    const s = buildTrackedSnapshotFixture({ promo: { ...snap.promo, refundCap: "25.00" } });
    expect(refundAmountFor(s, corr({ qualifyingStake: "30.00" }))).toBe("25.00");
    expect(refundAmountFor(s, corr({ qualifyingStake: "10.00" }))).toBe("10.00");
    expect(refundAmountFor(snap, null)).toBe("50.00");
  });
});

describe("effectiveBets", () => {
  it("falls back to the snapshot", () => {
    const e = effectiveBets(snap, null);
    expect(e.qualifyingStake.toFixed(2)).toBe("50.00");
    expect(e.hedgeOddsAmerican).toBe(-160);
  });
});

describe("lostTotal", () => {
  it("matches the solver estimate with no correction", () => {
    // The shared fixture's estimate numbers are illustrative; build a
    // solver-consistent snapshot: hedge 47.00 @ -160 pays floor(76.375) = 76.37,
    // so lose = 76.37 - 47.00 - 50.00 + 35.00 = 14.37.
    const consistent = buildTrackedSnapshotFixture({
      estimate: { ...snap.estimate, profitIfWin: "28.00", profitIfLose: "14.37" },
    });
    expect(lostTotal(consistent, null, consistent.conversion.refundValue)).toBe("14.37");
    expect(wonProfit(consistent, corr({ qualifyingStake: "50.00", hedgeStake: "47.00" }))).toBe("28.00");
  });
  it("hand case 52.00 - 20.00 - 25.00 + 18.40 = 25.40", () => {
    expect(lostTotal(snap, corr({ hedgeOddsAmerican: 160 }), "18.40")).toBe("25.40");
  });
});

describe("settleProfit", () => {
  it("push/void default to 0.00", () => {
    expect(PUSH_OR_VOID_PROFIT).toBe("0.00");
    expect(settleProfit({ outcome: "push", snapshot: snap, correction: null }).profit).toBe("0.00");
    expect(settleProfit({ outcome: "void", snapshot: snap, correction: null }).profit).toBe("0.00");
  });
  it("override wins", () => {
    const r = settleProfit({ outcome: "push", snapshot: snap, correction: null, overrideProfit: "-1.25" });
    expect(r).toEqual({ profit: "-1.25", profitSource: "override" });
  });
  it("won computed vs corrected", () => {
    expect(settleProfit({ outcome: "won", snapshot: snap, correction: null })).toEqual({
      profit: snap.estimate.profitIfWin,
      profitSource: "computed",
    });
    expect(settleProfit({ outcome: "won", snapshot: snap, correction: corr() })).toEqual({
      profit: "17.50",
      profitSource: "corrected",
    });
  });
  it("rejects bad overrides and odds", () => {
    expect(() => settleProfit({ outcome: "push", snapshot: snap, correction: null, overrideProfit: "1.255" })).toThrow(RangeError);
    expect(() => settleProfit({ outcome: "push", snapshot: snap, correction: null, overrideProfit: "10000.01" })).toThrow(RangeError);
    expect(() => settleProfit({ outcome: "won", snapshot: snap, correction: corr({ hedgeOddsAmerican: 50 }) })).toThrow(RangeError);
  });
});

describe("toRefundConversion", () => {
  it("maps to the schema", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const events = buildFixtureEvents(now);
    const keys = new Set(usableOddsBooks().map((b) => b.key));
    const [opp] = rankRefundOpportunities({
      events, now, refundBookKey: "draftkings", amount: new Decimal(100), hedgeBookKeys: keys, limit: 1,
    });
    const rc = toRefundConversion(opp, "100.00");
    expect(RefundConversionSchema.parse(rc)).toEqual(rc);
    expect(rc.optionKey).toBe(`${opp.eventId}|${opp.bonus.team} ML|${opp.hedge.bookKey}`);
    expect(rc.profit).toBe(opp.result.guaranteedProfit.toFixed(2));
  });
});
