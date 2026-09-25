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
    }
  | { status: "no_cached_odds" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<"bookKey" | "bonusAmount", string[]>>;
    };
