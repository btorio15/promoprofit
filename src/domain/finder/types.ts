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

export type FindHedgesResponse =
  | {
      status: "ok";
      results: FinderResultDTO[];
      oddsFetchedAt: string;
      bonusBookName: string;
      bonusAmount: string;
      sportKey: string;
    }
  | { status: "no_cached_odds" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<"bookKey" | "bonusAmount" | "sportKey", string[]>>;
    };
