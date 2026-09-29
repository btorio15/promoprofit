import { etDayBounds, etDayLabel } from "./etTime";
import {
  prefillSportDay,
  throughDayOptions,
  type CorrectionSportDayOption,
} from "./correctionOptions";

/**
 * quick-260929-hht: the review picker's draft state and its mapping to the
 * (unchanged) server scope input. Pure, zero-I/O.
 */

export type ScopeSelectionInput =
  | { kind: "event"; eventId: string }
  | { kind: "sport_day"; sportKey: string; etDate: string; etEndDate?: string };

/** Flat so toggling modes keeps each mode's own choice. */
export interface ScopeDraft {
  mode: "game" | "league";
  eventId: string | null;
  sportKey: string | null;
  fromEtDate: string | null;
  throughEtDate: string | null;
}

export const EMPTY_SCOPE_DRAFT: ScopeDraft = {
  mode: "game",
  eventId: null,
  sportKey: null,
  fromEtDate: null,
  throughEtDate: null,
};

/** etEndDate only when Through is a non-empty day different from From (single-day payloads stay byte-identical). */
export function scopeInputFromDraft(draft: ScopeDraft): ScopeSelectionInput | null {
  if (draft.mode === "game") {
    return draft.eventId ? { kind: "event", eventId: draft.eventId } : null;
  }
  if (!draft.sportKey || !draft.fromEtDate) return null;
  const through = draft.throughEtDate;
  if (typeof through === "string" && through !== "" && through !== draft.fromEtDate) {
    return { kind: "sport_day", sportKey: draft.sportKey, etDate: draft.fromEtDate, etEndDate: through };
  }
  return { kind: "sport_day", sportKey: draft.sportKey, etDate: draft.fromEtDate };
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
