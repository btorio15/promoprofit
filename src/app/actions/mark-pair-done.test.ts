import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PairRowDTO } from "@/domain/promos/pairRowDto";
import type { DonePromoTerms } from "@/domain/promos/doneSnapshot";

const { mockRequireUser, mockMarkPairDone, mockUnmarkPairDone, mockComputeMemberPairState } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockMarkPairDone: vi.fn(),
  mockUnmarkPairDone: vi.fn(),
  mockComputeMemberPairState: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoTracking", () => ({ markPairDone: mockMarkPairDone, unmarkPairDone: mockUnmarkPairDone }));
vi.mock("@/db/memberPairState", () => ({ computeMemberPairState: mockComputeMemberPairState }));

import { revalidatePath } from "next/cache";
import { markPairDoneAction, unmarkPairDoneAction } from "./mark-pair-done";

const mockRevalidatePath = vi.mocked(revalidatePath);

const leg = (promoId: number, bookKey: string, stake: string) => ({
  promoId,
  bookKey,
  bookName: bookKey,
  promoTypeLabel: "Boost" as const,
  promoTitle: "50% profit boost",
  selectionLabel: "Team",
  oddsAmerican: -110,
  stake,
  payout: "122.73",
  capNote: null,
  bonusNote: null,
});

const row: PairRowDTO = {
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
  legA: leg(1, "draftkings", "50.00"),
  legB: leg(2, "fanduel", "50.00"),
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
};

const termsFor = (id: number, bookKey: string): DonePromoTerms => ({
  id,
  bookKey,
  promoType: "profit_boost",
  title: "50% profit boost",
  boostPercent: "50.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "50.00",
  winningsCap: null,
  minOddsAmerican: null,
});

const pairState = (r: PairRowDTO | null = row) => ({
  kind: "pair" as const,
  row: r,
  termsA: termsFor(1, "draftkings"),
  termsB: termsFor(2, "fanduel"),
  oddsFetchedAt: { moneyline: new Date("2026-09-29T14:00:00.000Z"), spreadsTotals: null },
});

const input = {
  promoIdA: 1,
  promoIdB: 2,
  precision: "cents",
  expectedGuaranteedProfit: "22.73",
  expectedStakeA: "50.00",
  expectedStakeB: "50.00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 7, email: "f@example.com", displayName: "F" });
  mockMarkPairDone.mockResolvedValue(undefined);
  mockUnmarkPairDone.mockResolvedValue(undefined);
  mockComputeMemberPairState.mockResolvedValue(pairState());
});

describe("markPairDoneAction", () => {
  it("calls requireUser first: a rejection means nothing else runs", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauthorized"));
    await expect(markPairDoneAction(input)).rejects.toThrow("unauthorized");
    expect(mockComputeMemberPairState).not.toHaveBeenCalled();
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });

  it("returns invalid for bad input and writes nothing", async () => {
    expect(await markPairDoneAction({ ...input, userId: 3 })).toEqual({ status: "invalid" });
    expect(await markPairDoneAction({ ...input, promoIdB: 1 })).toEqual({ status: "invalid" });
    expect(mockComputeMemberPairState).not.toHaveBeenCalled();
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });

  it("returns not_found when a promo is not active", async () => {
    mockComputeMemberPairState.mockResolvedValue({ kind: "not_active" });
    const res = await markPairDoneAction(input);
    expect(res.status).toBe("not_found");
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });

  it("returns odds_changed when profit differs", async () => {
    mockComputeMemberPairState.mockResolvedValue(pairState({ ...row, guaranteedProfit: "20.00" }));
    const res = await markPairDoneAction(input);
    expect(res.status).toBe("odds_changed");
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });

  it("returns odds_changed when either stake differs, or the pair is gone", async () => {
    mockComputeMemberPairState.mockResolvedValue(pairState({ ...row, legA: leg(1, "draftkings", "49.00") }));
    expect((await markPairDoneAction(input)).status).toBe("odds_changed");
    mockComputeMemberPairState.mockResolvedValue(pairState({ ...row, legB: leg(2, "fanduel", "48.00") }));
    expect((await markPairDoneAction(input)).status).toBe("odds_changed");
    mockComputeMemberPairState.mockResolvedValue(pairState(null));
    expect((await markPairDoneAction(input)).status).toBe("odds_changed");
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });

  it("writes both rows once on success, keyed by the session user", async () => {
    const res = await markPairDoneAction(input);
    expect(res).toEqual({ status: "ok", profitExtracted: "22.73" });
    expect(mockMarkPairDone).toHaveBeenCalledTimes(1);
    const arg = mockMarkPairDone.mock.calls[0][0];
    expect(arg.userId).toBe(7);
    expect(arg.primary.promoId).toBe(1);
    expect(arg.primary.profitExtracted).toBe("22.73");
    expect(arg.member.promoId).toBe(2);
    expect(arg.member.profitExtracted).toBe("0.00");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns save_failed when the write throws", async () => {
    mockMarkPairDone.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await markPairDoneAction(input)).toEqual({ status: "save_failed" });
    spy.mockRestore();
  });

  it("is idempotent: an already-done identical pair reports ok without writing", async () => {
    mockComputeMemberPairState.mockResolvedValue({ kind: "already_done_pair", profitExtracted: "22.73" });
    expect(await markPairDoneAction(input)).toEqual({ status: "ok", profitExtracted: "22.73" });
    expect(mockMarkPairDone).not.toHaveBeenCalled();
  });
});

describe("unmarkPairDoneAction", () => {
  it("calls requireUser first: a rejection means nothing is deleted", async () => {
    mockRequireUser.mockRejectedValue(new Error("unauthorized"));
    await expect(unmarkPairDoneAction({ promoId: 1 })).rejects.toThrow("unauthorized");
    expect(mockUnmarkPairDone).not.toHaveBeenCalled();
  });

  it("returns invalid for bad input (including a client-supplied userId)", async () => {
    expect(await unmarkPairDoneAction({ promoId: 1, userId: 3 })).toEqual({ status: "invalid" });
    expect(await unmarkPairDoneAction({ promoId: "x" })).toEqual({ status: "invalid" });
    expect(mockUnmarkPairDone).not.toHaveBeenCalled();
  });

  it("undoes with the session user id and that promo id", async () => {
    expect(await unmarkPairDoneAction({ promoId: 2 })).toEqual({ status: "ok" });
    expect(mockUnmarkPairDone).toHaveBeenCalledWith({ userId: 7, promoId: 2 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });
});
