import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankOptions } from "@/domain/promos/rankPromoHedges";

const { mockRecord, mockCompute, mockBuild } = vi.hoisted(() => ({
  mockRecord: vi.fn(),
  mockCompute: vi.fn(),
  mockBuild: vi.fn(),
}));
vi.mock("@/db/memberObservations", () => ({ recordMemberProfitObservations: mockRecord }));
vi.mock("@/domain/promos/memberFeed", () => ({ computeMemberFeed: mockCompute }));
vi.mock("@/domain/promos/memberObservationEntries", () => ({ buildMemberObservationEntries: mockBuild }));

import { recordMemberFeedObservations } from "./memberFeedRecording";

const NOW = new Date("2026-07-15T18:00:00Z");
const rankOpts = { precision: "cents" } as unknown as RankOptions;
const base = { userId: 7, now: NOW, feedPromos: [], rankOpts, userBookSet: new Set(["a"]) };

beforeEach(() => {
  vi.clearAllMocks();
  mockCompute.mockReturnValue({ singles: ["s"], chosenPairs: ["p"] });
  mockBuild.mockReturnValue([{ entry: true }]);
  mockRecord.mockResolvedValue(true);
});

describe("recordMemberFeedObservations", () => {
  it("ranks at whole precision even when the view is cents", async () => {
    await expect(recordMemberFeedObservations(base)).resolves.toBe(true);
    expect(mockCompute.mock.calls[0][0].rankOpts.precision).toBe("whole");
    expect(mockRecord).toHaveBeenCalledWith(7, [{ entry: true }], NOW);
  });

  it("reuses a passed wholeFeed instead of re-ranking", async () => {
    await recordMemberFeedObservations({ ...base, wholeFeed: { singles: [], chosenPairs: [] } });
    expect(mockCompute).not.toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it("returns false without rejecting when ranking throws or the recorder rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockCompute.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(recordMemberFeedObservations(base)).resolves.toBe(false);
    mockRecord.mockRejectedValueOnce(new Error("db"));
    await expect(recordMemberFeedObservations(base)).resolves.toBe(false);
    spy.mockRestore();
  });

  it("passes through a false from the recorder", async () => {
    mockRecord.mockResolvedValueOnce(false);
    await expect(recordMemberFeedObservations(base)).resolves.toBe(false);
  });
});
