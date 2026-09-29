"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { CorrectMatchInputSchema } from "@/domain/promos/reviewInput";
import { getPendingPromo, applyCorrectedMatch } from "@/db/promoReview";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { resolveSelection } from "@/domain/promos/selection";
import { resolveMemberScope } from "@/domain/promos/memberScope";
import { statusAfterMatch } from "@/domain/promos/lifecycle";
import type { PromoSelection } from "@/domain/promos/types";
import type { OddsEvent } from "@/domain/odds/schemas";
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
 * client's dropdown values are never trusted as-is (T-03-09-02): the scope
 * itself is resolved by resolveMemberScope (memberScope.ts, shared with
 * classifyPromo, quick-260928-it1) -- an event must still exist in the
 * current cached odds with a future commence time, and a sport-day's ET
 * bounds are always recomputed server-side from its date string, never
 * taken from the client. The pin resolution stays here (it needs the
 * promo's own eligibleMarketTypes): a pin must still resolve to real book
 * quotes AND belong to that set.
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

  let moneylineEvents: OddsEvent[] = [];
  let extendedEvents: OddsEvent[] = [];
  if (scopeInput.kind === "event") {
    const [moneyline, extended] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
    moneylineEvents = moneyline.events;
    extendedEvents = extended.events;
  }

  const scopeResult = resolveMemberScope(
    scopeInput.kind === "event"
      ? { kind: "event", eventId: scopeInput.eventId }
      : {
          kind: "sport_day",
          sportKey: scopeInput.sportKey,
          etDate: scopeInput.etDate,
          ...(scopeInput.etEndDate !== undefined ? { etEndDate: scopeInput.etEndDate } : {}),
        },
    { moneyline: moneylineEvents, extended: extendedEvents },
    now,
  );

  if (scopeResult.status === "stale") {
    return { status: "stale", message: scopeResult.message };
  }
  if (scopeResult.status === "invalid") {
    return { status: "invalid" };
  }

  const { scope, event } = scopeResult;
  let pinned: PromoSelection | null = null;

  if (scopeInput.kind === "event" && scopeInput.pinned && event) {
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
