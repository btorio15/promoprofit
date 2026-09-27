"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { CorrectMatchInputSchema } from "@/domain/promos/reviewInput";
import { getPendingPromo, applyCorrectedMatch } from "@/db/promoReview";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { resolveSelection } from "@/domain/promos/selection";
import { etDayBounds } from "@/domain/promos/etTime";
import { statusAfterMatch } from "@/domain/promos/lifecycle";
import type { ScopeGuess } from "@/domain/promos/scope";
import type { PromoSelection } from "@/domain/promos/types";
import type { PromoReviewResponse } from "./confirm-promo-match";

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };
const SELECTION_INVALID: PromoReviewResponse = {
  status: "invalid",
  fieldErrors: { selection: ["That market isn't available for this promo. Pick another."] },
};

/**
 * Corrects a queued promo's scope to a member-chosen game (optionally
 * pinning a market/side) or sport+ET-day window (D-14, ARCHITECTURE.md
 * Pattern 1 "dropdown-first"). requireUser() is the literal first statement
 * (T-03-09-01) -- a logged-out call redirects before any read/write. The
 * client's dropdown values are never trusted as-is (T-03-09-02): an event
 * must still exist in the current cached odds with a future commence time,
 * a pin must still resolve to real book quotes AND belong to the promo's
 * own eligibleMarketTypes, and a sport-day's ET bounds are always
 * recomputed server-side from its date string, never taken from the client.
 */
export async function correctPromoMatch(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = CorrectMatchInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { promoId, scope: scopeInput } = parsed.data;

  const row = await getPendingPromo(promoId);
  if (!row || row.reviewReason !== "match") {
    return CONFLICT;
  }

  const now = new Date();
  let scope: ScopeGuess;
  let pinned: PromoSelection | null = null;

  if (scopeInput.kind === "event") {
    const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);
    const event = [...moneylineEvents, ...extendedEvents].find((ev) => ev.id === scopeInput.eventId);

    if (!event || new Date(event.commence_time).getTime() <= now.getTime()) {
      return { status: "stale", message: "That game is no longer in the cached odds. Pick another." };
    }

    if (scopeInput.pinned) {
      const { marketType, line, side } = scopeInput.pinned;

      if (!row.parsed.eligibleMarketTypes.includes(marketType)) {
        return SELECTION_INVALID;
      }

      const sel: PromoSelection = { eventId: event.id, marketType, line, side };
      const resolved =
        marketType === "moneyline"
          ? (resolveSelection(moneylineEvents, sel) ?? resolveSelection(extendedEvents, sel))
          : resolveSelection(extendedEvents, sel);

      if (!resolved) {
        return SELECTION_INVALID;
      }

      pinned = sel;
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
    const bounds = etDayBounds(scopeInput.etDate);
    if (!bounds || new Date(bounds.end).getTime() <= now.getTime()) {
      return { status: "stale", message: "That day has already passed. Pick another." };
    }

    scope = {
      kind: "sport_window",
      sportKey: scopeInput.sportKey,
      windowStart: bounds.start,
      windowEnd: bounds.end,
    };
  }

  const next = statusAfterMatch({
    promoType: row.promoType,
    maxStake: row.maxStake,
    bonusAmount: row.bonusAmount,
    unparsedCapFields: row.unparsedCapFields,
  });

  const ok = await applyCorrectedMatch({ promoId, userId: user.userId, scope, pinned, next, now });
  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
