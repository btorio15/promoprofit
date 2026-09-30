import type { OddsEvent } from "@/domain/odds/schemas";
import { isHalfPoint } from "@/domain/hedge/spreadsTotalsFilter";
import { isTieRiskSport } from "@/config/sports";
import type { PromoMarketType, PromoSelection, PromoSide } from "./types";
import { eventInScope, type PromoScope } from "./scope";
import { ALT_SPREADS_MARKET, samePoint } from "./altSpreads";

/**
 * Candidate selection resolution + scope-wide enumeration (D-02, CALC-05,
 * 03-RECON.md Design Implication 1). Pure, zero-I/O -- this is the same
 * cross-market search the bonus-bet finder does (marketFilter.ts/
 * spreadsTotalsFilter.ts), applied to a promo's scope instead of a fixed
 * "now + windowDays" search, and to one PromoSelection at a time rather
 * than building whole markets.
 */

export interface SelectionQuote {
  bookKey: string;
  oddsAmerican: number;
}

export interface ResolvedSelection {
  eventId: string;
  sportKey: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  tieRisk: boolean;
  marketType: PromoMarketType;
  line: number | null;
  side: PromoSide;
  sideSelection: string;
  sidePoint: number | null;
  oppositeSelection: string;
  oppositePoint: number | null;
  promoSideQuotes: SelectionQuote[];
  oppositeSideQuotes: SelectionQuote[];
}

function resolveMoneyline(event: OddsEvent, sel: PromoSelection): ResolvedSelection | null {
  const promoTeam = sel.side === "home" ? event.home_team : event.away_team;
  const oppositeTeam = sel.side === "home" ? event.away_team : event.home_team;

  const promoSideQuotes: SelectionQuote[] = [];
  const oppositeSideQuotes: SelectionQuote[] = [];

  for (const bookmaker of event.bookmakers) {
    const h2h = bookmaker.markets.find((m) => m.key === "h2h");
    if (!h2h || h2h.outcomes.length !== 2) continue;

    const promoOutcome = h2h.outcomes.find((o) => o.name === promoTeam);
    const oppositeOutcome = h2h.outcomes.find((o) => o.name === oppositeTeam);
    if (!promoOutcome || !oppositeOutcome) continue;

    promoSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: promoOutcome.price });
    oppositeSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: oppositeOutcome.price });
  }

  if (promoSideQuotes.length === 0 && oppositeSideQuotes.length === 0) return null;

  return {
    eventId: event.id,
    sportKey: event.sport_key,
    commenceTime: new Date(event.commence_time),
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    tieRisk: isTieRiskSport(event.sport_key),
    marketType: "moneyline",
    line: null,
    side: sel.side,
    sideSelection: promoTeam,
    sidePoint: null,
    oppositeSelection: oppositeTeam,
    oppositePoint: null,
    promoSideQuotes,
    oppositeSideQuotes,
  };
}

function resolveSpread(event: OddsEvent, sel: PromoSelection): ResolvedSelection | null {
  if (sel.line === null || !isHalfPoint(sel.line)) return null;

  const expectedHomePoint = sel.side === "home" ? sel.line : -sel.line;
  const promoTeam = sel.side === "home" ? event.home_team : event.away_team;
  const oppositeTeam = sel.side === "home" ? event.away_team : event.home_team;

  const promoSideQuotes: SelectionQuote[] = [];
  const oppositeSideQuotes: SelectionQuote[] = [];
  const mainQuoted = new Set<string>();

  for (const bookmaker of event.bookmakers) {
    const spreads = bookmaker.markets.find((m) => m.key === "spreads");
    if (!spreads || spreads.outcomes.length !== 2) continue;

    const homeOutcome = spreads.outcomes.find((o) => o.name === event.home_team);
    const awayOutcome = spreads.outcomes.find((o) => o.name === event.away_team);
    if (!homeOutcome || !awayOutcome) continue;
    if (!isHalfPoint(homeOutcome.point) || !isHalfPoint(awayOutcome.point)) continue;
    if (awayOutcome.point !== -homeOutcome.point) continue;
    if (homeOutcome.point !== expectedHomePoint) continue;

    const promoOutcome = sel.side === "home" ? homeOutcome : awayOutcome;
    const oppositeOutcome = sel.side === "home" ? awayOutcome : homeOutcome;
    promoSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: promoOutcome.price });
    oppositeSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: oppositeOutcome.price });
    mainQuoted.add(bookmaker.key);
  }

  // Alternate-spread fallback (quick 260930-gam): books without a main-line
  // quote at this point may quote it in the cached alternate_spreads market.
  // Exact points only: the promo line and its exact negation for the hedge.
  for (const bookmaker of event.bookmakers) {
    if (mainQuoted.has(bookmaker.key)) continue;
    const alt = bookmaker.markets.find((m) => m.key === ALT_SPREADS_MARKET);
    if (!alt) continue;

    const promoOutcome = alt.outcomes.find((o) => o.name === promoTeam && samePoint(o.point, sel.line));
    const oppositeOutcome = alt.outcomes.find((o) => o.name === oppositeTeam && samePoint(o.point, -sel.line!));
    if (promoOutcome) promoSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: promoOutcome.price });
    if (oppositeOutcome) oppositeSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: oppositeOutcome.price });
  }

  if (promoSideQuotes.length === 0 && oppositeSideQuotes.length === 0) return null;

  return {
    eventId: event.id,
    sportKey: event.sport_key,
    commenceTime: new Date(event.commence_time),
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    tieRisk: false,
    marketType: "spread",
    line: sel.line,
    side: sel.side,
    sideSelection: promoTeam,
    sidePoint: sel.line,
    oppositeSelection: oppositeTeam,
    oppositePoint: -sel.line,
    promoSideQuotes,
    oppositeSideQuotes,
  };
}

function resolveTotal(event: OddsEvent, sel: PromoSelection): ResolvedSelection | null {
  if (sel.line === null || !isHalfPoint(sel.line)) return null;

  const promoSideQuotes: SelectionQuote[] = [];
  const oppositeSideQuotes: SelectionQuote[] = [];

  for (const bookmaker of event.bookmakers) {
    const totals = bookmaker.markets.find((m) => m.key === "totals");
    if (!totals || totals.outcomes.length !== 2) continue;

    const overOutcome = totals.outcomes.find((o) => o.name === "Over");
    const underOutcome = totals.outcomes.find((o) => o.name === "Under");
    if (!overOutcome || !underOutcome) continue;
    if (!isHalfPoint(overOutcome.point) || !isHalfPoint(underOutcome.point)) continue;
    if (overOutcome.point !== underOutcome.point) continue;
    if (overOutcome.point !== sel.line) continue;

    const promoOutcome = sel.side === "over" ? overOutcome : underOutcome;
    const oppositeOutcome = sel.side === "over" ? underOutcome : overOutcome;
    promoSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: promoOutcome.price });
    oppositeSideQuotes.push({ bookKey: bookmaker.key, oddsAmerican: oppositeOutcome.price });
  }

  if (promoSideQuotes.length === 0 && oppositeSideQuotes.length === 0) return null;

  return {
    eventId: event.id,
    sportKey: event.sport_key,
    commenceTime: new Date(event.commence_time),
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    tieRisk: false,
    marketType: "total",
    line: sel.line,
    side: sel.side,
    sideSelection: sel.side === "over" ? "Over" : "Under",
    sidePoint: sel.line,
    oppositeSelection: sel.side === "over" ? "Under" : "Over",
    oppositePoint: sel.line,
    promoSideQuotes,
    oppositeSideQuotes,
  };
}

/**
 * Resolves a single pinned or candidate PromoSelection against the given
 * cache of events, returning every book's quote on both the promoted side
 * and its 2-way opposite. Null when the event is unknown, the market/side
 * yields no book quotes on either side, or (spread/total) the line is not
 * an exact half-point (CALC-05).
 */
export function resolveSelection(events: OddsEvent[], sel: PromoSelection): ResolvedSelection | null {
  const event = events.find((e) => e.id === sel.eventId);
  if (!event) return null;

  if (sel.marketType === "moneyline") return resolveMoneyline(event, sel);
  if (sel.marketType === "spread") return resolveSpread(event, sel);
  return resolveTotal(event, sel);
}

function hasTwoWayMoneyline(event: OddsEvent): boolean {
  return event.bookmakers.some((b) => {
    const h2h = b.markets.find((m) => m.key === "h2h");
    return !!h2h && h2h.outcomes.length === 2;
  });
}

function collectSpreadHomePoints(event: OddsEvent): number[] {
  const points = new Set<number>();
  for (const bookmaker of event.bookmakers) {
    const spreads = bookmaker.markets.find((m) => m.key === "spreads");
    if (!spreads || spreads.outcomes.length !== 2) continue;

    const homeOutcome = spreads.outcomes.find((o) => o.name === event.home_team);
    const awayOutcome = spreads.outcomes.find((o) => o.name === event.away_team);
    if (!homeOutcome || !awayOutcome) continue;
    if (!isHalfPoint(homeOutcome.point) || !isHalfPoint(awayOutcome.point)) continue;
    if (awayOutcome.point !== -homeOutcome.point) continue;

    points.add(homeOutcome.point);
  }
  return [...points];
}

/**
 * Half-point home-team points quoted in one book's alternate_spreads market
 * (quick 260930-gyl). Outcome names must equal home/away team exactly;
 * anything else is ignored, never guessed. Whole numbers are skipped (push).
 */
function collectAltSpreadHomePoints(event: OddsEvent, bookKey: string): number[] {
  const points = new Map<number, number>();
  for (const bookmaker of event.bookmakers) {
    if (bookmaker.key !== bookKey) continue;
    const alt = bookmaker.markets.find((m) => m.key === ALT_SPREADS_MARKET);
    if (!alt) continue;
    for (const o of alt.outcomes) {
      if (!isHalfPoint(o.point)) continue;
      let home: number;
      if (o.name === event.home_team) home = o.point;
      else if (o.name === event.away_team) home = -o.point;
      else continue;
      points.set(Math.round(home * 2), home);
    }
  }
  return [...points.values()];
}

function collectTotalPoints(event: OddsEvent): number[] {
  const points = new Set<number>();
  for (const bookmaker of event.bookmakers) {
    const totals = bookmaker.markets.find((m) => m.key === "totals");
    if (!totals || totals.outcomes.length !== 2) continue;

    const overOutcome = totals.outcomes.find((o) => o.name === "Over");
    const underOutcome = totals.outcomes.find((o) => o.name === "Under");
    if (!overOutcome || !underOutcome) continue;
    if (!isHalfPoint(overOutcome.point) || !isHalfPoint(underOutcome.point)) continue;
    if (overOutcome.point !== underOutcome.point) continue;

    points.add(overOutcome.point);
  }
  return [...points];
}

const MARKET_ORDER: Record<PromoMarketType, number> = { moneyline: 0, spread: 1, total: 2 };
const SIDE_ORDER: Record<PromoSide, number> = { home: 0, away: 1, over: 2, under: 3 };

function compareResolvedSelections(a: ResolvedSelection, b: ResolvedSelection): number {
  const timeDiff = a.commenceTime.getTime() - b.commenceTime.getTime();
  if (timeDiff !== 0) return timeDiff;
  if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
  const marketDiff = MARKET_ORDER[a.marketType] - MARKET_ORDER[b.marketType];
  if (marketDiff !== 0) return marketDiff;
  const aLine = a.line ?? 0;
  const bLine = b.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;
  return SIDE_ORDER[a.side] - SIDE_ORDER[b.side];
}

/**
 * Every 2-way candidate PromoSelection inside a promo's scope, resolved
 * against the correct cache, sorted deterministically (commence asc,
 * eventId, market, line asc, side). This is the same search the bonus-bet
 * finder does across markets (03-RECON.md Design Implication 1), scoped to
 * one promo instead of one fixed "now + windowDays" search window.
 * Moneyline candidates come from the moneyline cache, falling back to the
 * extended cache when the event is absent there; spread/total candidates
 * come from the extended cache only. Events whose commence_time is not
 * strictly in the future are excluded.
 *
 * Alternate spreads are OPT-IN via `altSpreadBookKey` (quick 260930-gyl):
 * when set, that book's half-point alternate_spreads points are added to
 * the main-line points. Default off so the market-correction dropdown
 * (correctionOptions.ts) keeps listing main lines only.
 */
export function enumerateScopeSelections(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  scope: PromoScope,
  opts: { now: Date; eligibleMarketTypes: readonly PromoMarketType[]; altSpreadBookKey?: string },
): ResolvedSelection[] {
  const eligibleSet = new Set(opts.eligibleMarketTypes);

  const moneylineById = new Map(events.moneyline.map((e) => [e.id, e]));
  const extendedById = new Map(events.extended.map((e) => [e.id, e]));

  const allIds = new Set<string>([...moneylineById.keys(), ...extendedById.keys()]);

  const results: ResolvedSelection[] = [];

  for (const eventId of allIds) {
    const descriptor = extendedById.get(eventId) ?? moneylineById.get(eventId);
    if (!descriptor) continue;

    const commence = new Date(descriptor.commence_time);
    if (!(commence.getTime() > opts.now.getTime())) continue;

    if (
      !eventInScope(
        { id: descriptor.id, sport_key: descriptor.sport_key, commence_time: descriptor.commence_time },
        scope,
      )
    ) {
      continue;
    }

    const candidates: PromoSelection[] = [];

    if (eligibleSet.has("moneyline")) {
      const mlEvent = moneylineById.get(eventId) ?? extendedById.get(eventId);
      if (mlEvent && hasTwoWayMoneyline(mlEvent)) {
        candidates.push({ eventId, marketType: "moneyline", line: null, side: "home" });
        candidates.push({ eventId, marketType: "moneyline", line: null, side: "away" });
      }
    }

    const extEvent = extendedById.get(eventId);
    if (extEvent) {
      if (eligibleSet.has("spread")) {
        const homePoints = new Map<number, number>();
        for (const p of collectSpreadHomePoints(extEvent)) homePoints.set(Math.round(p * 2), p);
        if (opts.altSpreadBookKey) {
          for (const p of collectAltSpreadHomePoints(extEvent, opts.altSpreadBookKey)) {
            homePoints.set(Math.round(p * 2), p);
          }
        }
        for (const homePoint of homePoints.values()) {
          candidates.push({ eventId, marketType: "spread", line: homePoint, side: "home" });
          candidates.push({ eventId, marketType: "spread", line: -homePoint, side: "away" });
        }
      }
      if (eligibleSet.has("total")) {
        for (const point of collectTotalPoints(extEvent)) {
          candidates.push({ eventId, marketType: "total", line: point, side: "over" });
          candidates.push({ eventId, marketType: "total", line: point, side: "under" });
        }
      }
    }

    for (const candidate of candidates) {
      const sourceEvents =
        candidate.marketType === "moneyline"
          ? moneylineById.has(eventId)
            ? events.moneyline
            : events.extended
          : events.extended;
      const resolved = resolveSelection(sourceEvents, candidate);
      if (resolved) results.push(resolved);
    }
  }

  results.sort(compareResolvedSelections);
  return results;
}
