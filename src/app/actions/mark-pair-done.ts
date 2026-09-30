"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { MarkPairDoneInputSchema, PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { markPairDone, unmarkPairDone } from "@/db/promoTracking";
import { computeMemberPairState } from "@/db/memberPairState";
import { buildPairSnapshot, isSamePairDisplay } from "@/domain/promos/pairSnapshot";

/**
 * Phase 4 Plan 07 (T-04-20..24): mark a promo pair done for the CURRENT
 * member only. requireUser() is the first statement, the input schema is
 * strict with no userId, and the server recomputes the pair itself -- the
 * client's numbers are only compared (D-23), never stored.
 */
export type MarkPairDoneResponse =
  | { status: "ok"; profitExtracted: string }
  | { status: "invalid" }
  | { status: "not_found"; message: "One of these promos is no longer active." }
  | { status: "odds_changed"; message: string; currentGuaranteedProfit: string | null }
  | { status: "save_failed" };

export async function markPairDoneAction(input: unknown): Promise<MarkPairDoneResponse> {
  const user = await requireUser();

  const parsed = MarkPairDoneInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { promoIdA, promoIdB, precision, expectedGuaranteedProfit, expectedStakeA, expectedStakeB } = parsed.data;
  const now = new Date();

  const state = await computeMemberPairState({ userId: user.userId, promoIdA, promoIdB, precision, now });
  if (state.kind === "already_done_pair") {
    // Double tap: already recorded; report success without writing again.
    return { status: "ok", profitExtracted: state.profitExtracted };
  }
  if (state.kind === "not_active") {
    return { status: "not_found", message: "One of these promos is no longer active." };
  }

  const expected = { profit: expectedGuaranteedProfit, stakeA: expectedStakeA, stakeB: expectedStakeB };
  if (state.row === null || !isSamePairDisplay(expected, state.row)) {
    return {
      status: "odds_changed",
      message:
        "The odds moved since this loaded, so the stakes changed. Nothing was saved. Check the new numbers and try again.",
      currentGuaranteedProfit: state.row ? state.row.guaranteedProfit : null,
    };
  }

  const { primary, member } = buildPairSnapshot(
    { row: state.row, termsA: state.termsA, termsB: state.termsB },
    { now, precision, oddsFetchedAt: state.oddsFetchedAt },
  );

  try {
    await markPairDone({ userId: user.userId, now, primary, member });
  } catch (error) {
    console.error("markPairDone failed", error);
    return { status: "save_failed" };
  }

  revalidatePath("/");
  return { status: "ok", profitExtracted: primary.profitExtracted };
}

export type UndoPairDoneResponse = { status: "ok" } | { status: "invalid" };

/**
 * Undo a done pair from EITHER promo id (T-04-25/26): requireUser first, the
 * acting user comes only from the session, and unmarkPairDone removes both
 * rows in one statement scoped to that user.
 */
export async function unmarkPairDoneAction(input: unknown): Promise<UndoPairDoneResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  await unmarkPairDone({ userId: user.userId, promoId: parsed.data.promoId });

  revalidatePath("/");
  return { status: "ok" };
}
