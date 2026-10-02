"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { getActivePromoForFlag, applyFlag } from "@/db/promoReview";
import type { PromoReviewResponse } from "./confirm-promo-match";

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };

/**
 * The D-11 safety net (D-12, ARCHITECTURE.md Anti-Pattern 2 guard): any
 * logged-in member can flag an active scraped promo (auto-matched or human-confirmed) as wrong, pulling it out
 * of hedge math immediately and sending it back to the review queue with
 * its own current scope as the best guess (presentational only -- it never
 * re-auto-activates). requireUser() is the literal first statement
 * (T-03-10-01) -- a logged-out call redirects before any read/write. The
 * write is a single conditional UPDATE gated on
 * status = 'active' AND added_by_user_id IS NULL (T-03-10-02), so a concurrent
 * flag/confirm/dismiss on the same row can affect at most one caller.
 * decideScrapedWrite's autoMatchBlocked rule (Plan 08) permanently refuses
 * to auto-reactivate this row on any later scrape -- only a member's
 * Confirm/Correct/Dismiss resolves it from here.
 */
export async function flagPromoMatch(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { promoId } = parsed.data;

  const row = await getActivePromoForFlag(promoId, user.userId);
  if (!row) {
    return CONFLICT;
  }

  if (!row.scraped) {
    return { status: "conflict", message: "Only scraped promos can be flagged." };
  }

  const ok = await applyFlag({ promoId, userId: user.userId, guess: row.guess, now: new Date() });
  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
