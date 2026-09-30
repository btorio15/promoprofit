import type { OddsEvent } from "@/domain/odds/schemas";
import { isHalfPoint } from "@/domain/hedge/spreadsTotalsFilter";

/**
 * Alternate-spread helpers for pinned promos (quick 260930-gam). Pure,
 * zero-I/O, domain-only (no db/ingestion imports, D-16). Decides which
 * pinned games need a per-event alternate_spreads fetch and merges that
 * market into a buffered extended-odds event.
 */

export const ALT_SPREADS_MARKET = "alternate_spreads";
export const ALT_SPREAD_EVENT_LIMIT = 5;

export interface AltSpreadPin {
  eventId: string;
  /** The promo team's own point (e.g. -6.5 for "Team A -6.5"). */
  line: number;
  side: "home" | "away";
}

export interface AltSpreadTarget {
  sportKey: string;
  eventId: string;
  commenceTime: string;
}

/** Half-point-safe equality: points are identifiers, compared at 0.5 resolution. */
export function samePoint(a: unknown, b: unknown): boolean {
  return (
    typeof a === "number" &&
    typeof b === "number" &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.round(a * 2) === Math.round(b * 2)
  );
}

function homePointOf(pin: AltSpreadPin): number {
  return pin.side === "home" ? pin.line : -pin.line;
}

function mainLineCovers(event: OddsEvent, homePoint: number): boolean {
  if (event.bookmakers.length === 0) return false;
  return event.bookmakers.every((bookmaker) => {
    const spreads = bookmaker.markets.find((m) => m.key === "spreads");
    if (!spreads) return false;
    const home = spreads.outcomes.find((o) => o.name === event.home_team);
    return !!home && samePoint(home.point, homePoint);
  });
}

export function selectAltSpreadTargets(
  pins: AltSpreadPin[],
  extendedEvents: OddsEvent[],
  now: Date,
): { targets: AltSpreadTarget[]; skippedOverLimit: number } {
  const byId = new Map(extendedEvents.map((e) => [e.id, e]));
  const pinsByEvent = new Map<string, AltSpreadPin[]>();
  for (const pin of pins) {
    if (!isHalfPoint(pin.line)) continue;
    const list = pinsByEvent.get(pin.eventId) ?? [];
    list.push(pin);
    pinsByEvent.set(pin.eventId, list);
  }

  const candidates: AltSpreadTarget[] = [];
  for (const [eventId, eventPins] of pinsByEvent) {
    const event = byId.get(eventId);
    if (!event) continue;
    if (!(new Date(event.commence_time).getTime() > now.getTime())) continue;
    if (eventPins.every((p) => mainLineCovers(event, homePointOf(p)))) continue;
    candidates.push({ sportKey: event.sport_key, eventId, commenceTime: event.commence_time });
  }

  candidates.sort((a, b) => {
    const diff = new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
    if (diff !== 0) return diff;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  return {
    targets: candidates.slice(0, ALT_SPREAD_EVENT_LIMIT),
    skippedOverLimit: Math.max(0, candidates.length - ALT_SPREAD_EVENT_LIMIT),
  };
}

/**
 * Returns a NEW event with each allowed alt bookmaker's alternate_spreads
 * market set on the matching bookmaker entry (created when absent). Never
 * mutates its inputs; other markets are untouched.
 */
export function mergeAltSpreads(
  event: OddsEvent,
  altEvent: OddsEvent,
  allowedBookKeys: readonly string[],
): OddsEvent {
  const allowed = new Set(allowedBookKeys);
  const bookmakers = event.bookmakers.map((b) => ({ ...b, markets: [...b.markets] }));

  for (const altBook of altEvent.bookmakers) {
    if (!allowed.has(altBook.key)) continue;
    const altMarket = altBook.markets.find((m) => m.key === ALT_SPREADS_MARKET);
    if (!altMarket) continue;

    const existing = bookmakers.find((b) => b.key === altBook.key);
    if (existing) {
      existing.markets = [...existing.markets.filter((m) => m.key !== ALT_SPREADS_MARKET), altMarket];
    } else {
      bookmakers.push({ key: altBook.key, title: altBook.title, markets: [altMarket] });
    }
  }

  return { ...event, bookmakers };
}

/**
 * Counts alt-market outcomes whose names match neither team of the event
 * (assumption A2: alt outcome names equal home_team/away_team). Surfaced in
 * the refresh outcome so a naming mismatch is visible, never silent.
 */
export function countUnmatchedAltOutcomes(event: OddsEvent): number {
  let n = 0;
  for (const b of event.bookmakers) {
    const m = b.markets.find((x) => x.key === ALT_SPREADS_MARKET);
    if (!m) continue;
    for (const o of m.outcomes) {
      if (o.name !== event.home_team && o.name !== event.away_team) n += 1;
    }
  }
  return n;
}
