import type { OddsEvent } from "@/domain/odds/schemas";
import { SPORTS, SPORT_KEYS, getSportLabel } from "@/config/sports";
import { formatKickoff } from "@/lib/format";
import { enumerateScopeSelections, type ResolvedSelection } from "./selection";
import { etDayBounds, etDayLabel } from "./etTime";
import { eventSearchText } from "./gameSearch";
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
  homeTeam: string;
  awayTeam: string;
  /** ET calendar day of commenceTime, "YYYY-MM-DD". */
  etDate: string;
  /** Normalized team names + aliases + league label, for client-side search. */
  searchText: string;
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
 * quick-260929-gcn: the "Through" day choices for a multi-day sport window --
 * consecutive ET calendar dates from startEtDate while the day still STARTS
 * within now + windowDays (the same bound resolveMemberScope enforces, so the
 * UI never offers a day the server rejects). [] when startEtDate is invalid or
 * itself beyond the bound.
 */
export function throughDayOptions(
  startEtDate: string,
  now: Date,
  windowDays = DEFAULT_WINDOW_DAYS,
): { etDate: string; label: string }[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startEtDate);
  if (!match || !etDayBounds(startEtDate)) return [];

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const limitMs = now.getTime() + windowDays * ONE_DAY_MS;
  const options: { etDate: string; label: string }[] = [];

  // windowDays + 2 is a hard ceiling on the loop; the limit check breaks first.
  for (let i = 0; i <= windowDays + 2; i++) {
    const etDate = new Date(Date.UTC(year, month - 1, day + i)).toISOString().slice(0, 10);
    const bounds = etDayBounds(etDate);
    if (!bounds || new Date(bounds.start).getTime() > limitMs) break;
    options.push({ etDate, label: etDayLabel(bounds.start) });
  }
  return options;
}

/**
 * quick-260929-gcn: a scraped window's first and last ET days. The end maps
 * back through 12h so slateWindow's after-midnight extension (a CFB slate
 * ending 06:00Z the next day) still names the slate's own day. null on
 * unparseable input or an end before the start.
 */
export function scrapedWindowEtDays(
  windowStart: string,
  windowEnd: string,
): { startEtDate: string; endEtDate: string } | null {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  const startEtDate = etDateKey(windowStart);
  const endEtDate = etDateKey(new Date(Math.max(startMs, endMs - 12 * 60 * 60 * 1000)).toISOString());
  if (endEtDate < startEtDate) return null;
  return { startEtDate, endEtDate };
}

/**
 * quick-260929-gcn: prefill for the review UI's day pickers from a queued
 * promo's scraped window. Picks the same-sport day option on the window's
 * first day, else the earliest same-sport option inside the window; null when
 * none. `value` is the option's value (caller adds its own prefix);
 * throughEtDate is the window's last day clamped into what the Through
 * selector actually offers. Presentational only -- the server re-validates.
 */
export function prefillSportDay(
  window: { sportKey: string; startEtDate: string; endEtDate: string },
  sportDays: CorrectionSportDayOption[],
  now: Date,
): { value: string; throughEtDate: string } | null {
  const sameSport = sportDays.filter((d) => d.sportKey === window.sportKey);
  const chosen =
    sameSport.find((d) => d.etDate === window.startEtDate) ??
    sameSport
      .filter((d) => d.etDate >= window.startEtDate && d.etDate <= window.endEtDate)
      .sort((a, b) => (a.etDate < b.etDate ? -1 : a.etDate > b.etDate ? 1 : 0))[0];
  if (!chosen) return null;

  const offered = throughDayOptions(chosen.etDate, now);
  const last = offered.length > 0 ? offered[offered.length - 1].etDate : chosen.etDate;
  let through = window.endEtDate;
  if (through > last) through = last;
  if (through < chosen.etDate) through = chosen.etDate;
  return { value: chosen.value, throughEtDate: through };
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
    homeTeam: ev.home_team,
    awayTeam: ev.away_team,
    etDate: etDateKey(ev.commence_time),
    searchText: eventSearchText(ev.sport_key, ev.home_team, ev.away_team),
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
