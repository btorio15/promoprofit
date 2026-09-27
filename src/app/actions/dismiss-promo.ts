"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { applyDismissal } from "@/db/promoReview";
import type { PromoReviewResponse } from "./confirm-promo-match";

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };

/**
 * Permanently dismisses a queued promo (D-14) -- never re-queued by a
 * later scrape of the same promo (store.ts matches on dedupe_key
 * regardless of status). requireUser() is the first statement (T-03-07-01);
 * applyDismissal's single conditional UPDATE is the only write, so a
 * concurrent confirm/dismiss on the same row can affect at most one of
 * them (T-03-07-03).
 */
export async function dismissPromo(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const ok = await applyDismissal({ promoId: parsed.data.promoId, userId: user.userId, now: new Date() });
  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
