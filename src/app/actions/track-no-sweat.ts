"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { loadMemberFeedContext } from "@/db/feedContext";
import { priceOneNoSweat } from "@/db/noSweatFeed";
import { getMemberLowProfile } from "@/db/lowProfile";
import {
  deleteTrackedNoSweat,
  getTrackedNoSweat,
  insertTrackedNoSweat,
  isTrackedNoSweatsTableMissing,
  markTrackedLost,
  revertTrackedToTracking,
} from "@/db/trackedNoSweats";
import { getPromoCompletions, markPromoDone, updateNoSweatCompletion } from "@/db/promoTracking";
import { rankRefundOpportunities } from "@/domain/hedge/conversionRate";
import { buildTrackedSnapshot } from "@/domain/promos/buildTrackedSnapshot";
import { isSameDisplayedProfit } from "@/domain/promos/doneSnapshot";
import {
  NoSweatCorrectionSchema,
  NoSweatDoneSnapshotSchema,
  NO_SWEAT_OUTCOMES,
  type NoSweatCorrection,
  type NoSweatDoneSnapshot,
  type RefundConversion,
  type TrackedNoSweatSnapshot,
} from "@/domain/promos/noSweatSnapshot";
import { lostTotal, refundAmountFor, settleProfit, toRefundConversion } from "@/domain/promos/noSweatSettle";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";

/**
 * Phase 9 (FEED-05, D-01, D-03..D-07, D-23, A-03, A-04, A-09): the whole
 * no-sweat lifecycle. Every export calls requireUser first; the strict schemas
 * have no member id field, so the owner is only ever the session user. Track
 * re-prices on the server; settle / refund actions work ONLY from the stored
 * Track snapshot (the promo itself may be inactive by then). Client figures are
 * compared, never stored.
 */

const MONEY_RE = /^-?\d+\.\d{2}$/;
const Money2dp = z.string().regex(MONEY_RE);
const MAX_ABS_OVERRIDE = new Decimal("10000.00");
const REFUND_OPTION_LIMIT = 3;

const NOT_ACTIVE = "This promo is no longer active." as const;
const UNAVAILABLE_MESSAGE = "Tracking isn't available yet: the database update hasn't been applied.";

const TrackInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  precision: z.enum(["whole", "cents"]),
  expectedEstimate: Money2dp,
});

const SettleInputSchema = z
  .strictObject({
    promoId: z.number().int().positive(),
    outcome: z.enum(NO_SWEAT_OUTCOMES),
    correction: NoSweatCorrectionSchema.optional(),
    overrideProfit: Money2dp.optional(),
  })
  .refine((v) => v.overrideProfit === undefined || v.outcome === "push" || v.outcome === "void");

const RefundInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  optionKey: z.string().min(1),
  expectedRefundProfit: Money2dp,
});

const CorrectInputSchema = z.strictObject({
  promoId: z.number().int().positive(),
  correction: NoSweatCorrectionSchema.optional(),
  overrideProfit: Money2dp.optional(),
});

export type UnavailableResponse = { status: "unavailable"; message: string };
export type RefundOptionWithTotal = RefundConversion & { allInTotal: string };

export type TrackResponse =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "not_found"; message: typeof NOT_ACTIVE }
  | { status: "odds_changed"; message: string; currentEstimate: string }
  | { status: "cant_track"; message: string }
  | UnavailableResponse;

export type SimpleResponse =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "not_found"; message: string }
  | UnavailableResponse;

export type SettleResponse =
  | { status: "ok"; profitExtracted: string | null; awaitingRefund: boolean }
  | { status: "invalid" }
  | { status: "too_early" }
  | { status: "not_found"; message: string }
  | UnavailableResponse;

export type CompleteRefundResponse =
  | { status: "ok"; profitExtracted: string }
  | { status: "invalid" }
  | { status: "not_found"; message: string }
  | { status: "odds_changed"; message: string; refundOptions: RefundOptionWithTotal[] }
  | UnavailableResponse;

async function guardTable<T extends { status: string }>(fn: () => Promise<T>): Promise<T | UnavailableResponse> {
  try {
    return await fn();
  } catch (err) {
    if (isTrackedNoSweatsTableMissing(err)) {
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }
    throw err;
  }
}

async function hasCompletion(memberId: number, promoId: number): Promise<boolean> {
  const completions = await getPromoCompletions(memberId);
  return completions.some((c) => c.promoId === promoId);
}

/**
 * WR-05: when markPromoDone lost a race (another settle/refund request inserted
 * first), the figure to report is the one actually stored, not this request's.
 * null when no completion can be found.
 */
async function storedProfit(memberId: number, promoId: number): Promise<string | null> {
  const completions = await getPromoCompletions(memberId);
  const stored = completions.find((c) => c.promoId === promoId);
  if (!stored || stored.profitExtracted === null) return null;
  return new Decimal(stored.profitExtracted).toFixed(2);
}

function profitFromOverride(
  outcome: "won" | "push" | "void",
  tracked: TrackedNoSweatSnapshot,
  correction: NoSweatCorrection | null,
  overrideProfit: string | undefined,
): { profit: string; profitSource: NoSweatDoneSnapshot["profitSource"]; computedProfit: string } | null {
  try {
    if (overrideProfit !== undefined && new Decimal(overrideProfit).abs().gt(MAX_ABS_OVERRIDE)) return null;
    const computed = settleProfit({ outcome, snapshot: tracked, correction });
    const final = overrideProfit !== undefined
      ? settleProfit({ outcome, snapshot: tracked, correction, overrideProfit })
      : computed;
    return { profit: final.profit, profitSource: final.profitSource, computedProfit: computed.profit };
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

export async function trackNoSweatAction(input: unknown): Promise<TrackResponse> {
  const user = await requireUser();

  const parsed = TrackInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId, precision, expectedEstimate } = parsed.data;
  const now = new Date();

  return guardTable(async (): Promise<TrackResponse> => {
    // Idempotent: a second Track of the same promo changes nothing.
    if (await getTrackedNoSweat(user.userId, promoId)) return { status: "ok" };

    const ctx = await loadMemberFeedContext({ userId: user.userId, precision, now });
    if (ctx.doneIds.has(promoId)) return { status: "not_found", message: NOT_ACTIVE };

    const priced = await priceOneNoSweat({ userId: user.userId, promoId, precision, now, ctx });
    if (priced.kind === "not_found" || priced.kind === "not_in_books") {
      return { status: "not_found", message: NOT_ACTIVE };
    }
    if (priced.kind !== "ok") {
      return { status: "cant_track", message: "This promo can't be priced right now, so it can't be tracked." };
    }

    const current = priced.row.estimatedProfit;
    if (!isSameDisplayedProfit(expectedEstimate, current)) {
      return {
        status: "odds_changed",
        message: `Odds changed since this loaded. The estimate now shows ${current}. Review the updated row and track it again.`,
        currentEstimate: current,
      };
    }

    const lowProfile = await getMemberLowProfile(user.userId);
    const snapshot = buildTrackedSnapshot(priced.entry, {
      bookNames: ctx.bookNames,
      precision,
      lowProfile,
      oddsFetchedAt: ctx.oddsFetchedAt,
      now,
    });
    await insertTrackedNoSweat({ userId: user.userId, promoId, snapshot, now });

    revalidatePath("/");
    return { status: "ok" };
  });
}

export async function untrackNoSweatAction(input: unknown): Promise<SimpleResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId } = parsed.data;

  return guardTable(async (): Promise<SimpleResponse> => {
    // A-04: Stop tracking only before any result.
    if (await hasCompletion(user.userId, promoId)) return { status: "invalid" };
    const deleted = await deleteTrackedNoSweat({ userId: user.userId, promoId });
    if (!deleted) return { status: "invalid" };
    revalidatePath("/");
    return { status: "ok" };
  });
}

export async function settleNoSweatAction(input: unknown): Promise<SettleResponse> {
  const user = await requireUser();

  const parsed = SettleInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId, outcome, overrideProfit } = parsed.data;
  const correction = parsed.data.correction ?? null;
  const now = new Date();

  return guardTable(async (): Promise<SettleResponse> => {
    // A-03: settle from the Track snapshot only, never from the (possibly inactive) promo.
    const tracked = await getTrackedNoSweat(user.userId, promoId);
    if (!tracked) return { status: "not_found", message: "This promo isn't being tracked." };
    if (tracked.state !== "tracking") return { status: "invalid" };
    if (await hasCompletion(user.userId, promoId)) return { status: "invalid" };

    // D-03: results can only be recorded after kickoff, checked on the server.
    if (now.getTime() < new Date(tracked.snapshot.game.commenceTime).getTime()) {
      return { status: "too_early" };
    }

    if (outcome === "lost") {
      const moved = await markTrackedLost({ userId: user.userId, promoId, correction, now });
      if (!moved) return { status: "invalid" };
      revalidatePath("/");
      return { status: "ok", profitExtracted: null, awaitingRefund: true };
    }

    const result = profitFromOverride(outcome, tracked.snapshot, correction, overrideProfit);
    if (!result) return { status: "invalid" };

    const snapshot: NoSweatDoneSnapshot = {
      version: 2,
      kind: "no_sweat",
      stage: "settled",
      tracked: tracked.snapshot,
      outcome,
      correction,
      refund: null,
      computedProfit: result.computedProfit,
      profitSource: result.profitSource,
      settledAt: now.toISOString(),
    };
    // D-06: the completion row is written at settle time, so it counts that day.
    const inserted = await markPromoDone({ userId: user.userId, promoId, now, snapshot, profitExtracted: result.profit });
    revalidatePath("/");
    if (!inserted) {
      const stored = await storedProfit(user.userId, promoId);
      if (stored === null) return { status: "invalid" };
      return { status: "ok", profitExtracted: stored, awaitingRefund: false };
    }
    return { status: "ok", profitExtracted: result.profit, awaitingRefund: false };
  });
}

export async function completeRefundNoSweatAction(input: unknown): Promise<CompleteRefundResponse> {
  const user = await requireUser();

  const parsed = RefundInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId, optionKey, expectedRefundProfit } = parsed.data;
  const now = new Date();

  return guardTable(async (): Promise<CompleteRefundResponse> => {
    const tracked = await getTrackedNoSweat(user.userId, promoId);
    if (!tracked) return { status: "not_found", message: "This promo isn't being tracked." };
    if (tracked.state !== "awaiting_refund") return { status: "invalid" };
    if (await hasCompletion(user.userId, promoId)) return { status: "invalid" };

    const { snapshot, correction } = tracked;
    const amount = refundAmountFor(snapshot, correction);
    const ctx = await loadMemberFeedContext({ userId: user.userId, precision: snapshot.precision, now });

    // D-05: recompute from cached odds, exactly as the Bet-lost card prices it.
    const options: RefundConversion[] = rankRefundOpportunities({
      events: ctx.moneylineEvents,
      now,
      refundBookKey: snapshot.promo.bookKey,
      amount: new Decimal(amount),
      hedgeBookKeys: ctx.rankOpts.hedgeBookKeys,
      limit: REFUND_OPTION_LIMIT,
    }).map((opp) => toRefundConversion(opp, amount));

    const chosen = options.find((o) => o.optionKey === optionKey);
    if (!chosen || !isSameDisplayedProfit(expectedRefundProfit, chosen.profit)) {
      return {
        status: "odds_changed",
        message: "Odds changed since this loaded. Review the updated refund options and pick one again.",
        refundOptions: options.map((o) => ({ ...o, allInTotal: lostTotal(snapshot, correction, o.profit) })),
      };
    }

    const total = lostTotal(snapshot, correction, chosen.profit);
    const done: NoSweatDoneSnapshot = {
      version: 2,
      kind: "no_sweat",
      stage: "settled",
      tracked: snapshot,
      outcome: "lost",
      correction,
      refund: chosen,
      computedProfit: total,
      profitSource: correction ? "corrected" : "computed",
      settledAt: now.toISOString(),
    };
    const inserted = await markPromoDone({ userId: user.userId, promoId, now, snapshot: done, profitExtracted: total });
    revalidatePath("/");
    if (!inserted) {
      const stored = await storedProfit(user.userId, promoId);
      if (stored === null) return { status: "invalid" };
      return { status: "ok", profitExtracted: stored };
    }
    return { status: "ok", profitExtracted: total };
  });
}

/** One step back from awaiting_refund to tracking (A-04). A settled row is undone with unmarkPromoUsedAction. */
export async function undoNoSweatOutcomeAction(input: unknown): Promise<SimpleResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId } = parsed.data;

  return guardTable(async (): Promise<SimpleResponse> => {
    if (await hasCompletion(user.userId, promoId)) return { status: "invalid" };
    const reverted = await revertTrackedToTracking({ userId: user.userId, promoId, now: new Date() });
    if (!reverted) return { status: "invalid" };
    revalidatePath("/");
    return { status: "ok" };
  });
}

/** A-09: Fix amounts on a settled no-sweat, recomputed from its stored snapshot. */
export async function correctSettledNoSweatAction(input: unknown): Promise<SettleResponse> {
  const user = await requireUser();

  const parsed = CorrectInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId, overrideProfit } = parsed.data;
  const correction = parsed.data.correction ?? null;

  const completions = await getPromoCompletions(user.userId);
  const completion = completions.find((c) => c.promoId === promoId);
  const stored = completion ? NoSweatDoneSnapshotSchema.safeParse(completion.snapshot) : null;
  if (!completion || !stored || !stored.success) {
    return { status: "not_found", message: "That settled no-sweat wasn't found." };
  }
  const done = stored.data;

  let profit: string;
  let computedProfit: string;
  let profitSource: NoSweatDoneSnapshot["profitSource"];
  if (done.outcome === "lost") {
    // Overrides are for push / void only; the stored refund must still fit the corrected stake.
    if (overrideProfit !== undefined || done.refund === null) return { status: "invalid" };
    if (refundAmountFor(done.tracked, correction) !== done.refund.amount) return { status: "invalid" };
    profit = lostTotal(done.tracked, correction, done.refund.profit);
    computedProfit = profit;
    profitSource = correction ? "corrected" : "computed";
  } else {
    if (overrideProfit !== undefined && done.outcome === "won") return { status: "invalid" };
    const result = profitFromOverride(done.outcome, done.tracked, correction, overrideProfit);
    if (!result) return { status: "invalid" };
    profit = result.profit;
    computedProfit = result.computedProfit;
    profitSource = result.profitSource;
  }

  const next: NoSweatDoneSnapshot = { ...done, correction, computedProfit, profitSource };
  await updateNoSweatCompletion({ userId: user.userId, promoId, snapshot: next, profitExtracted: profit });

  revalidatePath("/");
  return { status: "ok", profitExtracted: profit, awaitingRefund: false };
}
