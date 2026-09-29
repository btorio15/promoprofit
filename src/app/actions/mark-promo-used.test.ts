import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromoRowDTO, UnprofitablePromoRowDTO } from "@/domain/promos/dto";
import type { DonePromoTerms } from "@/domain/promos/doneSnapshot";

const { mockRequireUser, mockMarkPromoDone, mockUnmarkPromoUsed, mockComputeMemberPromoState } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockMarkPromoDone: vi.fn(),
  mockUnmarkPromoUsed: vi.fn(),
  mockComputeMemberPromoState: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoTracking", () => ({
  markPromoDone: mockMarkPromoDone,
  unmarkPromoUsed: mockUnmarkPromoUsed,
}));
vi.mock("@/db/memberPromoState", () => ({ computeMemberPromoState: mockComputeMemberPromoState }));

import { revalidatePath } from "next/cache";
import { markPromoUsedAction, unmarkPromoUsedAction } from "./mark-promo-used";

const mockRevalidatePath = vi.mocked(revalidatePath);

const terms: DonePromoTerms = {
  id: 5,
  bookKey: "draftkings",
  promoType: "profit_boost",
  title: "10% profit boost",
  boostPercent: "10.00",
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: null,
  maxStake: "50.00",
  winningsCap: null,
  minOddsAmerican: null,
};
const oddsFetchedAt = { moneyline: new Date("2026-09-29T14:00:00.000Z"), spreadsTotals: null };

const hedgeRow = {
  rowKey: "promo-5",
  promoId: 5,
  promoType: "profit_boost",
  promoTypeLabel: "Boost",
  sportLabel: "NFL",
  commenceTime: "2026-09-30T00:20:00.000Z",
  homeTeam: "Home",
  awayTeam: "Away",
  marketBadge: "Moneyline",
  scopeLabel: "Away @ Home",
  candidatesEvaluated: 1,
  autoMatched: false,
  finePrintNote: null,
  claimHint: null,
  tieRisk: false,
  sameBook: false,
  promo: { bookKey: "draftkings", bookName: "DraftKings", selectionLabel: "Away", oddsAmerican: 150, oddsDerived: false },
  hedge: { bookKey: "fanduel", bookName: "FanDuel", selectionLabel: "Home", oddsAmerican: -140 },
  promoStake: "50.00",
  hedgeStake: "60.00",
  totalStaked: "110.00",
  promoPayout: "137.50",
  hedgePayout: "120.00",
  netIfPromoWins: "27.50",
  netIfHedgeWins: "10.00",
  guaranteedProfit: "12.34",
  rateLabel: "ROI",
  ratePct: "11.22",
  capNote: null,
  attribution: null,
  worstCase: true,
  hasPromoBook: true,
} as PromoRowDTO;

const noHedgeRow: UnprofitablePromoRowDTO = {
  rowKey: "unprofitable-promo-5",
  promoId: 5,
  promoType: "profit_boost",
  promoTypeLabel: "Boost",
  bookKey: "draftkings",
  bookName: "DraftKings",
  title: "10% profit boost",
  scopeLabel: "Away @ Home",
  autoMatched: false,
  bestGuaranteedProfit: "-0.65",
  note: "No profitable hedge right now (best: −$0.65)",
  hasPromoBook: true,
};

const hedgeState = { kind: "hedge", terms, row: hedgeRow, oddsFetchedAt };
const noHedgeState = { kind: "no_hedge", terms, row: noHedgeRow, oddsFetchedAt };

const validInput = { promoId: 5, precision: "cents", expectedGuaranteedProfit: "12.34" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: 7, email: "friend@example.com", displayName: "Friend" });
  mockMarkPromoDone.mockResolvedValue(undefined);
});

describe("markPromoUsedAction (mark done; T-igk-01, T-igk-02)", () => {
  it("rejects when logged out, before any DB call", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(markPromoUsedAction(validInput)).rejects.toThrow("NEXT_REDIRECT");

    expect(mockComputeMemberPromoState).not.toHaveBeenCalled();
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
  });

  it.each([
    ["empty object", {}],
    ["string promoId", { promoId: "1", precision: "cents", expectedGuaranteedProfit: null }],
    ["missing precision", { promoId: 1, expectedGuaranteedProfit: null }],
    ["bad precision", { promoId: 1, precision: "half", expectedGuaranteedProfit: null }],
    ["numeric expected profit", { promoId: 1, precision: "cents", expectedGuaranteedProfit: 12.34 }],
    ["non-2dp expected profit", { promoId: 1, precision: "cents", expectedGuaranteedProfit: "12.3" }],
    ["extra userId (IDOR)", { promoId: 1, precision: "cents", expectedGuaranteedProfit: null, userId: 2 }],
  ])("rejects %s without any DB call", async (_label, input) => {
    const result = await markPromoUsedAction(input);

    expect(result).toEqual({ status: "invalid" });
    expect(mockComputeMemberPromoState).not.toHaveBeenCalled();
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
  });

  it("recomputes with the SESSION userId, never an input-supplied user", async () => {
    mockComputeMemberPromoState.mockResolvedValue(hedgeState);

    await markPromoUsedAction(validInput);

    expect(mockComputeMemberPromoState).toHaveBeenCalledWith({
      userId: 7,
      promoId: 5,
      precision: "cents",
      now: expect.any(Date),
    });
  });

  it("not_active -> not_found, no insert, no revalidate", async () => {
    mockComputeMemberPromoState.mockResolvedValue({ kind: "not_active" });

    const result = await markPromoUsedAction(validInput);

    expect(result).toEqual({ status: "not_found", message: "This promo is no longer active." });
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("hedge state with matching expected profit saves the server snapshot and profit", async () => {
    mockComputeMemberPromoState.mockResolvedValue(hedgeState);

    const result = await markPromoUsedAction(validInput);

    expect(result).toEqual({ status: "ok", profitExtracted: "12.34" });
    expect(mockMarkPromoDone).toHaveBeenCalledTimes(1);
    const args = mockMarkPromoDone.mock.calls[0][0];
    expect(args.userId).toBe(7);
    expect(args.promoId).toBe(5);
    expect(args.profitExtracted).toBe("12.34");
    expect(args.snapshot.kind).toBe("hedge");
    expect(args.snapshot.row.guaranteedProfit).toBe("12.34");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("rejects with odds_changed when the displayed profit no longer matches", async () => {
    mockComputeMemberPromoState.mockResolvedValue(hedgeState);

    const result = await markPromoUsedAction({ ...validInput, expectedGuaranteedProfit: "12.00" });

    expect(result.status).toBe("odds_changed");
    if (result.status !== "odds_changed") throw new Error("unreachable");
    expect(result.currentGuaranteedProfit).toBe("12.34");
    expect(result.message).toContain("$12.34");
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
  });

  it("rejects when the member saw a greyed row but the promo is now profitable", async () => {
    mockComputeMemberPromoState.mockResolvedValue(hedgeState);

    const result = await markPromoUsedAction({ ...validInput, expectedGuaranteedProfit: null });

    expect(result.status).toBe("odds_changed");
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
  });

  it("rejects when the member saw a profit but the promo is now greyed out", async () => {
    mockComputeMemberPromoState.mockResolvedValue(noHedgeState);

    const result = await markPromoUsedAction({ ...validInput, expectedGuaranteedProfit: "5.00" });

    expect(result).toMatchObject({ status: "odds_changed", currentGuaranteedProfit: null });
    expect(mockMarkPromoDone).not.toHaveBeenCalled();
  });

  it("a greyed row can be marked done at $0.00 with a no_hedge snapshot", async () => {
    mockComputeMemberPromoState.mockResolvedValue(noHedgeState);

    const result = await markPromoUsedAction({ ...validInput, expectedGuaranteedProfit: null });

    expect(result).toEqual({ status: "ok", profitExtracted: "0.00" });
    const args = mockMarkPromoDone.mock.calls[0][0];
    expect(args.profitExtracted).toBe("0.00");
    expect(args.snapshot.kind).toBe("no_hedge");
    expect(args.snapshot.note).toBe("No profitable hedge right now (best: −$0.65)");
  });
});

describe("unmarkPromoUsedAction (T-igk-04)", () => {
  it("rejects when logged out, before any DB call", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(unmarkPromoUsedAction({ promoId: 5 })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockUnmarkPromoUsed).not.toHaveBeenCalled();
  });

  it("rejects an extra 'userId' field", async () => {
    const result = await unmarkPromoUsedAction({ promoId: 1, userId: 2 });

    expect(result).toEqual({ status: "invalid" });
    expect(mockUnmarkPromoUsed).not.toHaveBeenCalled();
  });

  it("deletes with the SESSION userId and revalidates '/'", async () => {
    mockUnmarkPromoUsed.mockResolvedValue(undefined);

    const result = await unmarkPromoUsedAction({ promoId: 5 });

    expect(result).toEqual({ status: "ok" });
    expect(mockUnmarkPromoUsed).toHaveBeenCalledWith({ userId: 7, promoId: 5 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });
});
