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
 * Everything decideScrapedWrite/decideClassifyWrite need to know about a
 * promo's existing row (Plan 06/07/08; quick-260928-it1): D-11's flag
 * (autoMatchBlocked), D-14's dismissal, and whichever scope/pin a human
 * already confirmed or corrected (humanScope/humanPinned -- populated by the
 * caller only when confirmed_by_user_id or corrected_by_user_id is set on
 * the row).
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
      /**
       * Where the row's cap columns come from after this write: "parsed" =
       * overwrite them from the fresh scrape; "existing" = keep the row's own
       * caps (D-19 human revival, or member-entered caps -- CR-03).
       */
      capsFrom: "parsed" | "existing";
    };

interface CapSource {
  promoType: PromoType;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: readonly CapField[];
  capsFrom: "parsed" | "existing";
}

function capsFromParsed(parsed: ScrapedPromo): CapSource {
  return {
    promoType: parsed.promoType,
    maxStake: parsed.maxStake,
    bonusAmount: parsed.bonusAmount,
    unparsedCapFields: parsed.unparsedCapFields,
    capsFrom: "parsed",
  };
}

/**
 * CR-03: a row whose caps a member entered keeps them on every scrape write
 * (and its status is derived from those caps); otherwise the fresh parse's
 * caps are used.
 */
function capSourceFor(existing: ExistingPromoState, parsed: ScrapedPromo): CapSource {
  if (!existing.capsEnteredByMember) return capsFromParsed(parsed);
  return {
    promoType: existing.promoType,
    maxStake: existing.maxStake,
    bonusAmount: existing.bonusAmount,
    unparsedCapFields: existing.unparsedCapFields,
    capsFrom: "existing",
  };
}

/** True when an event scope's game has started, or a sport_window scope's window has closed. */
function isScopeOver(scope: ScopeGuess, now: Date): boolean {
  const end = scope.kind === "event" ? scope.commenceTime : scope.windowEnd;
  return new Date(end).getTime() <= now.getTime();
}

/** Builds the "write" decision for a fresh match attempt (new/re-matched/revived-without-human-scope row). */
function writeForMatch(caps: CapSource, match: MatchResult): ScrapedWriteDecision {
  const { promoType, maxStake, bonusAmount, unparsedCapFields, capsFrom } = caps;
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
      capsFrom,
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
    capsFrom,
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
  now: Date,
): ScrapedWriteDecision {
  if (existing === null) {
    return writeForMatch(capsFromParsed(parsed), match);
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
    return writeForMatch(capSourceFor(existing, parsed), match);
  }

  if (existing.status === "expired") {
    // WR-02: a human scope whose game already started (or whose window
    // already closed) can't be revived -- the promo would be "active" but
    // invisible. Send it back to match review instead.
    if (existing.humanScope !== null && isScopeOver(existing.humanScope, now)) {
      const caps = capSourceFor(existing, parsed);
      return {
        kind: "write",
        status: "pending_review",
        reviewReason: "match",
        autoMatched: false,
        scope: null,
        pinned: null,
        bestGuess: match.status === "matched" ? match.scope : match.guess,
        unparsedCapFields: [...caps.unparsedCapFields],
        capsFrom: caps.capsFrom,
      };
    }
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
        capsFrom: "existing",
      };
    }
    // CR-02 (D-11): a flagged row is never auto-reactivated, even after it
    // expired and reappeared -- it goes back to match review, with the fresh
    // matcher result only as a presentational best guess.
    const caps = capSourceFor(existing, parsed);
    if (existing.autoMatchBlocked) {
      return {
        kind: "write",
        status: "pending_review",
        reviewReason: "match",
        autoMatched: false,
        scope: null,
        pinned: null,
        bestGuess: match.status === "matched" ? match.scope : match.guess,
        unparsedCapFields: [...caps.unparsedCapFields],
        capsFrom: caps.capsFrom,
      };
    }
    return writeForMatch(caps, match);
  }

  // quick-260928-it1: the parser now understands an entry that was
  // previously a "classify" review row -- treat it exactly like a fresh
  // match attempt (writeForMatch), never the defensive touch fallback.
  if (existing.status === "pending_review" && existing.reviewReason === "classify") {
    return writeForMatch(capsFromParsed(parsed), match);
  }

  // Defensive fallback for an unrecognized pending_review reviewReason: never write.
  return { kind: "touch" };
}

/**
 * quick-260928-it1: decision shape for a classify draft write (store.ts).
 * Reuses ScrapedWriteDecision's "skip"/"touch"/"write" shapes; adds
 * "refresh-draft" for the one case unique to classify rows -- an existing
 * pending_review/classify row whose fresh draft simply overwrites the
 * parsed/raw/cap columns while its status stays pending_review/classify
 * (a member hasn't acted on it yet, so there is nothing to re-derive).
 */
export type ClassifyWriteDecision =
  | { kind: "skip" }
  | { kind: "touch" }
  | { kind: "refresh-draft" }
  | Extract<ScrapedWriteDecision, { kind: "write" }>;

function freshClassifyWrite(): ClassifyWriteDecision {
  return {
    kind: "write",
    status: "pending_review",
    reviewReason: "classify",
    autoMatched: false,
    scope: null,
    pinned: null,
    bestGuess: null,
    unparsedCapFields: [],
    capsFrom: "parsed",
  };
}

function classifyMatchReviewWrite(existing: ExistingPromoState): ClassifyWriteDecision {
  return {
    kind: "write",
    status: "pending_review",
    reviewReason: "match",
    autoMatched: false,
    scope: null,
    pinned: null,
    bestGuess: null,
    unparsedCapFields: [...existing.unparsedCapFields],
    capsFrom: "existing",
  };
}

/**
 * Pure decision for one classify draft's write (quick-260928-it1, D-10-style
 * "never guess" discipline extended to uncertain-entry drafts). Does not take
 * the draft's own fields at all -- a classify write either creates/refreshes
 * a pending_review/classify row (whose cap/parsed columns store.ts fills
 * in from the draft, capsFrom "parsed") or defers entirely to whatever a
 * member/the candidate path already did to the row (touch/skip, or a
 * D-19-style revival using the ROW's own existing caps, capsFrom "existing").
 */
export function decideClassifyWrite(existing: ExistingPromoState | null, now: Date): ClassifyWriteDecision {
  if (existing === null) {
    return freshClassifyWrite();
  }

  if (existing.status === "dismissed") {
    return { kind: "skip" };
  }

  if (existing.status === "pending_review" && existing.reviewReason === "classify") {
    return { kind: "refresh-draft" };
  }

  if (existing.status !== "expired") {
    // active, pending_review/caps, pending_review/match: a member or the
    // candidate path already owns this row -- a classify draft never
    // overwrites it.
    return { kind: "touch" };
  }

  // existing.status === "expired"
  if (existing.humanScope !== null && !isScopeOver(existing.humanScope, now)) {
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
      capsFrom: "existing",
    };
  }

  if (existing.humanScope !== null) {
    // Not caught by the branch above, so its scope must be over.
    return classifyMatchReviewWrite(existing);
  }

  if (existing.capsEnteredByMember) {
    return classifyMatchReviewWrite(existing);
  }

  return freshClassifyWrite();
}
