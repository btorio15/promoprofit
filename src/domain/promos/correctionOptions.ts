import type { OddsEvent } from "@/domain/odds/schemas";
import { SPORTS, SPORT_KEYS, getSportLabel } from "@/config/sports";
import { formatKickoff } from "@/lib/format";
import { enumerateScopeSelections, type ResolvedSelection } from "./selection";
import { etDayLabel } from "./etTime";
import { PROMO_MARKET_TYPES, type PromoMarketType, type PromoSide } from "./types";

/**
 * Correct sub-panel dropdown options (D-14, ARCHITECTURE.md Pattern 1
 * "dropdown-first"), built ONLY from the existing cached-odds pool
 * (T-03-09-06) -- never a fresh Odds API call, never an ingestion import.
 * Pure, zero-I/O: both getCachedEvents()/getCachedExtendedEvents() reads
 * happen in the caller (correct-promo-match.ts / get-promos.ts); this
 * module only shapes their union into member-facing choices. The pool rule
 * mirrors what the auto-matcher and enumerateScopeSelections already
 * enforce for real bets (moneyline ∪ extended, deduped, SPORT_KEYS only,
 * commence strictly within (now, now+windowDays]) -- a member is never
 * offered a choice the app itself would reject.
 */

export interface CorrectionMarketOption {
  /** "best" for the app-picks default; else `${marketType}|${line ?? "ml"}|${side}`. */
  value: string;
  label: string;
  pinned: { marketType: PromoMarketType; line: number | null; side: PromoSide } | null;
}

export interface CorrectionEventOption {
  eventId: string;
  sportKey: string;
  sportLabel: string;
  /** "{away} @ {home} · {kickoff}". */
  label: string;
  commenceTime: string;
  markets: CorrectionMarketOption[];
}

export interface CorrectionSportDayOption {
  /** `${sportKey}|${etDate}`. */
  value: string;
  sportKey: string;
  sportLabel: string;
  /** "YYYY-MM-DD", an ET calendar day. */
  etDate: string;
  label: string;
}

export interface CorrectionOptions {
  events: CorrectionEventOption[];
  sportDays: CorrectionSportDayOption[];
}

/** How far ahead the Correct sub-panel offers games/days; correctPromoMatch enforces the same bound (WR-12). */
export const DEFAULT_WINDOW_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const SPORT_ORDER = new Map(SPORTS.map((sport, index) => [sport.key, index]));

function sportOrderOf(sportKey: string): number {
  return SPORT_ORDER.get(sportKey) ?? Number.MAX_SAFE_INTEGER;
}

/** U+2212 minus, matching src/domain/arb/labels.ts's signedPoint convention. */
function signedPoint(point: number): string {
  return point >= 0 ? `+${point}` : `−${Math.abs(point)}`;
}

const ET_DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** ISO instant -> its ET calendar day as "YYYY-MM-DD" (en-CA formats that way natively). */
function etDateKey(iso: string): string {
  return ET_DAY_KEY_FORMATTER.format(new Date(iso));
}

/**
 * The event pool: moneyline ∪ extended, deduped by event id, restricted to
 * SPORT_KEYS, with commence_time strictly within (now, now+windowDays]. Both
 * caches describe the same event identically on id/sport/teams/commence, so
 * either copy is a fine representative once merged.
 */
function poolEvents(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  now: Date,
  windowDays: number,
): OddsEvent[] {
  const byId = new Map<string, OddsEvent>();
  for (const ev of events.moneyline) byId.set(ev.id, ev);
  for (const ev of events.extended) byId.set(ev.id, ev);

  const nowMs = now.getTime();
  const windowEndMs = nowMs + windowDays * ONE_DAY_MS;

  return [...byId.values()].filter((ev) => {
    if (!SPORT_KEYS.includes(ev.sport_key)) return false;
    const commenceMs = new Date(ev.commence_time).getTime();
    return commenceMs > nowMs && commenceMs <= windowEndMs;
  });
}

function bySportThenCommence(a: OddsEvent, b: OddsEvent): number {
  const orderDiff = sportOrderOf(a.sport_key) - sportOrderOf(b.sport_key);
  if (orderDiff !== 0) return orderDiff;
  return new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
}

function marketOptionFor(resolved: ResolvedSelection): CorrectionMarketOption {
  const lineKey = resolved.line === null ? "ml" : resolved.line;
  const value = `${resolved.marketType}|${lineKey}|${resolved.side}`;
  const pinned = { marketType: resolved.marketType, line: resolved.line, side: resolved.side };

  let label: string;
  if (resolved.marketType === "moneyline") {
    label = `Moneyline — ${resolved.sideSelection}`;
  } else if (resolved.marketType === "spread") {
    label = `Spread ${signedPoint(resolved.sidePoint ?? 0)} — ${resolved.sideSelection}`;
  } else {
    label = `Total O/U ${resolved.line} — ${resolved.sideSelection}`;
  }

  return { value, label, pinned };
}

/**
 * Builds a game's own market/side options (Claude's discretion default for
 * "Best available (app picks)" copy, per 03-UI-SPEC.md's note that the spec
 * predates scope-based promos, 03-RECON.md Design Implication 1): the
 * app-picks default always comes first, followed by one option per
 * enumerateScopeSelections result for that single event -- half-point-only
 * spread/total lines and 2-way-only markets are already enforced by
 * enumerateScopeSelections/resolveSelection, not re-checked here.
 */
function marketsForEvent(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  event: OddsEvent,
  now: Date,
): CorrectionMarketOption[] {
  const resolved = enumerateScopeSelections(
    events,
    { kind: "event", eventId: event.id, sportKey: event.sport_key },
    { now, eligibleMarketTypes: PROMO_MARKET_TYPES },
  );

  return [{ value: "best", label: "Best available (app picks)", pinned: null }, ...resolved.map(marketOptionFor)];
}

export function listCorrectionOptions(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  opts: { now: Date; windowDays?: number },
): CorrectionOptions {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const pool = poolEvents(events, opts.now, windowDays).sort(bySportThenCommence);

  const eventOptions: CorrectionEventOption[] = pool.map((ev) => ({
    eventId: ev.id,
    sportKey: ev.sport_key,
    sportLabel: getSportLabel(ev.sport_key),
    label: `${ev.away_team} @ ${ev.home_team} · ${formatKickoff(ev.commence_time)}`,
    commenceTime: ev.commence_time,
    markets: marketsForEvent(events, ev, opts.now),
  }));

  const dayMap = new Map<string, { sportKey: string; etDate: string; sampleCommence: string }>();
  for (const ev of pool) {
    const etDate = etDateKey(ev.commence_time);
    const key = `${ev.sport_key}|${etDate}`;
    if (!dayMap.has(key)) {
      dayMap.set(key, { sportKey: ev.sport_key, etDate, sampleCommence: ev.commence_time });
    }
  }

  const sportDays: CorrectionSportDayOption[] = [...dayMap.values()]
    .sort((a, b) => {
      const orderDiff = sportOrderOf(a.sportKey) - sportOrderOf(b.sportKey);
      if (orderDiff !== 0) return orderDiff;
      return a.etDate < b.etDate ? -1 : a.etDate > b.etDate ? 1 : 0;
    })
    .map((d) => ({
      value: `${d.sportKey}|${d.etDate}`,
      sportKey: d.sportKey,
      sportLabel: getSportLabel(d.sportKey),
      etDate: d.etDate,
      label: `Any ${getSportLabel(d.sportKey)} game · ${etDayLabel(d.sampleCommence)} (ET)`,
    }));

  return { events: eventOptions, sportDays };
}
