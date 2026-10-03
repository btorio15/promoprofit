import { describe, expect, it } from "vitest";
import type { PairRowDTO } from "./pairRowDto";
import { sumProfitExtracted, toDonePromoDTO, toDoneRows, type DonePromoTerms } from "./doneSnapshot";
import { MarkPairDoneInputSchema } from "./reviewInput";
import {
  DonePairSnapshotSchema,
  PairMemberSnapshotSchema,
  buildPairSnapshot,
  isSamePairDisplay,
  toDonePairDTO,
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

describe("three-bet pair (quick-261003-fxf)", () => {
  const legC = {
    side: "B" as const,
    bookKey: "betrivers",
    bookName: "BetRivers",
    selectionLabel: "Home Team",
    oddsAmerican: -165,
    stake: "30.76",
    payout: "49.99",
    note: "Ordinary bet (no promo): tops up the Home Team side so the bigger boost can use its full cap.",
  };
  const ctx = {
    now: new Date("2026-09-29T15:00:00.000Z"),
    precision: "cents" as const,
    oddsFetchedAt: { moneyline: null, spreadsTotals: null },
  };
  const three = buildPairSnapshot(
    { row: { ...row, legC }, termsA: termsFor(1, "draftkings"), termsB: termsFor(2, "fanduel") },
    ctx,
  );

  it("buildPairSnapshot copies legC and the snapshot parses", () => {
    expect(three.primary.snapshot.row.legC).toEqual(legC);
    expect(DonePairSnapshotSchema.safeParse(JSON.parse(JSON.stringify(three.primary.snapshot))).success).toBe(true);
  });

  it("toDonePairDTO exposes legC", () => {
    const dto = toDonePairDTO(three.primary.snapshot);
    expect(dto.legC).toEqual({
      side: "B",
      bookName: "BetRivers",
      selectionLabel: "Home Team",
      oddsAmerican: -165,
      stake: "30.76",
      payout: "49.99",
    });
  });

  it("an old stored 2-leg snapshot (no legC key) still parses and gives legC null", () => {
    const old = JSON.parse(
      JSON.stringify(
        buildPairSnapshot({ row, termsA: termsFor(1, "draftkings"), termsB: termsFor(2, "fanduel") }, ctx).primary
          .snapshot,
      ),
    );
    expect("legC" in old.row).toBe(false);
    const parsed = DonePairSnapshotSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(toDonePairDTO(parsed.data!).legC).toBeNull();
  });

  it("isSamePairDisplay compares the third stake", () => {
    const current = { ...row, legC };
    const base = { profit: "22.73", stakeA: "50.00", stakeB: "50.00" };
    expect(isSamePairDisplay({ ...base, stakeC: "30.76" }, current)).toBe(true);
    expect(isSamePairDisplay({ ...base, stakeC: "30.75" }, current)).toBe(false);
    expect(isSamePairDisplay(base, current)).toBe(false);
    // No top-up: absent or "0.00" expected stakeC matches.
    expect(isSamePairDisplay(base, row)).toBe(true);
    expect(isSamePairDisplay({ ...base, stakeC: "0.00" }, row)).toBe(true);
    expect(isSamePairDisplay({ ...base, stakeC: "5.00" }, row)).toBe(false);
  });

  it("MarkPairDoneInputSchema accepts an optional expectedStakeC and still rejects unknown keys", () => {
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, expectedStakeC: "30.76" }).success).toBe(true);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, expectedStakeC: "30.7" }).success).toBe(false);
    expect(MarkPairDoneInputSchema.safeParse({ ...validInput, expectedStakeD: "1.00" }).success).toBe(false);
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

describe("Done read side (D-11)", () => {
  const names = new Map([["draftkings", "DraftKings"]]);
  const at = new Date("2026-09-29T16:00:00.000Z");
  const now = new Date("2026-09-29T15:00:00.000Z");
  const built = buildPairSnapshot(
    { row, termsA: termsFor(1, "draftkings"), termsB: termsFor(2, "fanduel") },
    { now, precision: "cents", oddsFetchedAt: { moneyline: now, spreadsTotals: null } },
  );
  const base = { completedAt: at, promoType: "profit_boost", promoParsed: {} };
  const primary = {
    ...base,
    promoId: 1,
    promoBookKey: "draftkings",
    snapshot: JSON.parse(JSON.stringify(built.primary.snapshot)),
    profitExtracted: built.primary.profitExtracted,
  };
  const member = {
    ...base,
    promoId: 2,
    promoBookKey: "fanduel",
    snapshot: JSON.parse(JSON.stringify(built.member.snapshot)),
    profitExtracted: "0.00",
  };

  it("maps a pair snapshot to a kind pair DTO carrying both legs and the pair profit", () => {
    const dto = toDonePromoDTO(primary, names);
    expect(dto.kind).toBe("pair");
    expect(dto.profitExtracted).toBe("22.73");
    expect(dto.pair?.legA.stake).toBe("50.00");
    expect(dto.pair?.legB.bookName).toBe("FanDuel");
    expect(dto.pair?.guaranteedProfit).toBe("22.73");
    expect(dto.pair?.pairPromoIds).toEqual([1, 2]);
  });

  it("toDoneRows lists the pair once and drops the partner marker", () => {
    const single = { ...base, promoId: 9, promoBookKey: "draftkings", snapshot: null, profitExtracted: "0.00" };
    const rows = toDoneRows([primary, member, single], names);
    expect(rows.map((r) => r.promoId)).toEqual([1, 9]);
    expect(rows.filter((r) => r.promoId === 2)).toHaveLength(0);
  });

  it("the total counts the pair once", () => {
    const rows = toDoneRows(
      [primary, member, { ...base, promoId: 9, promoBookKey: "draftkings", snapshot: null, profitExtracted: "12.50" }],
      names,
    );
    // legacy null-snapshot rows are $0; use an unreadable snapshot to keep the column amount
    expect(sumProfitExtracted(rows)).toBe("22.73");
    const withSingle = toDoneRows(
      [primary, member, { ...base, promoId: 9, promoBookKey: "draftkings", snapshot: { version: 99 }, profitExtracted: "12.50" }],
      names,
    );
    expect(sumProfitExtracted(withSingle)).toBe("35.23");
  });

  it("unknown or unreadable snapshots still render as legacy (no crash)", () => {
    const dto = toDonePromoDTO({ ...primary, snapshot: { version: 1, kind: "pair", junk: true } }, names);
    expect(dto.kind).toBe("legacy");
    expect(dto.pair).toBeNull();
  });
});
