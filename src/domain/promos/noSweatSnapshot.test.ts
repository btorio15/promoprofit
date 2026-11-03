import { describe, expect, it } from "vitest";
import {
  NoSweatCorrectionSchema,
  NoSweatDoneSnapshotSchema,
  TrackedNoSweatSnapshotSchema,
} from "./noSweatSnapshot";
import { buildDoneSnapshotFixture, buildTrackedSnapshotFixture } from "./noSweatSnapshot.fixture";

describe("TrackedNoSweatSnapshotSchema", () => {
  it("accepts the fixture", () => {
    expect(TrackedNoSweatSnapshotSchema.safeParse(buildTrackedSnapshotFixture()).success).toBe(true);
  });
  it("rejects version 1", () => {
    expect(TrackedNoSweatSnapshotSchema.safeParse({ ...buildTrackedSnapshotFixture(), version: 1 }).success).toBe(false);
  });
  it("rejects a non-2dp money field", () => {
    const f = buildTrackedSnapshotFixture();
    const bad = { ...f, qualifying: { ...f.qualifying, stake: "10.5" } };
    expect(TrackedNoSweatSnapshotSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a missing commenceTime", () => {
    const f = buildTrackedSnapshotFixture();
    const { commenceTime: _omit, ...game } = f.game;
    expect(TrackedNoSweatSnapshotSchema.safeParse({ ...f, game }).success).toBe(false);
  });
});

describe("NoSweatCorrectionSchema", () => {
  const ok = { qualifyingStake: "25.00", qualifyingOddsAmerican: 150, hedgeStake: "20.00", hedgeOddsAmerican: -160 };
  it("accepts a valid correction", () => {
    expect(NoSweatCorrectionSchema.safeParse(ok).success).toBe(true);
  });
  it.each([
    ["zero stake", { ...ok, qualifyingStake: "0.00" }],
    ["stake over cap", { ...ok, hedgeStake: "10000.01" }],
    ["fractional odds", { ...ok, qualifyingOddsAmerican: 150.5 }],
    ["odds 50", { ...ok, qualifyingOddsAmerican: 50 }],
    ["odds -99", { ...ok, hedgeOddsAmerican: -99 }],
    ["extra key", { ...ok, userId: 1 }],
  ])("rejects %s", (_n, input) => {
    expect(NoSweatCorrectionSchema.safeParse(input).success).toBe(false);
  });
});

describe("NoSweatDoneSnapshotSchema", () => {
  const refund = {
    optionKey: "k",
    eventId: "e",
    refundBookKey: "draftkings",
    amount: "50.00",
    bonusSelectionLabel: "A",
    bonusOddsAmerican: 200,
    hedgeBookKey: "fanduel",
    hedgeSelectionLabel: "B",
    hedgeOddsAmerican: -200,
    hedgeStake: "30.00",
    profit: "35.00",
  };
  it.each(["won", "push", "void"] as const)("accepts %s with null refund", (outcome) => {
    expect(NoSweatDoneSnapshotSchema.safeParse(buildDoneSnapshotFixture({ outcome })).success).toBe(true);
  });
  it("requires refund when lost", () => {
    expect(NoSweatDoneSnapshotSchema.safeParse(buildDoneSnapshotFixture({ outcome: "lost" })).success).toBe(false);
    expect(NoSweatDoneSnapshotSchema.safeParse(buildDoneSnapshotFixture({ outcome: "lost", refund })).success).toBe(true);
  });
  it("rejects refund when not lost", () => {
    expect(NoSweatDoneSnapshotSchema.safeParse(buildDoneSnapshotFixture({ outcome: "won", refund })).success).toBe(false);
  });
  it("rejects unknown outcome", () => {
    expect(NoSweatDoneSnapshotSchema.safeParse({ ...buildDoneSnapshotFixture(), outcome: "pending" }).success).toBe(false);
  });
});
