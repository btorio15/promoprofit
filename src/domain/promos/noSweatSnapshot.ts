import { z } from "zod";
import { LOW_PROFILE_WARNINGS } from "./lowProfile";
import { PROMO_MARKET_TYPES } from "./types";

/**
 * Phase 9 (A-03, D-01): versioned snapshots for tracked / settled no-sweat
 * promos. Pure module. All money is a 2dp string (never a float) so settling
 * can work from the snapshot alone.
 */

export const MONEY_2DP_RE = /^-?\d+\.\d{2}$/;
const money = z.string().regex(MONEY_2DP_RE);

const MAX_STAKE = 10000;
const positiveBoundedMoney = money.refine((v) => {
  const n = Number(v);
  return n > 0 && n <= MAX_STAKE;
}, "Enter an amount between $0.01 and $10,000.");

const americanOdds = z
  .number()
  .int()
  .refine((x) => x >= 100 || x <= -100, "American odds must be +100 or longer, or -100 or shorter.");

export const NO_SWEAT_OUTCOMES = ["won", "lost", "push", "void"] as const;

export const TrackedNoSweatSnapshotSchema = z.object({
  version: z.literal(2),
  kind: z.literal("no_sweat"),
  stage: z.literal("tracked"),
  recordedAt: z.string(),
  precision: z.enum(["whole", "cents"]),
  oddsFetchedAt: z.string().nullable(),
  promo: z.object({
    id: z.number().int(),
    bookKey: z.string(),
    bookName: z.string(),
    title: z.string(),
    refundCap: money,
    minOddsAmerican: z.number().int().nullable(),
    expiresAt: z.string().nullable(),
    scopeLabel: z.string().nullable(),
  }),
  game: z.object({
    eventId: z.string(),
    sportKey: z.string(),
    commenceTime: z.string(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    marketType: z.enum(PROMO_MARKET_TYPES),
    marketBadge: z.string(),
    qualifyingSelectionLabel: z.string(),
    hedgeSelectionLabel: z.string(),
    fromAlternate: z.boolean(),
  }),
  qualifying: z.object({
    bookKey: z.string(),
    bookName: z.string(),
    // WR-04: a stored value inside (-100, 100) would throw in americanToDecimal.
    oddsAmerican: americanOdds,
    stake: money,
    winnings: money,
  }),
  hedge: z.object({
    bookKey: z.string(),
    bookName: z.string(),
    oddsAmerican: americanOdds,
    stake: money,
    payout: money,
  }),
  estimate: z.object({
    estimatedProfit: money,
    worstCaseProfit: money,
    profitIfWin: money,
    profitIfLose: money,
    estRoiPct: money,
  }),
  conversion: z.object({
    refundBookKey: z.string(),
    refundAmount: money,
    refundValue: money,
    ratePct: money,
    eventId: z.string(),
    hedgeBookKey: z.string(),
  }),
  lowProfile: z.object({
    oddsCapEnabled: z.boolean(),
    oddsCapAmerican: z.number().int(),
    mainLinesOnly: z.boolean(),
    naturalStakes: z.boolean(),
  }),
  warnings: z.array(z.enum(LOW_PROFILE_WARNINGS)),
});
export type TrackedNoSweatSnapshot = z.infer<typeof TrackedNoSweatSnapshotSchema>;

export const NoSweatCorrectionSchema = z.strictObject({
  qualifyingStake: positiveBoundedMoney,
  qualifyingOddsAmerican: americanOdds,
  hedgeStake: positiveBoundedMoney,
  hedgeOddsAmerican: americanOdds,
});
export type NoSweatCorrection = z.infer<typeof NoSweatCorrectionSchema>;

export const RefundConversionSchema = z.object({
  optionKey: z.string(),
  eventId: z.string(),
  refundBookKey: z.string(),
  amount: money,
  bonusSelectionLabel: z.string(),
  bonusOddsAmerican: z.number().int(),
  hedgeBookKey: z.string(),
  hedgeSelectionLabel: z.string(),
  hedgeOddsAmerican: z.number().int(),
  hedgeStake: money,
  profit: money,
});
export type RefundConversion = z.infer<typeof RefundConversionSchema>;

export const NoSweatDoneSnapshotSchema = z
  .object({
    version: z.literal(2),
    kind: z.literal("no_sweat"),
    stage: z.literal("settled"),
    tracked: TrackedNoSweatSnapshotSchema,
    outcome: z.enum(NO_SWEAT_OUTCOMES),
    correction: NoSweatCorrectionSchema.nullable(),
    refund: RefundConversionSchema.nullable(),
    computedProfit: money,
    profitSource: z.enum(["computed", "corrected", "override"]),
    settledAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "lost" && v.refund === null) {
      ctx.addIssue({ code: "custom", path: ["refund"], message: "refund is required when outcome is lost" });
    }
    if (v.outcome !== "lost" && v.refund !== null) {
      ctx.addIssue({ code: "custom", path: ["refund"], message: "refund must be null unless outcome is lost" });
    }
  });
export type NoSweatDoneSnapshot = z.infer<typeof NoSweatDoneSnapshotSchema>;
