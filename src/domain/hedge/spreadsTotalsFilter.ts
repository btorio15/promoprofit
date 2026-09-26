import type { OddsEvent } from "@/domain/odds/schemas";
import type { MarketFilterOptions } from "./marketFilter";
import type { ArbMarket, ArbSideQuote } from "./rankArbs";

/**
 * Half-point exact-line extractor for spreads and totals (D-08). Pure,
 * zero-I/O, sibling to marketFilter.ts's extractTwoWayMoneylines — never
 * reads the clock, "now" is always supplied by the caller. Spreads and
 * totals have no tie concept once whole-number (push-risk) lines are
 * excluded, so isTieRiskSport is intentionally not consulted here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True only for a finite number whose fractional part is exactly .5.
 * Native float is safe here (unlike money math elsewhere in this project)
 * because half-integers are exactly representable in IEEE-754, and a line
 * is an identifier, not an amount.
 */
export function isHalfPoint(point: unknown): point is number {
  return typeof point === "number" && Number.isFinite(point) && Math.abs(point % 1) === 0.5;
}

interface SpreadGroup {
  homePoint: number;
  sideA: ArbSideQuote[]; // away team, point = -homePoint
  sideB: ArbSideQuote[]; // home team, point = homePoint
}

interface TotalGroup {
  point: number;
  sideA: ArbSideQuote[]; // Over
  sideB: ArbSideQuote[]; // Under
}

export function extractTwoWaySpreadsAndTotals(
  events: OddsEvent[],
  opts: MarketFilterOptions,
): ArbMarket[] {
  const windowEnd = new Date(opts.now.getTime() + opts.windowDays * DAY_MS);
  const markets: ArbMarket[] = [];

  for (const event of events) {
    if (!opts.sportKeys.has(event.sport_key)) continue;

    const commenceTime = new Date(event.commence_time);
    if (!(commenceTime > opts.now && commenceTime <= windowEnd)) continue;

    // Group by the home team's SIGNED point, not magnitude — this keeps a
    // flipped favorite (Team A +1.5 at one book, Team A -1.5 at another)
    // from being treated as the same line.
    const spreadGroups = new Map<number, SpreadGroup>();
    // Group by the exact total point value.
    const totalGroups = new Map<number, TotalGroup>();

    for (const bookmaker of event.bookmakers) {
      if (!opts.allowedBookKeys.has(bookmaker.key)) continue;

      const spreadsMarket = bookmaker.markets.find((m) => m.key === "spreads");
      if (spreadsMarket && spreadsMarket.outcomes.length === 2) {
        const homeOutcome = spreadsMarket.outcomes.find((o) => o.name === event.home_team);
        const awayOutcome = spreadsMarket.outcomes.find((o) => o.name === event.away_team);

        if (homeOutcome && awayOutcome) {
          const homePoint = homeOutcome.point;
          const awayPoint = awayOutcome.point;

          if (isHalfPoint(homePoint) && isHalfPoint(awayPoint) && awayPoint === -homePoint) {
            let group = spreadGroups.get(homePoint);
            if (!group) {
              group = { homePoint, sideA: [], sideB: [] };
              spreadGroups.set(homePoint, group);
            }
            group.sideA.push({ bookKey: bookmaker.key, oddsAmerican: awayOutcome.price });
            group.sideB.push({ bookKey: bookmaker.key, oddsAmerican: homeOutcome.price });
          }
        }
      }

      const totalsMarket = bookmaker.markets.find((m) => m.key === "totals");
      if (totalsMarket && totalsMarket.outcomes.length === 2) {
        const overOutcome = totalsMarket.outcomes.find((o) => o.name === "Over");
        const underOutcome = totalsMarket.outcomes.find((o) => o.name === "Under");

        if (overOutcome && underOutcome) {
          const overPoint = overOutcome.point;
          const underPoint = underOutcome.point;

          if (isHalfPoint(overPoint) && isHalfPoint(underPoint) && overPoint === underPoint) {
            let group = totalGroups.get(overPoint);
            if (!group) {
              group = { point: overPoint, sideA: [], sideB: [] };
              totalGroups.set(overPoint, group);
            }
            group.sideA.push({ bookKey: bookmaker.key, oddsAmerican: overOutcome.price });
            group.sideB.push({ bookKey: bookmaker.key, oddsAmerican: underOutcome.price });
          }
        }
      }
    }

    // Deterministic order: spreads before totals, then ascending line.
    const spreadLines = [...spreadGroups.keys()].sort((a, b) => a - b);
    for (const line of spreadLines) {
      const group = spreadGroups.get(line)!;
      markets.push({
        eventId: event.id,
        sportKey: event.sport_key,
        commenceTime,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        marketType: "spread",
        line: group.homePoint,
        tieRisk: false,
        sideA: { selection: event.away_team, point: -group.homePoint, quotes: group.sideA },
        sideB: { selection: event.home_team, point: group.homePoint, quotes: group.sideB },
      });
    }

    const totalLines = [...totalGroups.keys()].sort((a, b) => a - b);
    for (const point of totalLines) {
      const group = totalGroups.get(point)!;
      markets.push({
        eventId: event.id,
        sportKey: event.sport_key,
        commenceTime,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        marketType: "total",
        line: point,
        tieRisk: false,
        sideA: { selection: "Over", point, quotes: group.sideA },
        sideB: { selection: "Under", point, quotes: group.sideB },
      });
    }
  }

  return markets;
}
