"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { markPromoUsed, unmarkPromoUsed } from "@/db/promoTracking";

/**
 * quick-260927-n12 (T-n12-01, T-n12-02, T-n12-03): mark/unmark a promo used
 * for the CURRENT member only (owner decision 2). Mirrors
 * dismiss-promo.ts's shape exactly: requireUser() is the literal first
 * statement (no DB call for a logged-out request), PromoIdInputSchema is
 * `.strict()` with no userId field so the acting user id can only ever come
 * from the session (IDOR guard), and revalidatePath("/") on every
 * successful write so the Promos tab picks up the change on next render.
 */
export type MarkUsedResponse =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "not_found"; message: "This promo no longer exists." };

export async function markPromoUsedAction(input: unknown): Promise<MarkUsedResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const ok = await markPromoUsed({ userId: user.userId, promoId: parsed.data.promoId, now: new Date() });
  if (!ok) {
    return { status: "not_found", message: "This promo no longer exists." };
  }

  revalidatePath("/");
  return { status: "ok" };
}

export async function unmarkPromoUsedAction(input: unknown): Promise<MarkUsedResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  await unmarkPromoUsed({ userId: user.userId, promoId: parsed.data.promoId });

  revalidatePath("/");
  return { status: "ok" };
}
