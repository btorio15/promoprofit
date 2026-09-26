/**
 * Serializable DTOs returned by the findHedges server action. All money is
 * a fixed 2-dp string, never a number, so it can cross the server/client
 * boundary without ever passing through float arithmetic.
 */
export interface FinderLegDTO {
  bookKey: string;
  bookName: string;
  team: string;
  oddsAmerican: number;
}

export interface FinderResultDTO {
  eventId: string;
  sportKey: string;
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  tieRisk: boolean;
  sameBook: boolean;
  bonus: FinderLegDTO;
  hedge: FinderLegDTO;
  bonusAmount: string;
  hedgeStake: string;
  bonusPayout: string;
  hedgePayout: string;
  netIfBonusWins: string;
  netIfHedgeWins: string;
  guaranteedProfit: string;
  conversionPct: string;
}

/**
 * Ranked results keyed by sport tab (owner-requested scope change, 01-05):
 * "all" is the overall top 10 across every D-01 sport, and each SPORT_KEYS
 * entry is that sport's own top 10, ranked independently -- never a slice
 * of the "all" list, so a sport can surface in its own tab even when none
 * of its markets make the overall top 10.
 */
export type FinderResultsBySport = Record<string, FinderResultDTO[]>;

export type FindHedgesResponse =
  | {
      status: "ok";
      resultsBySport: FinderResultsBySport;
      oddsFetchedAt: string;
      bonusBookName: string;
      bonusAmount: string;
      /** 2dp string when the "Limit hedge amount" cap was set, else null (D-17). */
      maxHedgeAmount: string | null;
      /**
       * Per-scope ("all" and each SPORT_KEYS entry): true only when a cap
       * is set, that scope's capped ranking is empty, and the same scope's
       * uncapped ranking is non-empty -- i.e. the cap is the reason this
       * scope shows no results (D-18).
       */
      limitExcludedAll: Record<string, boolean>;
      /**
       * True only when the "all" scope is empty, the user hasn't selected
       * every usable book, and the same cached events DO qualify at least
       * one market for the full usable-book set -- i.e. the user's own book
       * selection (not a lack of games this week) is why nothing surfaced
       * (D-18).
       */
      booksExcludedAll: boolean;
    }
  | { status: "no_cached_odds" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<"bookKey" | "bonusAmount" | "maxHedgeAmount", string[]>>;
    };
