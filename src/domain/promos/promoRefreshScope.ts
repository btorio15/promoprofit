import { SPORTS } from "@/config/sports";
import { ALT_SPREAD_EVENT_LIMIT, buildAltSpreadRequests } from "./altSpreads";
import { isLeagueWideAltSpreadPromo } from "./leagueWideAltTargets";
import type { RankablePromo } from "./rankPromoHedges";

/**
 * quick-261001-jbc: which sports a member's active promos need fresh odds
 * for, and an upper bound on the alt-spread games the shortcut would fetch.
 * Pure, zero-I/O, domain-only (no db/ingestion imports). No money math.
 */

/**
 * D-01: the configured sports the promos cover, in SPORTS config order.
 * An event-scoped promo needs its event's sport, a sport-window promo its
 * sport; an unrestricted ("any") bonus bet can convert on any game, so it
 * needs every sport -- unless it is pinned to a known event, in which case
 * only that event's sport. A promo with no eligible market types
 * contributes nothing.
 */
export function promoRefreshSportKeys(
  promos: readonly RankablePromo[],
  opts: { sportOfEvent?: (eventId: string) => string | undefined } = {},
): string[] {
  const configured = SPORTS.map((s) => s.key);
  const wanted = new Set<string>();
  for (const promo of promos) {
    if (promo.eligibleMarketTypes.length === 0) continue;
    const scope = promo.scope;
    if (scope.kind === "event" || scope.kind === "sport_window") {
      wanted.add(scope.sportKey);
    } else if (promo.pinned) {
      const sport = opts.sportOfEvent?.(promo.pinned.eventId);
      if (sport === undefined) configured.forEach((k) => wanted.add(k));
      else wanted.add(sport);
    } else {
      configured.forEach((k) => wanted.add(k));
    }
  }
  return configured.filter((k) => wanted.has(k));
}

/**
 * D-04 quote helper: an UPPER BOUND on the alt-spread games fetched (pins
 * whose main line already covers them are skipped at fetch time), capped at
 * the shared 5-game limit.
 */
export function estimatePromoAltGames(promos: readonly RankablePromo[]): number {
  const { pins, scopedEventIds } = buildAltSpreadRequests(promos);
  const ids = new Set<string>([...pins.map((p) => p.eventId), ...scopedEventIds]);
  const leagueWide = promos.filter(isLeagueWideAltSpreadPromo).length;
  return Math.min(ALT_SPREAD_EVENT_LIMIT, ids.size + leagueWide);
}
