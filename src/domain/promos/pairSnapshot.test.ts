import { describe, expect, it } from "vitest";
import type { PairRowDTO } from "./pairRowDto";
import type { DonePromoTerms } from "./doneSnapshot";
import { MarkPairDoneInputSchema } from "./reviewInput";
import {
  DonePairSnapshotSchema,
  PairMemberSnapshotSchema,
  buildPairSnapshot,
  isSamePairDisplay,
} from "./pairSnapshot";

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
  legA: {
    promoId: 1,
    bookKey: "draftkings",
    bookName: "DraftKings",
    promoTypeLabel: "Boost",
    promoTitle: "50% profit boost",
    selectionLabel: "DEN Broncos",
    oddsAmerican: -110,
    stake: "50.00",
    payout: "122.73",
    capNote: null,
    bonusNote: null,
  },
  legB: {
    promoId: 2,
    bookKey: "fanduel",
    bookName: "FanDuel",
    promoTypeLabel: "Boost",
    promoTitle: "50% profit boost",
    selectionLabel: "LA Rams",
    oddsAmerican: -110,
    stake: "50.00",
    payout: "122.73",
    capNote: null,
    bonusNote: null,
  },
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

const validInput = {
  promoIdA: 1,
  promoIdB: 2,
  precision: "cents",
  expectedGuaranteedProfit: "22.73",
  expectedStakeA: "50.00",
  expectedStakeB: "50.00",
};

describe("MarkPairDoneInputSchema", () => {
  it("accepts a valid input", () => {
    expect(MarkPairDoneInputSchema.safeParse(validInput).success).toBe(true);
  });
  it("rejects equal ids, extra keys, bad money strings and non-positive ids", () => {
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, promoIdB: 1 }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, userId: 9 }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, expectedStakeA: "50" }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, expectedGuaranteedProfit: "22.7" }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, promoIdA: 0 }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, promoIdA: -3 }).success).toBe(false);
  });
});

describe("buildPairSnapshot", () => {
  const now = new Date("2026-09-29T15:00:00.000Z");
  const built = buildPairSnapshot(
    { row, termsA: termsFor(1, "draftkings"), termsB: termsFor(2, "fanduel") },
    {
      now,
      precision: "cents",
      oddsFetchedAt: { moneyline: new Date("2026-09-29T14:00:00.000Z"), spreadsTotals: null },
    },
  );

  it("puts the pair snapshot and profit on the primary row", () => {
    expect(built.primary.promoId).toBe(1);
    expect(built.primary.profitExtracted).toBe("22.73");
    expect(built.primary.snapshot.kind).toBe("pair");
    expect(built.primary.snapshot.pairPromoIds).toEqual([1, 2]);
    expect(built.primary.snapshot.oddsFetchedAt.moneyline).toBe("2026-09-29T14:00:00.000Z");
    expect(DonePairSnapshotSchema.safeParse(built.primary.snapshot).success).toBe(true);
    expect(DonePairSnapshotSchema.safeParse(JSON.parse(JSON.stringify(built.primary.snapshot))).success).toBe(true);
  });

  it("puts a $0.00 marker on the member row", () => {
    expect(built.member.promoId).toBe(2);
    expect(built.member.profitExtracted).toBe("0.00");
    expect(built.member.snapshot).toEqual({ version: 1, kind: "pair_member", pairedWithPromoId: 1 });
    expect(PairMemberSnapshotSchema.safeParse(built.member.snapshot).success).toBe(true);
  });
});

describe("isSamePairDisplay (D-23)", () => {
  const expected = { profit: "22.73", stakeA: "50.00", stakeB: "50.00" };
  it("is true when profit and both stakes match to the cent", () => {
    expect(isSamePairDisplay(expected, row)).toBe(true);
  });
  it("is false when profit is equal but stake A differs", () => {
    const moved = { ...row, legA: { ...row.legA, stake: "49.99" } };
    expect(isSamePairDisplay(expected, moved)).toBe(false);
  });
  it("is false when stake B or profit differs, or the pair is gone", () => {
    expect(isSamePairDisplay(expected, { ...row, legB: { ...row.legB, stake: "51.00" } })).toBe(false);
    expect(isSamePairDisplay(expected, { ...row, guaranteedProfit: "22.74" })).toBe(false);
    expect(isSamePairDisplay(expected, null)).toBe(false);
  });
});
