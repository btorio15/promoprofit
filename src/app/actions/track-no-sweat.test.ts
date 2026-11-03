import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { buildDoneSnapshotFixture, buildTrackedSnapshotFixture } from "@/domain/promos/noSweatSnapshot.fixture";

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidate: vi.fn(),
  loadCtx: vi.fn(),
  priceOne: vi.fn(),
  getLowProfile: vi.fn(),
  getTracked: vi.fn(),
  insertTracked: vi.fn(),
  deleteTracked: vi.fn(),
  markLost: vi.fn(),
  revert: vi.fn(),
  getCompletions: vi.fn(),
  markDone: vi.fn(),
  updateCompletion: vi.fn(),
  rankRefund: vi.fn(),
  buildSnapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/session", () => ({ requireUser: m.requireUser }));
vi.mock("@/db/feedContext", () => ({ loadMemberFeedContext: m.loadCtx }));
vi.mock("@/db/noSweatFeed", () => ({ priceOneNoSweat: m.priceOne }));
vi.mock("@/db/lowProfile", () => ({ getMemberLowProfile: m.getLowProfile }));
vi.mock("@/db/trackedNoSweats", () => ({
  getTrackedNoSweat: m.getTracked,
  insertTrackedNoSweat: m.insertTracked,
  deleteTrackedNoSweat: m.deleteTracked,
  markTrackedLost: m.markLost,
  revertTrackedToTracking: m.revert,
  isTrackedNoSweatsTableMissing: (err: unknown) => (err as { cause?: { code?: string } } | null)?.cause?.code === "42P01",
}));
vi.mock("@/db/promoTracking", () => ({
  getPromoCompletions: m.getCompletions,
  markPromoDone: m.markDone,
  updateNoSweatCompletion: m.updateCompletion,
}));
vi.mock("@/domain/hedge/conversionRate", () => ({ rankRefundOpportunities: m.rankRefund }));
vi.mock("@/domain/promos/buildTrackedSnapshot", () => ({ buildTrackedSnapshot: m.buildSnapshot }));

import {
  completeRefundNoSweatAction,
  correctSettledNoSweatAction,
  settleNoSweatAction,
  trackNoSweatAction,
  undoNoSweatOutcomeAction,
  untrackNoSweatAction,
} from "./track-no-sweat";

const USER_ID = 7;
const AFTER_KICKOFF = new Date("2026-11-08T23:00:00.000Z");
const BEFORE_KICKOFF = new Date("2026-11-08T12:00:00.000Z");
const snap = buildTrackedSnapshotFixture();

function trackedRow(over: Record<string, unknown> = {}) {
  return { promoId: 101, state: "tracking", trackedAt: new Date(), outcome: null, outcomeAt: null, correction: null, snapshot: snap, ...over };
}

function fakeOpp(over: { profit?: string } = {}) {
  return {
    eventId: "evt-2",
    bonus: { team: "Bears", bookKey: "draftkings", oddsAmerican: 200 },
    hedge: { team: "Packers", bookKey: "fanduel", oddsAmerican: -220 },
    result: { hedgeStake: new Decimal("30"), guaranteedProfit: new Decimal(over.profit ?? "35.00") },
  };
}

const CORRECTION = { qualifyingStake: "40.00", qualifyingOddsAmerican: 140, hedgeStake: "35.00", hedgeOddsAmerican: -150 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AFTER_KICKOFF);
  m.requireUser.mockResolvedValue({ userId: USER_ID, email: "a@b.c", displayName: "A" });
  m.loadCtx.mockResolvedValue({
    doneIds: new Set<number>(),
    bookNames: new Map(),
    oddsFetchedAt: null,
    moneylineEvents: [],
    rankOpts: { hedgeBookKeys: new Set(["fanduel"]) },
  });
  m.getLowProfile.mockResolvedValue({ oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false });
  m.getTracked.mockResolvedValue(null);
  m.insertTracked.mockResolvedValue(true);
  m.deleteTracked.mockResolvedValue(true);
  m.markLost.mockResolvedValue(true);
  m.revert.mockResolvedValue(true);
  m.getCompletions.mockResolvedValue([]);
  m.markDone.mockResolvedValue(undefined);
  m.updateCompletion.mockResolvedValue(undefined);
  m.buildSnapshot.mockReturnValue(snap);
  m.rankRefund.mockReturnValue([fakeOpp()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trackNoSweatAction", () => {
  const input = { promoId: 101, precision: "whole", expectedEstimate: "12.50" };
  const priced = { kind: "ok", entry: { e: 1 }, row: { estimatedProfit: "12.50" } };

  it("rejects an extra userId key", async () => {
    expect(await trackNoSweatAction({ ...input, userId: 1 })).toEqual({ status: "invalid" });
    expect(m.insertTracked).not.toHaveBeenCalled();
  });

  it("rejects without a session before any db access", async () => {
    m.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(trackNoSweatAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(m.loadCtx).not.toHaveBeenCalled();
  });

  it("inserts one tracked row on success, keyed by the session user", async () => {
    m.priceOne.mockResolvedValue(priced);
    expect(await trackNoSweatAction(input)).toEqual({ status: "ok" });
    expect(m.loadCtx.mock.calls[0][0]).toMatchObject({ userId: USER_ID, precision: "whole" });
    expect(m.priceOne.mock.calls[0][0]).toMatchObject({ userId: USER_ID, promoId: 101 });
    expect(m.insertTracked).toHaveBeenCalledTimes(1);
    expect(m.insertTracked.mock.calls[0][0]).toMatchObject({ userId: USER_ID, promoId: 101, snapshot: snap });
  });

  it("is idempotent when the promo is already tracked", async () => {
    m.getTracked.mockResolvedValue(trackedRow());
    expect(await trackNoSweatAction(input)).toEqual({ status: "ok" });
    expect(m.insertTracked).not.toHaveBeenCalled();
  });

  it("not_found when the promo is not an active no-sweat", async () => {
    m.priceOne.mockResolvedValue({ kind: "not_found" });
    expect(await trackNoSweatAction(input)).toEqual({ status: "not_found", message: "This promo is no longer active." });
  });

  it("not_found when already completed", async () => {
    m.loadCtx.mockResolvedValue({ doneIds: new Set([101]) });
    expect((await trackNoSweatAction(input)).status).toBe("not_found");
    expect(m.priceOne).not.toHaveBeenCalled();
  });

  it("odds_changed when the estimate moved", async () => {
    m.priceOne.mockResolvedValue({ ...priced, row: { estimatedProfit: "9.00" } });
    const res = await trackNoSweatAction(input);
    expect(res).toMatchObject({ status: "odds_changed", currentEstimate: "9.00" });
    expect(m.insertTracked).not.toHaveBeenCalled();
  });

  it("cant_track when it cannot be priced", async () => {
    m.priceOne.mockResolvedValue({ kind: "cant_price" });
    const res = await trackNoSweatAction(input);
    expect(res.status).toBe("cant_track");
    expect(m.insertTracked).not.toHaveBeenCalled();
  });

  it("unavailable when the table is missing", async () => {
    m.priceOne.mockResolvedValue(priced);
    m.insertTracked.mockRejectedValue({ cause: { code: "42P01" } });
    expect((await trackNoSweatAction(input)).status).toBe("unavailable");
  });
});

describe("settleNoSweatAction", () => {
  beforeEach(() => {
    m.getTracked.mockResolvedValue(trackedRow());
  });

  it("is too_early before kickoff and writes nothing", async () => {
    vi.setSystemTime(BEFORE_KICKOFF);
    expect(await settleNoSweatAction({ promoId: 101, outcome: "won" })).toEqual({ status: "too_early" });
    expect(m.markDone).not.toHaveBeenCalled();
    expect(m.markLost).not.toHaveBeenCalled();
  });

  it("won records the snapshot profit from the Track snapshot alone", async () => {
    const res = await settleNoSweatAction({ promoId: 101, outcome: "won" });
    expect(res).toMatchObject({ status: "ok", profitExtracted: "26.38" });
    expect(m.markDone).toHaveBeenCalledTimes(1);
    const arg = m.markDone.mock.calls[0][0];
    expect(arg).toMatchObject({ userId: USER_ID, promoId: 101, profitExtracted: "26.38" });
    expect(arg.snapshot).toMatchObject({ outcome: "won", profitSource: "computed", stage: "settled" });
    expect(m.loadCtx).not.toHaveBeenCalled();
  });

  it("won with a correction recomputes", async () => {
    const res = await settleNoSweatAction({ promoId: 101, outcome: "won", correction: CORRECTION });
    // winnings 40 * 1.40 = 56.00, minus hedge stake 35.00
    expect(res).toMatchObject({ status: "ok", profitExtracted: "21.00" });
    expect(m.markDone.mock.calls[0][0].snapshot).toMatchObject({ profitSource: "corrected", correction: CORRECTION });
  });

  it.each(["push", "void"] as const)("%s records 0.00", async (outcome) => {
    const res = await settleNoSweatAction({ promoId: 101, outcome });
    expect(res).toMatchObject({ status: "ok", profitExtracted: "0.00" });
    expect(m.markDone.mock.calls[0][0].snapshot).toMatchObject({ outcome, profitSource: "computed" });
  });

  it("push with an override records it as override", async () => {
    const res = await settleNoSweatAction({ promoId: 101, outcome: "push", overrideProfit: "-1.25" });
    expect(res).toMatchObject({ status: "ok", profitExtracted: "-1.25" });
    expect(m.markDone.mock.calls[0][0].snapshot).toMatchObject({ profitSource: "override", computedProfit: "0.00" });
  });

  it.each(["won", "lost"] as const)("override on %s is invalid", async (outcome) => {
    expect(await settleNoSweatAction({ promoId: 101, outcome, overrideProfit: "5.00" })).toEqual({ status: "invalid" });
    expect(m.markDone).not.toHaveBeenCalled();
    expect(m.markLost).not.toHaveBeenCalled();
  });

  it("lost moves to awaiting_refund with no completion row", async () => {
    const res = await settleNoSweatAction({ promoId: 101, outcome: "lost", correction: CORRECTION });
    expect(res).toMatchObject({ status: "ok", awaitingRefund: true, profitExtracted: null });
    expect(m.markLost).toHaveBeenCalledTimes(1);
    expect(m.markLost.mock.calls[0][0]).toMatchObject({ userId: USER_ID, promoId: 101, correction: CORRECTION });
    expect(m.markDone).not.toHaveBeenCalled();
  });

  it("refuses a row already awaiting_refund", async () => {
    m.getTracked.mockResolvedValue(trackedRow({ state: "awaiting_refund" }));
    expect(await settleNoSweatAction({ promoId: 101, outcome: "won" })).toEqual({ status: "invalid" });
    expect(m.markDone).not.toHaveBeenCalled();
  });

  it("refuses a row that already has a completion", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101 }]);
    expect(await settleNoSweatAction({ promoId: 101, outcome: "won" })).toEqual({ status: "invalid" });
    expect(m.markDone).not.toHaveBeenCalled();
  });

  it("not_found when not tracked", async () => {
    m.getTracked.mockResolvedValue(null);
    expect((await settleNoSweatAction({ promoId: 101, outcome: "won" })).status).toBe("not_found");
  });

  it("scopes every db read to the session user", async () => {
    await settleNoSweatAction({ promoId: 101, outcome: "won" });
    expect(m.getTracked).toHaveBeenCalledWith(USER_ID, 101);
    expect(m.getCompletions).toHaveBeenCalledWith(USER_ID);
  });
});

describe("completeRefundNoSweatAction", () => {
  const optionKey = "evt-2|Bears ML|fanduel";
  beforeEach(() => {
    m.getTracked.mockResolvedValue(trackedRow({ state: "awaiting_refund", outcome: "lost" }));
  });

  it("records hedge winnings minus lost stake plus the converted refund", async () => {
    const res = await completeRefundNoSweatAction({ promoId: 101, optionKey, expectedRefundProfit: "35.00" });
    // hedge payout floor(47 * 1.625) = 76.37; 76.37 - 47 - 50 + 35 = 14.37
    expect(res).toEqual({ status: "ok", profitExtracted: "14.37" });
    expect(m.rankRefund.mock.calls[0][0]).toMatchObject({ limit: 3, refundBookKey: "draftkings" });
    expect(m.markDone).toHaveBeenCalledTimes(1);
    const arg = m.markDone.mock.calls[0][0];
    expect(arg).toMatchObject({ userId: USER_ID, promoId: 101, profitExtracted: "14.37" });
    expect(arg.snapshot).toMatchObject({ outcome: "lost", refund: { optionKey, profit: "35.00" } });
  });

  it("odds_changed for an unknown option", async () => {
    const res = await completeRefundNoSweatAction({ promoId: 101, optionKey: "nope", expectedRefundProfit: "35.00" });
    expect(res.status).toBe("odds_changed");
    expect(m.markDone).not.toHaveBeenCalled();
  });

  it("odds_changed when the profit moved, returning fresh options", async () => {
    m.rankRefund.mockReturnValue([fakeOpp({ profit: "30.00" })]);
    const res = await completeRefundNoSweatAction({ promoId: 101, optionKey, expectedRefundProfit: "35.00" });
    expect(res).toMatchObject({ status: "odds_changed", refundOptions: [{ profit: "30.00", allInTotal: "9.37" }] });
    expect(m.markDone).not.toHaveBeenCalled();
  });

  it("only from awaiting_refund", async () => {
    m.getTracked.mockResolvedValue(trackedRow());
    expect(await completeRefundNoSweatAction({ promoId: 101, optionKey, expectedRefundProfit: "35.00" })).toEqual({ status: "invalid" });
  });
});

describe("undoNoSweatOutcomeAction", () => {
  it("reverts awaiting_refund to tracking for the session user", async () => {
    expect(await undoNoSweatOutcomeAction({ promoId: 101 })).toEqual({ status: "ok" });
    expect(m.revert.mock.calls[0][0]).toMatchObject({ userId: USER_ID, promoId: 101 });
  });

  it("is refused when a completion exists", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101 }]);
    expect(await undoNoSweatOutcomeAction({ promoId: 101 })).toEqual({ status: "invalid" });
    expect(m.revert).not.toHaveBeenCalled();
  });

  it("is invalid when nothing was reverted", async () => {
    m.revert.mockResolvedValue(false);
    expect(await undoNoSweatOutcomeAction({ promoId: 101 })).toEqual({ status: "invalid" });
  });
});

describe("untrackNoSweatAction", () => {
  it("deletes while tracking and no completion", async () => {
    expect(await untrackNoSweatAction({ promoId: 101 })).toEqual({ status: "ok" });
    expect(m.deleteTracked).toHaveBeenCalledWith({ userId: USER_ID, promoId: 101 });
  });

  it("is refused after a result", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101 }]);
    expect(await untrackNoSweatAction({ promoId: 101 })).toEqual({ status: "invalid" });
    expect(m.deleteTracked).not.toHaveBeenCalled();
  });

  it("is invalid when the row is no longer in tracking", async () => {
    m.deleteTracked.mockResolvedValue(false);
    expect(await untrackNoSweatAction({ promoId: 101 })).toEqual({ status: "invalid" });
  });
});

describe("correctSettledNoSweatAction", () => {
  it("recomputes a won settle from the stored snapshot and updates once", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101, snapshot: buildDoneSnapshotFixture() }]);
    const res = await correctSettledNoSweatAction({ promoId: 101, correction: CORRECTION });
    expect(res).toMatchObject({ status: "ok", profitExtracted: "21.00" });
    expect(m.updateCompletion).toHaveBeenCalledTimes(1);
    const arg = m.updateCompletion.mock.calls[0][0];
    expect(arg).toMatchObject({ userId: USER_ID, promoId: 101, profitExtracted: "21.00" });
    expect(arg.snapshot).toMatchObject({ profitSource: "corrected", correction: CORRECTION });
  });

  it("applies an override to a push", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101, snapshot: buildDoneSnapshotFixture({ outcome: "push", computedProfit: "0.00" }) }]);
    const res = await correctSettledNoSweatAction({ promoId: 101, overrideProfit: "-2.00" });
    expect(res).toMatchObject({ status: "ok", profitExtracted: "-2.00" });
    expect(m.updateCompletion.mock.calls[0][0].snapshot.profitSource).toBe("override");
  });

  it("not_found when there is no settled no-sweat snapshot", async () => {
    m.getCompletions.mockResolvedValue([{ promoId: 101, snapshot: null }]);
    expect((await correctSettledNoSweatAction({ promoId: 101, correction: CORRECTION })).status).toBe("not_found");
    expect(m.updateCompletion).not.toHaveBeenCalled();
  });
});
