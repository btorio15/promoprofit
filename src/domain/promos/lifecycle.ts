import type { CapField, PromoSelection, PromoStatus, PromoType, ReviewReason } from "./types";
import type { ScopeGuess } from "./scope";
import type { MatchResult } from "./matcher";
import type { ScrapedPromo } from "./scraped";

/**
 * Status-after-match rule (D-18): a promo becomes active only when every
 * cap field the engine needs is parsed. A profit_boost always needs
 * maxStake -- the solver (profitBoost.ts) is never invoked without one --
 * so a null maxStake always routes to pending_review/caps even if the
 * scraper didn't separately flag it as unparsed. A bonus_bet has no such
 * requirement (its stake is the bonus amount itself); it only reviews when
 * the scraper explicitly couldn't parse a cap field (e.g. minOdds).
 */
export function statusAfterMatch(p: {
  promoType: PromoType;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: readonly CapField[];
}):
  | { status: "active"; reviewReason: null; unparsedCapFields: [] }
  | { status: "pending_review"; reviewReason: "caps"; unparsedCapFields: CapField[] } {
  const fields = new Set<CapField>(p.unparsedCapFields);

  if (p.promoType === "profit_boost" && p.maxStake === null) {
    fields.add("maxStake");
  }

  if (fields.size > 0) {
    return { status: "pending_review", reviewReason: "caps", unparsedCapFields: [...fields] };
  }

  return { status: "active", reviewReason: null, unparsedCapFields: [] };
}

/**
 * Everything decideScrapedWrite needs to know about a promo's existing row
 * (Plan 06/07/08): D-11's flag (autoMatchBlocked), D-14's dismissal, and
 * whichever scope/pin a human already confirmed or corrected (humanScope/
 * humanPinned -- populated by the caller only when confirmed_by_user_id or
 * corrected_by_user_id is set on the row).
 */
export interface ExistingPromoState {
  status: PromoStatus;
  reviewReason: ReviewReason | null;
  autoMatchBlocked: boolean;
  humanScope: ScopeGuess | null;
  humanPinned: PromoSelection | null;
  promoType: PromoType;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: CapField[];
  /**
   * True when a member entered this row's caps (cap_entered_by_user_id set).
   * Member-entered caps are never overwritten by a scrape.
   */
  capsEnteredByMember: boolean;
}

export type ScrapedWriteDecision =
  | { kind: "skip" }
  /** Refresh lastSeenAt/expiresAt only -- cap columns and status are left as they are. */
  | { kind: "touch" }
  /**
   * Re-trust the fresh parse's cap columns AND apply the status/reviewReason
   * re-derived from them (CR-01): a scrape can never leave an active row
   * with a required cap silently nulled -- the row moves back to
   * pending_review/caps instead.
   */
  | {
      kind: "refresh";
      status: PromoStatus;
      reviewReason: ReviewReason | null;
      unparsedCapFields: CapField[];
    }
  | {
      kind: "write";
      status: PromoStatus;
      reviewReason: ReviewReason | null;
      autoMatched: boolean;
      scope: ScopeGuess | null;
      pinned: PromoSelection | null;
      bestGuess: ScopeGuess | null;
      unparsedCapFields: CapField[];
    };

/** Builds the "write" decision for a fresh match attempt (new/re-matched/revived-without-human-scope row). */
function writeForMatch(
  promoType: PromoType,
  maxStake: string | null,
  bonusAmount: string | null,
  unparsedCapFields: readonly CapField[],
  match: MatchResult,
): ScrapedWriteDecision {
  if (match.status === "unmatched") {
    return {
      kind: "write",
      status: "pending_review",
      reviewReason: "match",
      autoMatched: false,
      scope: null,
      pinned: null,
      bestGuess: match.guess,
      unparsedCapFields: [...unparsedCapFields],
    };
  }

  const after = statusAfterMatch({ promoType, maxStake, bonusAmount, unparsedCapFields });
  return {
    kind: "write",
    status: after.status,
    reviewReason: after.reviewReason,
    autoMatched: true,
    scope: match.scope,
    pinned: match.pinned,
    bestGuess: null,
    unparsedCapFields: after.unparsedCapFields,
  };
}

/**
 * Single source of truth for what a scrape write does to one promo row
 * (D-10/D-11/D-14/D-18/D-19). Pure -- the caller (store.ts) supplies the
 * existing row's state (or null for a dedupe key never seen before) and
 * this function alone decides skip/touch/write, never the reverse.
 */
export function decideScrapedWrite(
  existing: ExistingPromoState | null,
  parsed: ScrapedPromo,
  match: MatchResult,
): ScrapedWriteDecision {
  if (existing === null) {
    return writeForMatch(parsed.promoType, parsed.maxStake, parsed.bonusAmount, parsed.unparsedCapFields, match);
  }

  if (existing.status === "dismissed") {
    return { kind: "skip" };
  }

  if (existing.status === "active" || (existing.status === "pending_review" && existing.reviewReason === "caps")) {
    // Member-entered caps are never overwritten by a scrape.
    if (existing.capsEnteredByMember) {
      return { kind: "touch" };
    }
    // CR-01: re-derive status from the fresh parse's caps. An active row
    // whose required cap became unparsed/absent goes back to
    // pending_review/caps (never stays active with a nulled cap); a caps row
    // whose fresh parse now has every required cap becomes active.
    const after = statusAfterMatch({
      promoType: parsed.promoType,
      maxStake: parsed.maxStake,
      bonusAmount: parsed.bonusAmount,
      unparsedCapFields: parsed.unparsedCapFields,
    });
    return {
      kind: "refresh",
      status: after.status,
      reviewReason: after.reviewReason,
      unparsedCapFields: after.unparsedCapFields,
    };
  }

  if (existing.status === "pending_review" && existing.reviewReason === "match") {
    if (existing.autoMatchBlocked) {
      // D-11: stays in match review; only its caps are refreshed.
      if (existing.capsEnteredByMember) {
        return { kind: "touch" };
      }
      return {
        kind: "refresh",
        status: "pending_review",
        reviewReason: "match",
        unparsedCapFields: [...parsed.unparsedCapFields],
      };
    }
    return writeForMatch(parsed.promoType, parsed.maxStake, parsed.bonusAmount, parsed.unparsedCapFields, match);
  }

  if (existing.status === "expired") {
    if (existing.humanScope !== null) {
      const after = statusAfterMatch({
        promoType: existing.promoType,
        maxStake: existing.maxStake,
        bonusAmount: existing.bonusAmount,
        unparsedCapFields: existing.unparsedCapFields,
      });
      return {
        kind: "write",
        status: after.status,
        reviewReason: after.reviewReason,
        autoMatched: false,
        scope: existing.humanScope,
        pinned: existing.humanPinned,
        bestGuess: null,
        unparsedCapFields: after.unparsedCapFields,
      };
    }
    // CR-02 (D-11): a flagged row is never auto-reactivated, even after it
    // expired and reappeared -- it goes back to match review, with the fresh
    // matcher result only as a presentational best guess.
    if (existing.autoMatchBlocked) {
      return {
        kind: "write",
        status: "pending_review",
        reviewReason: "match",
        autoMatched: false,
        scope: null,
        pinned: null,
        bestGuess: match.status === "matched" ? match.scope : match.guess,
        unparsedCapFields: [...parsed.unparsedCapFields],
      };
    }
    return writeForMatch(parsed.promoType, parsed.maxStake, parsed.bonusAmount, parsed.unparsedCapFields, match);
  }

  // Defensive fallback for an unrecognized pending_review reviewReason: never write.
  return { kind: "touch" };
}
