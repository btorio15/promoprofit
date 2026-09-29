"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { MarkPromoDoneInputSchema, PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { markPromoDone, unmarkPromoUsed } from "@/db/promoTracking";
import { computeMemberPromoState } from "@/db/memberPromoState";
import { buildDoneSnapshot, isSameDisplayedProfit } from "@/domain/promos/doneSnapshot";
import { formatUsd } from "@/lib/format";

/**
 * quick-260929-igk (T-igk-01..04): mark a promo done / undo it for the
 * CURRENT member only. requireUser() is the literal first statement, the
 * input schemas are strict with no userId field (the acting user id comes
 * only from the session), and marking done recomputes the member's row on
 * the server -- client numbers are only compared, never stored.
 */
export type MarkDoneResponse =
  | { status: "ok"; profitExtracted: string }
  | { status: "invalid" }
  | { status: "not_found"; message: "This promo is no longer active." }
  | { status: "odds_changed"; message: string; currentGuaranteedProfit: string | null };

export type UndoDoneResponse = { status: "ok" } | { status: "invalid" };

export async function markPromoUsedAction(input: unknown): Promise<MarkDoneResponse> {
  const user = await requireUser();

  const parsed = MarkPromoDoneInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { promoId, precision, expectedGuaranteedProfit } = parsed.data;
  const now = new Date();

  const state = await computeMemberPromoState({ userId: user.userId, promoId, precision, now });
  if (state.kind === "not_active") {
    return { status: "not_found", message: "This promo is no longer active." };
  }

  const currentGuaranteedProfit = state.kind === "hedge" ? state.row.guaranteedProfit : null;
  if (!isSameDisplayedProfit(expectedGuaranteedProfit, currentGuaranteedProfit)) {
    const nowShows =
      currentGuaranteedProfit === null ? "it now has no profitable hedge" : `it now shows ${formatUsd(currentGuaranteedProfit)}`;
    return {
      status: "odds_changed",
      message: `Odds changed since this loaded — ${nowShows}. Review the updated row and mark it done again.`,
      currentGuaranteedProfit,
    };
  }

  const { snapshot, profitExtracted } =
    state.kind === "hedge"
      ? buildDoneSnapshot({ kind: "hedge", terms: state.terms, row: state.row }, { now, precision, oddsFetchedAt: state.oddsFetchedAt })
      : buildDoneSnapshot({ kind: "no_hedge", terms: state.terms, row: state.row }, { now, precision, oddsFetchedAt: state.oddsFetchedAt });

  await markPromoDone({ userId: user.userId, promoId, now, snapshot, profitExtracted });

  revalidatePath("/");
  return { status: "ok", profitExtracted };
}

export async function unmarkPromoUsedAction(input: unknown): Promise<UndoDoneResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  await unmarkPromoUsed({ userId: user.userId, promoId: parsed.data.promoId });

  revalidatePath("/");
  return { status: "ok" };
}
