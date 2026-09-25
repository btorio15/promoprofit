import type { OddsEvent } from "@/domain/odds/schemas";
import { isTieRiskSport } from "@/config/sports";

/**
 * Pure market filter (CALC-05): no-push, two-way moneylines only, within
 * the search window, from allowed books/sports. Zero I/O — the caller
 * supplies "now" as an argument; this module never reads the system clock.
 */
export interface MoneylineQuote {
  bookKey: string;
  outcome: "home" | "away";
  team: string;
  oddsAmerican: number;
}

export interface TwoWayMoneylineMarket {
  eventId: string;
  sportKey: string;
  commenceTime: Date;
  homeTeam: string;
  awayTeam: string;
  tieRisk: boolean;
  quotes: MoneylineQuote[];
}

export interface MarketFilterOptions {
  now: Date;
  windowDays: number;
  allowedBookKeys: ReadonlySet<string>;
  sportKeys: ReadonlySet<string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function extractTwoWayMoneylines(
  events: OddsEvent[],
  opts: MarketFilterOptions,
): TwoWayMoneylineMarket[] {
  const windowEnd = new Date(opts.now.getTime() + opts.windowDays * DAY_MS);
  const markets: TwoWayMoneylineMarket[] = [];

  for (const event of events) {
    if (!opts.sportKeys.has(event.sport_key)) continue;

    const commenceTime = new Date(event.commence_time);
    if (!(commenceTime > opts.now && commenceTime <= windowEnd)) continue;

    const expectedNames = new Set([event.home_team, event.away_team]);
    const quotes: MoneylineQuote[] = [];

    for (const bookmaker of event.bookmakers) {
      if (!opts.allowedBookKeys.has(bookmaker.key)) continue;

      const h2h = bookmaker.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      if (h2h.outcomes.length !== 2) continue;

      const outcomeNames = new Set(h2h.outcomes.map((o) => o.name));
      const namesMatch =
        outcomeNames.size === 2 &&
        [...outcomeNames].every((name) => expectedNames.has(name));
      if (!namesMatch) continue;

      for (const outcome of h2h.outcomes) {
        const side: "home" | "away" = outcome.name === event.home_team ? "home" : "away";
        quotes.push({
          bookKey: bookmaker.key,
          outcome: side,
          team: outcome.name,
          oddsAmerican: outcome.price,
        });
      }
    }

    if (quotes.length === 0) continue;

    markets.push({
      eventId: event.id,
      sportKey: event.sport_key,
      commenceTime,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      tieRisk: isTieRiskSport(event.sport_key),
      quotes,
    });
  }

  return markets;
}
