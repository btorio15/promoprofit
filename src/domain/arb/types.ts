/**
 * Serializable DTOs returned by the findArbs server action. All money is a
 * fixed 2-dp string, never a number, so it can cross the server/client
 * boundary without ever passing through float arithmetic (mirrors
 * src/domain/finder/types.ts's "all money is a fixed 2-dp string" contract).
 */
export interface ArbLegDTO {
  bookKey: string;
  bookName: string;
  selection: string;
  oddsAmerican: number;
  /** Display names of other books exactly tying this leg's price (D-07). */
  tiedBookNames: string[];
}

export interface ArbResultDTO {
  rowKey: string;
  eventId: string;
  sportKey: string;
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  marketType: "moneyline" | "spread" | "total";
  marketBadge: string;
  tieRisk: boolean;
  sideA: ArbLegDTO;
  sideB: ArbLegDTO;
  stakeA: string;
  stakeB: string;
  totalLaid: string;
  payoutA: string;
  payoutB: string;
  netIfAWins: string;
  netIfBWins: string;
  guaranteedProfit: string;
  returnPct: string;
  /** netIfAWins !== netIfBWins -- true only when whole-dollar rounding produced unequal outcomes; the headline then shows the lower one (D-02). */
  worstCase: boolean;
}

/**
 * Ranked results keyed by sport scope: "all" is every SPORT_KEYS entry
 * combined, and each SPORT_KEYS entry is that sport's own ranking --
 * ranked independently, never a slice of "all", with every true arb
 * included (no top-N cap) (D-04, D-12).
 */
export type ArbResultsBySport = Record<string, ArbResultDTO[]>;

export type FindArbsResponse =
  | {
      status: "ok";
      resultsBySport: ArbResultsBySport;
      /** ISO timestamp of the most recent cached_odds refresh, or null if never fetched (D-16). */
      oddsFetchedAt: string | null;
      /** ISO timestamp of the most recent cached_extended_odds refresh, or null if never fetched (D-16). */
      extendedOddsFetchedAt: string | null;
      totalStake: string;
      precision: "whole" | "cents";
      /**
       * True only when the "all" scope is empty, the user hasn't selected
       * every usable book, and the same cached events DO produce at least
       * one arb for the full usable-book set -- i.e. the user's own book
       * selection (not a lack of arbs this week) is why nothing surfaced
       * (D-16, D-18).
       */
      booksExcludedAll: boolean;
    }
  | { status: "no_cached_odds" }
  | { status: "invalid"; fieldErrors: Partial<Record<"totalStake" | "precision", string[]>> };
