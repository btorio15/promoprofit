"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { ClassifyPromoInputSchema } from "@/domain/promos/reviewInput";
import { getPendingPromo, applyClassification } from "@/db/promoReview";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { resolveMemberScope } from "@/domain/promos/memberScope";
import { statusAfterMatch } from "@/domain/promos/lifecycle";
import { ScrapedPromoSchema, type ScrapedPromo } from "@/domain/promos/scraped";
import { PROMO_MARKET_TYPES } from "@/domain/promos/types";
import type { ScopeGuess } from "@/domain/promos/scope";
import type { PromoReviewResponse } from "./confirm-promo-match";

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };

/**
 * Turns an uncertain "classify" review row (quick-260928-it1) into a real
 * profit_boost or bonus_bet promo -- the member-facing counterpart to
 * reviewTriage.ts's buildClassifyDraft. requireUser() is the literal first
 * statement (T-it1-01) -- a logged-out call redirects before any read/write.
 * ClassifyPromoInputSchema carries no userId field (IDOR guard, T-it1-02) --
 * the acting user always comes from the session. Any chosen scope is
 * re-resolved server-side via resolveMemberScope against the current cached
 * odds (T-it1-03), never trusted from the client. CR-04 is enforced twice:
 * statusAfterMatch routes a boost with no max stake to caps review here, and
 * applyClassification independently refuses (false, no write) if that
 * combination is ever reached with status "active" anyway.
 */
export async function classifyPromo(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = ClassifyPromoInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  const data = parsed.data;

  const row = await getPendingPromo(data.promoId);
  if (!row || row.reviewReason !== "classify") {
    return CONFLICT;
  }

  const now = new Date();

  let scope: ScopeGuess | null = null;
  if (data.scope) {
    const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);

    const scopeResult = resolveMemberScope(
      data.scope.kind === "event"
        ? { kind: "event", eventId: data.scope.eventId }
        : {
            kind: "sport_day",
            sportKey: data.scope.sportKey,
            etDate: data.scope.etDate,
            ...(data.scope.etEndDate !== undefined ? { etEndDate: data.scope.etEndDate } : {}),
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

    scope = scopeResult.scope;
  }

  const boostPercent = data.promoType === "profit_boost" ? new Decimal(data.boostPercent).toFixed(2) : null;
  const bonusAmount = data.promoType === "bonus_bet" ? new Decimal(data.bonusAmount).toFixed(2) : null;
  const maxStake =
    data.promoType === "profit_boost" && data.maxStake !== undefined ? new Decimal(data.maxStake).toFixed(2) : null;
  const minOddsAmerican = data.minOddsAmerican ?? null;

  // T-it1-03/D-18: a member can never invent or override which winnings-cap
  // semantics the book actually uses -- maxWinningsKind always comes from
  // the row, same discipline as enterPromoCaps.
  let maxWinnings: string | null = null;
  if (data.promoType === "profit_boost" && data.maxWinnings !== undefined) {
    if (row.maxWinningsKind === null) {
      return {
        status: "invalid",
        fieldErrors: { maxWinnings: ["This book's winnings rule is unknown. Dismiss this promo instead."] },
      };
    }
    maxWinnings = new Decimal(data.maxWinnings).toFixed(2);
  }

  const completed: ScrapedPromo = {
    ...row.parsed,
    promoType: data.promoType,
    boostPercent,
    bonusAmount,
    maxStake,
    maxWinnings: maxWinnings !== null ? { amount: maxWinnings, kind: row.maxWinningsKind! } : null,
    minOddsAmerican,
    sportKeyHint: scope?.sportKey ?? row.parsed.sportKeyHint,
    boostedOddsAmerican: null,
    pinned: null,
    unparsedCapFields: [],
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
  };

  const validated = ScrapedPromoSchema.safeParse(completed);
  if (!validated.success) {
    return { status: "invalid" };
  }

  const next =
    scope === null
      ? { status: "pending_review" as const, reviewReason: "match" as const, unparsedCapFields: [] }
      : statusAfterMatch({
          promoType: data.promoType,
          maxStake,
          bonusAmount,
          unparsedCapFields: [],
        });

  const ok = await applyClassification({
    promoId: data.promoId,
    userId: user.userId,
    promoType: data.promoType,
    parsed: validated.data,
    boostPercent,
    bonusAmount,
    maxStake,
    maxWinnings,
    maxWinningsKind: row.maxWinningsKind,
    minOddsAmerican,
    scope,
    next,
    now,
  });

  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
