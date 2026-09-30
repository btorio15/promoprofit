import Decimal from "decimal.js";
import type { AddPromoDraft } from "./addPromoDraft";
import { etDayBounds } from "./etTime";
import { BOOST_PERCENT_PATTERN, MONEY_PATTERN } from "./reviewInput";

/**
 * Phase 5 (D-12): advisory "this looks like a promo already in your list"
 * check. Pure and client-safe (no src/db imports). It only returns a boolean:
 * it never blocks a save and never merges promos.
 */

export type DuplicateCandidate = {
  bookKey: string;
  promoType: string;
  bonusAmount: string | null;
  boostPercent: string | null;
  boostedOddsAmerican: number | null;
  scope:
    | { kind: "event"; eventId: string; sportKey: string }
    | { kind: "sport_window"; sportKey: string; windowStart: string; windowEnd: string }
    | { kind: "any" };
};

export interface DuplicateEventRef {
  eventId: string;
  sportKey: string;
  commenceTime: string;
}

type DraftScope =
  | { kind: "event"; eventId: string; sportKey: string; commenceMs: number }
  | { kind: "window"; sportKey: string; startMs: number; endMs: number }
  | { kind: "any" };

const AMERICAN_ODDS = /^[+-]?\d{1,5}$/;

function decimalEq(a: string, b: string | null, pattern: RegExp): boolean {
  const left = a.trim();
  if (b === null || !pattern.test(left) || !pattern.test(b.trim())) return false;
  return new Decimal(left).eq(new Decimal(b.trim()));
}

function draftScope(draft: AddPromoDraft, events: readonly DuplicateEventRef[]): DraftScope | null {
  const s = draft.scope;
  if (s.mode === "game") {
    if (!s.eventId) return { kind: "any" };
    const ev = events.find((e) => e.eventId === s.eventId);
    if (!ev) return null;
    const commenceMs = Date.parse(ev.commenceTime);
    if (Number.isNaN(commenceMs)) return null;
    return { kind: "event", eventId: ev.eventId, sportKey: ev.sportKey, commenceMs };
  }
  if (!s.sportKey || !s.fromEtDate) return { kind: "any" };
  const from = etDayBounds(s.fromEtDate);
  const through = etDayBounds(s.throughEtDate && s.throughEtDate !== "" ? s.throughEtDate : s.fromEtDate);
  if (!from || !through) return null;
  return { kind: "window", sportKey: s.sportKey, startMs: Date.parse(from.start), endMs: Date.parse(through.end) };
}

function scopesOverlap(
  d: DraftScope,
  c: DuplicateCandidate["scope"],
  events: readonly DuplicateEventRef[],
): boolean {
  if (d.kind === "any" || c.kind === "any") return true;
  if (d.kind === "event") {
    if (c.kind === "event") return d.eventId === c.eventId;
    if (c.sportKey !== d.sportKey) return false;
    return d.commenceMs >= Date.parse(c.windowStart) && d.commenceMs <= Date.parse(c.windowEnd);
  }
  if (c.kind === "event") {
    if (c.sportKey !== d.sportKey) return false;
    const ev = events.find((e) => e.eventId === c.eventId);
    if (!ev) return false;
    const ms = Date.parse(ev.commenceTime);
    return ms >= d.startMs && ms <= d.endMs;
  }
  if (c.sportKey !== d.sportKey) return false;
  return d.startMs <= Date.parse(c.windowEnd) && Date.parse(c.windowStart) <= d.endMs;
}

export function looksLikeDuplicate(
  draft: AddPromoDraft,
  candidates: readonly DuplicateCandidate[],
  events: readonly DuplicateEventRef[],
): boolean {
  if (!draft.bookKey) return false;
  const scope = draftScope(draft, events);
  if (!scope) return false;

  const isBoost = draft.promoType === "profit_boost";
  const oddsText = draft.boostedOdds.trim();
  const useOdds = isBoost && draft.boostMode === "odds";
  if (isBoost) {
    if (useOdds ? !AMERICAN_ODDS.test(oddsText) : !BOOST_PERCENT_PATTERN.test(draft.boostPercent.trim())) {
      return false;
    }
  } else if (!MONEY_PATTERN.test(draft.bonusAmount.trim())) {
    return false;
  }

  return candidates.some((c) => {
    if (c.bookKey !== draft.bookKey || c.promoType !== draft.promoType) return false;
    const amountMatches = isBoost
      ? useOdds
        ? c.boostedOddsAmerican !== null && c.boostedOddsAmerican === Number(oddsText)
        : decimalEq(draft.boostPercent, c.boostPercent, BOOST_PERCENT_PATTERN)
      : decimalEq(draft.bonusAmount, c.bonusAmount, MONEY_PATTERN);
    return amountMatches && scopesOverlap(scope, c.scope, events);
  });
}
