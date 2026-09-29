import type { OddsEvent } from "@/domain/odds/schemas";
import { etDayBounds } from "./etTime";
import { DEFAULT_WINDOW_DAYS } from "./correctionOptions";
import type { ScopeGuess } from "./scope";

/**
 * quick-260928-it1: pure(ish) scope resolution shared by correctPromoMatch
 * and classifyPromo (T-it1-03) -- lifted verbatim from correct-promo-match.ts's
 * event lookup and its etDayBounds/DEFAULT_WINDOW_DAYS sport-day branch, so
 * neither action re-implements (or drifts on) the same staleness/validity
 * rules. The pin resolution itself stays in correct-promo-match.ts (it needs
 * the promo's own eligibleMarketTypes, which classifyPromo doesn't have yet
 * at this point) -- this module only resolves the SCOPE, returning the
 * matched OddsEvent (event-kind only, null for sport_day) so the caller can
 * do its own pin resolution against the same event without a second lookup.
 */

export type MemberScopeInput =
  | { kind: "event"; eventId: string }
  | { kind: "sport_day"; sportKey: string; etDate: string; etEndDate?: string };

export type MemberScopeResult =
  | { status: "ok"; scope: ScopeGuess; event: OddsEvent | null }
  | { status: "stale"; message: string }
  | { status: "invalid" };

/**
 * Resolves a member-chosen scope input against the current cached odds
 * (moneyline ∪ extended). An event choice must still exist in the cache with
 * a future commence time; a sport_day choice's ET-day bounds are always
 * recomputed server-side from its date string (never trusted from the
 * client), rejected outright when the calendar date is impossible (WR-12),
 * stale when its ET day has already ended, and invalid when it's beyond the
 * DEFAULT_WINDOW_DAYS correction window. An optional etEndDate makes it a
 * multi-day range (start day's start .. end day's end): end-before-start is
 * invalid, and it is stale only once the END day is over.
 */
export function resolveMemberScope(
  input: MemberScopeInput,
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  now: Date,
): MemberScopeResult {
  if (input.kind === "event") {
    const event = [...events.moneyline, ...events.extended].find((ev) => ev.id === input.eventId);

    if (!event || new Date(event.commence_time).getTime() <= now.getTime()) {
      return { status: "stale", message: "That game is no longer in the cached odds. Pick another." };
    }

    return {
      status: "ok",
      scope: {
        kind: "event",
        eventId: event.id,
        sportKey: event.sport_key,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: event.commence_time,
      },
      event,
    };
  }

  const endEtDate = input.etEndDate ?? input.etDate;
  const startBounds = etDayBounds(input.etDate);
  const endBounds = etDayBounds(endEtDate);
  // WR-12: an impossible calendar date (e.g. 2026-02-31) is rejected, never rolled over.
  if (!startBounds || !endBounds) {
    return { status: "invalid" };
  }
  // Both are validated YYYY-MM-DD strings here, so a string compare orders them.
  if (endEtDate < input.etDate) {
    return { status: "invalid" };
  }
  // Stale only when the END day is over (a range may already be under way).
  if (new Date(endBounds.end).getTime() <= now.getTime()) {
    return {
      status: "stale",
      message:
        endEtDate === input.etDate
          ? "That day has already passed. Pick another."
          : "Those days have already passed. Pick another.",
    };
  }
  // ...and a day beyond the correction window the dropdown offers is refused.
  const windowLimitMs = now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (
    new Date(startBounds.start).getTime() > windowLimitMs ||
    new Date(endBounds.start).getTime() > windowLimitMs
  ) {
    return { status: "invalid" };
  }

  return {
    status: "ok",
    scope: {
      kind: "sport_window",
      sportKey: input.sportKey,
      windowStart: startBounds.start,
      windowEnd: endBounds.end,
    },
    event: null,
  };
}
