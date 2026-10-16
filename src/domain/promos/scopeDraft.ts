import { etDayBounds, etDayLabel } from "./etTime";
import { MAX_PICKED_GAMES } from "./reviewInput";
import {
  prefillSportDay,
  throughDayOptions,
  type CorrectionSportDayOption,
} from "./correctionOptions";

export { MAX_PICKED_GAMES };

/**
 * quick-260929-hht: the review picker's draft state and its mapping to the
 * server scope input. quick-261016-1se: game mode is a multi-select. The
 * first pick locks the list to that game's league, up to MAX_PICKED_GAMES
 * picks; 1 pick is today's single-game promo, 2-12 are a games promo.
 * Pure, zero-I/O.
 */

export type ScopeSelectionInput =
  | { kind: "event"; eventId: string }
  | { kind: "games"; eventIds: string[] }
  | { kind: "sport_day"; sportKey: string; etDate: string; etEndDate?: string };

/** Flat so toggling modes keeps each mode's own choice. */
export interface ScopeDraft {
  mode: "game" | "league";
  /** Picked game ids in pick order (game mode). */
  eventIds: string[];
  sportKey: string | null;
  fromEtDate: string | null;
  throughEtDate: string | null;
}

export const EMPTY_SCOPE_DRAFT: ScopeDraft = {
  mode: "game",
  eventIds: [],
  sportKey: null,
  fromEtDate: null,
  throughEtDate: null,
};

/** etEndDate only when Through is a non-empty day different from From (single-day payloads stay byte-identical). */
export function scopeInputFromDraft(draft: ScopeDraft): ScopeSelectionInput | null {
  if (draft.mode === "game") {
    const ids = draft.eventIds;
    if (ids.length === 0 || ids.length > MAX_PICKED_GAMES) return null;
    return ids.length === 1 ? { kind: "event", eventId: ids[0] } : { kind: "games", eventIds: [...ids] };
  }
  if (!draft.sportKey || !draft.fromEtDate) return null;
  const through = draft.throughEtDate;
  if (typeof through === "string" && through !== "" && through !== draft.fromEtDate) {
    return { kind: "sport_day", sportKey: draft.sportKey, etDate: draft.fromEtDate, etEndDate: through };
  }
  return { kind: "sport_day", sportKey: draft.sportKey, etDate: draft.fromEtDate };
}

type PickableGame = { eventId: string; sportKey: string };

/** League the picks are locked to: the first pick the options list still knows; null when nothing is picked. */
export function pickedLeague(draft: ScopeDraft, events: readonly PickableGame[]): string | null {
  for (const id of draft.eventIds) {
    const known = events.find((e) => e.eventId === id);
    if (known) return known.sportKey;
  }
  return null;
}

export type GamePickState = "picked" | "available" | "other_league" | "full";

export function gamePickState(draft: ScopeDraft, event: PickableGame, events: readonly PickableGame[]): GamePickState {
  if (draft.eventIds.includes(event.eventId)) return "picked";
  const league = pickedLeague(draft, events);
  if (league !== null && league !== event.sportKey) return "other_league";
  if (draft.eventIds.length >= MAX_PICKED_GAMES) return "full";
  return "available";
}

/** Adds or removes one game; a no-op for a game from another league or past the cap. */
export function togglePickedGame(draft: ScopeDraft, event: PickableGame, events: readonly PickableGame[]): ScopeDraft {
  const state = gamePickState(draft, event, events);
  if (state === "picked") {
    return { ...draft, mode: "game", eventIds: draft.eventIds.filter((id) => id !== event.eventId) };
  }
  if (state === "available") {
    return { ...draft, mode: "game", eventIds: [...draft.eventIds, event.eventId] };
  }
  return draft;
}

export function removePickedGame(draft: ScopeDraft, eventId: string): ScopeDraft {
  return { ...draft, eventIds: draft.eventIds.filter((id) => id !== eventId) };
}

/** The one picked game id (game mode, exactly one pick) -- the only case a market can be pinned. */
export function singlePickedEventId(draft: ScopeDraft): string | null {
  return draft.mode === "game" && draft.eventIds.length === 1 ? draft.eventIds[0] : null;
}

/** Distinct leagues in first-appearance order. */
export function leagueOptions(
  sportDays: readonly CorrectionSportDayOption[],
): { sportKey: string; sportLabel: string }[] {
  const seen = new Set<string>();
  const out: { sportKey: string; sportLabel: string }[] = [];
  for (const day of sportDays) {
    if (seen.has(day.sportKey)) continue;
    seen.add(day.sportKey);
    out.push({ sportKey: day.sportKey, sportLabel: day.sportLabel });
  }
  return out;
}

/** One league's cached days, labelled like "Sun, Sep 27". */
export function fromDayOptions(
  sportDays: readonly CorrectionSportDayOption[],
  sportKey: string | null,
): { etDate: string; label: string }[] {
  if (!sportKey) return [];
  const out: { etDate: string; label: string }[] = [];
  for (const day of sportDays) {
    if (day.sportKey !== sportKey) continue;
    const bounds = etDayBounds(day.etDate);
    if (!bounds) continue;
    out.push({ etDate: day.etDate, label: etDayLabel(bounds.start) });
  }
  return out;
}

/** Picking a league auto-selects its first day (through = same day). */
export function selectLeague(
  draft: ScopeDraft,
  sportKey: string,
  sportDays: readonly CorrectionSportDayOption[],
): ScopeDraft {
  const first = fromDayOptions(sportDays, sportKey)[0]?.etDate ?? null;
  return { ...draft, mode: "league", sportKey, fromEtDate: first, throughEtDate: first };
}

/** Keeps Through when it is still >= From and offered; otherwise resets to the new From day. */
export function selectFromDay(draft: ScopeDraft, etDate: string, now: Date): ScopeDraft {
  const through = draft.throughEtDate;
  const keep =
    through !== null &&
    through >= etDate &&
    throughDayOptions(etDate, now).some((o) => o.etDate === through);
  return { ...draft, mode: "league", fromEtDate: etDate, throughEtDate: keep ? through : etDate };
}

/** League-mode draft from a queued promo's scraped window; null when no same-league day fits. */
export function prefillScopeDraft(
  window: { sportKey: string; startEtDate: string; endEtDate: string } | null | undefined,
  sportDays: CorrectionSportDayOption[],
  now: Date,
): ScopeDraft | null {
  if (!window) return null;
  const pre = prefillSportDay(window, sportDays, now);
  if (!pre) return null;
  const [sportKey, etDate] = pre.value.split("|");
  return { ...EMPTY_SCOPE_DRAFT, mode: "league", sportKey, fromEtDate: etDate, throughEtDate: pre.throughEtDate };
}
