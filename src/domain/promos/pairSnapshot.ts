import { z } from "zod";
import Decimal from "decimal.js";
// Type-only imports: Plan 08 makes doneSnapshot.ts import runtime values from
// this module, so a runtime import back would be a cycle.
import type { DonePromoTerms } from "./doneSnapshot";
import type { PairRowDTO } from "./pairRowDto";
import { PROMO_TYPES } from "./types";

/**
 * Phase 4 Plan 07: the frozen "mark pair done" snapshot. Pure module (no
 * src/db imports). Built ONLY on the server from a fresh recompute of the
 * pair (never from client numbers). The primary promo's completion row holds
 * the full pair snapshot and the pair's profit; the partner's row holds a
 * small marker with $0.00 so the pair counts once in Total profit extracted.
 */

const PairLegSnapshotSchema = z.object({
  promoId: z.number(),
  bookKey: z.string(),
  bookName: z.string(),
  promoTypeLabel: z.enum(["Boost", "Bonus bet"]),
  promoTitle: z.string(),
  selectionLabel: z.string(),
  oddsAmerican: z.number(),
  stake: z.string(),
  payout: z.string(),
  capNote: z.string().nullable(),
  bonusNote: z.string().nullable(),
});

export const PairRowSnapshotSchema = z.object({
  rowKey: z.string(),
  promoIdA: z.number(),
  promoIdB: z.number(),
  kind: z.enum(["boost_boost", "boost_bonus"]),
  pairTypeLabel: z.enum(["Boost + Boost", "Boost + Bonus bet"]),
  sportLabel: z.string(),
  commenceTime: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  marketBadge: z.string(),
  tieRisk: z.boolean(),
  legA: PairLegSnapshotSchema,
  legB: PairLegSnapshotSchema,
  totalStaked: z.string(),
  netIfAWins: z.string(),
  netIfBWins: z.string(),
  guaranteedProfit: z.string(),
  roiPct: z.string(),
  rateLabel: z.literal("ROI"),
  separateProfitA: z.string(),
  separateProfitB: z.string(),
  gain: z.string(),
  worstCase: z.boolean(),
});

export type PairRowSnapshot = z.infer<typeof PairRowSnapshotSchema>;

/** Compile-time guard: the stored pair row shape must stay assignable to the live pair DTO. */
export const _pairRowShapeGuard = (r: PairRowSnapshot): PairRowDTO => r;

const PairTermsSchema = z.object({
  id: z.number(),
  bookKey: z.string(),
  promoType: z.enum(PROMO_TYPES),
  title: z.string(),
  boostPercent: z.string().nullable(),
  boostedOddsAmerican: z.number().nullable(),
  baseOddsAmerican: z.number().nullable(),
  bonusAmount: z.string().nullable(),
  maxStake: z.string().nullable(),
  winningsCap: z.object({ kind: z.string(), amount: z.string() }).nullable(),
  minOddsAmerican: z.number().nullable(),
});

const PrecisionSchema = z.enum(["whole", "cents"]);

export const DonePairSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.literal("pair"),
  pairPromoIds: z.tuple([z.number().int(), z.number().int()]),
  precision: PrecisionSchema,
  oddsFetchedAt: z.object({ moneyline: z.string().nullable(), spreadsTotals: z.string().nullable() }),
  row: PairRowSnapshotSchema,
  termsA: PairTermsSchema,
  termsB: PairTermsSchema,
  completedAtIso: z.string(),
});

export type DonePairSnapshot = z.infer<typeof DonePairSnapshotSchema>;

export const PairMemberSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.literal("pair_member"),
  pairedWithPromoId: z.number().int(),
});

export type PairMemberSnapshot = z.infer<typeof PairMemberSnapshotSchema>;

export interface PairCompletionRow<S> {
  promoId: number;
  snapshot: S;
  profitExtracted: string;
}

export function buildPairSnapshot(
  input: { row: PairRowDTO; termsA: DonePromoTerms; termsB: DonePromoTerms },
  ctx: {
    now: Date;
    precision: "whole" | "cents";
    oddsFetchedAt: { moneyline: Date | null; spreadsTotals: Date | null };
  },
): { primary: PairCompletionRow<DonePairSnapshot>; member: PairCompletionRow<PairMemberSnapshot> } {
  const { row, termsA, termsB } = input;
  const snapshot: DonePairSnapshot = {
    version: 1,
    kind: "pair",
    pairPromoIds: [row.promoIdA, row.promoIdB],
    precision: ctx.precision,
    oddsFetchedAt: {
      moneyline: ctx.oddsFetchedAt.moneyline ? ctx.oddsFetchedAt.moneyline.toISOString() : null,
      spreadsTotals: ctx.oddsFetchedAt.spreadsTotals ? ctx.oddsFetchedAt.spreadsTotals.toISOString() : null,
    },
    row: { ...row, legA: { ...row.legA }, legB: { ...row.legB } },
    termsA: { ...termsA },
    termsB: { ...termsB },
    completedAtIso: ctx.now.toISOString(),
  };
  return {
    primary: {
      promoId: row.promoIdA,
      snapshot,
      profitExtracted: new Decimal(row.guaranteedProfit).toFixed(2),
    },
    member: {
      promoId: row.promoIdB,
      snapshot: { version: 1, kind: "pair_member", pairedWithPromoId: row.promoIdA },
      profitExtracted: "0.00",
    },
  };
}

/** D-23: still the same pair to the cent? Profit and BOTH stakes must match. null = pair gone. */
export function isSamePairDisplay(
  expected: { profit: string; stakeA: string; stakeB: string },
  current: PairRowDTO | null,
): boolean {
  if (current === null) return false;
  return (
    new Decimal(expected.profit).equals(current.guaranteedProfit) &&
    new Decimal(expected.stakeA).equals(current.legA.stake) &&
    new Decimal(expected.stakeB).equals(current.legB.stake)
  );
}
