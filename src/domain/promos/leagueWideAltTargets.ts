import type { OddsEvent } from "@/domain/odds/schemas";
import { ALT_SPREADS_MARKET } from "./altSpreads";
import { rankPromoHedges, type RankOptions, type RankablePromo } from "./rankPromoHedges";

/**
 * Picks, per league-wide promo, the single best game on the FRESH MAIN lines
 * (260930-hor). Pure, zero-I/O, domain-only. No money math here: profit is
 * decided by the existing ranker/solvers. Lives apart from altSpreads.ts to
 * avoid an import cycle (selection.ts -> altSpreads.ts).
 */

/** Unpinned, non-event-scoped, spread-eligible promo that could use alt spreads. */
export function isLeagueWideAltSpreadPromo(promo: RankablePromo): boolean {
  if (promo.pinned !== null) return false;
  if (promo.scope.kind === "event") return false;
  if (!promo.eligibleMarketTypes.includes("spread")) return false;
  if (promo.promoType === "profit_boost" && promo.maxStake === null) return false; // D-18
  return true;
}

function stripAlt(events: readonly OddsEvent[]): OddsEvent[] {
  return events.map((event) => ({
    ...event,
    bookmakers: event.bookmakers.map((b) => ({
      ...b,
      markets: b.markets.filter((m) => m.key !== ALT_SPREADS_MARKET),
    })),
  }));
}

/** Top-1 game id per qualifying promo, deduped. No ordering promise. */
export function pickLeagueWideAltSpreadEventIds(promos: readonly RankablePromo[], opts: RankOptions): string[] {
  const moneylineEvents = stripAlt(opts.moneylineEvents);
  const extendedEvents = stripAlt(opts.extendedEvents);
  const ids = new Set<string>();
  for (const promo of promos) {
    if (!isLeagueWideAltSpreadPromo(promo)) continue;
    const top = rankPromoHedges([promo], { ...opts, moneylineEvents, extendedEvents })[0];
    if (top) ids.add(top.selection.eventId);
  }
  return [...ids];
}
