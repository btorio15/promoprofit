import { isTieRiskSport } from "@/config/sports";
import type { MarketVenueKey } from "@/config/venues";

/**
 * Settlement-difference copy for market legs (D-08, D-09). Every market leg is
 * badged "Settlement differs" because postponement rules differ between a
 * sportsbook and a prediction market for every sport; the tie sentence is added
 * only for tie-risk sports (NFL). Template: "{When}, {book does X} but
 * {venue does Y}. {Consequence}."
 */
const VENUE_SETTLEMENT: Readonly<
  Record<MarketVenueKey, { tie: string; postponement: string }>
> = {
  kalshi: {
    tie: "If the game ends in a tie, the book refunds your bet but this Kalshi contract pays 50¢.",
    postponement:
      "If the game is postponed more than 48 hours, the book may void your bet but Kalshi settles the contract at a price it sets. You could get back less than you paid for the contract.",
  },
  polymarket_us: {
    tie: "If the game ends in a tie, the book refunds your bet but this Polymarket contract settles by that market's own rules.",
    postponement:
      "If the game is postponed, the book may void your bet while the contract stays open. You could lose the contract cost.",
  },
};

export function settlementNoteFor(sportKey: string, venueKey: MarketVenueKey): string {
  const v = VENUE_SETTLEMENT[venueKey];
  return isTieRiskSport(sportKey) ? `${v.tie} ${v.postponement}` : v.postponement;
}
