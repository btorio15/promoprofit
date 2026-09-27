"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { getPendingPromo, applyConfirmedMatch } from "@/db/promoReview";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { SPORT_KEYS } from "@/config/sports";
import { statusAfterMatch } from "@/domain/promos/lifecycle";
import type { ScopeGuess } from "@/domain/promos/scope";

export type PromoReviewResponse =
  | { status: "ok" }
  | {
      status: "invalid";
      /** Plan 09 (T-03-09-02/03): correctPromoMatch/enterPromoCaps attach field-level messages; confirmPromoMatch/dismissPromo never set this. */
      fieldErrors?: Partial<Record<"maxStake" | "maxWinnings" | "minOdds" | "selection", string[]>>;
    }
  | { status: "stale"; message: string }
  | { status: "conflict"; message: string };

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };

/**
 * Accepts a queued promo's best-guess scope as-is, activating it (or
 * routing it to cap review, D-18) so it gets a hedge row. requireUser() is
 * the literal first statement (T-03-07-01) -- a logged-out call redirects
 * before any read/write, mirroring save-books.ts. The stored best_guess is
 * never trusted blindly (T-03-07-04): an event guess must still exist in
 * the current cached odds (moneyline ∪ extended) with a commence time in
 * the future, and the written scope is refreshed FROM that cached event
 * (teams/commence), not copied verbatim from the guess; a sport_window
 * guess only needs its own sportKey/windowEnd re-checked (no cached event
 * required -- the ranker shows a row once odds for that window exist).
 */
export async function confirmPromoMatch(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { promoId } = parsed.data;

  const row = await getPendingPromo(promoId);
  if (!row) {
    return CONFLICT;
  }

  if (row.reviewReason !== "match" || !row.bestGuess) {
    return { status: "stale", message: "There's no suggested match to confirm. Correct or dismiss it instead." };
  }

  const now = new Date();
  let scope: ScopeGuess;

  if (row.bestGuess.kind === "event") {
    const guess = row.bestGuess;
    const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);
    const event = [...moneylineEvents, ...extendedEvents].find((ev) => ev.id === guess.eventId);

    if (!event || new Date(event.commence_time).getTime() <= now.getTime()) {
      return {
        status: "stale",
        message: "That game is no longer in the cached odds. Correct or dismiss this promo instead.",
      };
    }

    scope = {
      kind: "event",
      eventId: event.id,
      sportKey: event.sport_key,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
    };
  } else {
    const guess = row.bestGuess;
    if (!SPORT_KEYS.includes(guess.sportKey) || new Date(guess.windowEnd).getTime() <= now.getTime()) {
      return { status: "stale", message: "That promo window has ended. Dismiss this promo instead." };
    }
    scope = guess;
  }

  const next = statusAfterMatch({
    promoType: row.promoType,
    maxStake: row.maxStake,
    bonusAmount: row.bonusAmount,
    unparsedCapFields: row.unparsedCapFields,
  });

  const ok = await applyConfirmedMatch({ promoId, userId: user.userId, scope, next, now });
  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
