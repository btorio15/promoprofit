import type { PromoType } from "./types";

/**
 * Serializable DTOs returned by the getPromos server action (D-08). This is
 * the contract Plans 04-10 build on -- later plans EXTEND this file (e.g.
 * "no-books"/"no-odds" empty variants start actually returning once book/
 * odds gating exists) but Plan 03 defines the full shape now.
 */

/** One per-book scrape-freshness line (D-08). bookName comes from src/config/books.ts, never hardcoded. */
export interface ScrapeStatusLineDTO {
  bookKey: string;
  bookName: string;
  /** ISO timestamp of the most recent OK scrape run for this book, or null if none has ever succeeded. */
  lastOkAt: string | null;
  lastRunFailed: boolean;
}

/**
 * Which empty state (if any) the Promos tab should render (03-UI-SPEC.md
 * "Empty states"). null means the active-promos list has rows to show.
 * "no-books" and "no-odds" are defined now but only start being returned
 * once Plan 04 adds book/odds-gated filtering.
 */
export type PromosEmptyVariant = "none-scraped" | "no-active" | "no-books" | "no-odds";

/**
 * One active promo's best hedge (D-01, CALC-02, CALC-03) -- money as fixed
 * 2-dp strings, matching src/domain/finder/types.ts's server/client boundary
 * convention. One row per promo: the best candidate rankPromoHedges found
 * within that promo's own scope (game-wide or sport+date-wide), not the
 * best bet across every promo.
 */
export interface PromoRowDTO {
  rowKey: string;
  promoId: number;
  promoType: PromoType;
  promoTypeLabel: "Boost" | "Bonus bet";
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  marketBadge: string;
  /** "Any NFL game · Sun, Sep 27" (sport_window) or "{away} @ {home}" (event). */
  scopeLabel: string;
  /** How many eligible bets in this promo's scope were evaluated before picking the best one. */
  candidatesEvaluated: number;
  autoMatched: boolean;
  finePrintNote: string | null;
  /** "Opt in / claim in the app first" when the promo requires it, else null. */
  claimHint: string | null;
  tieRisk: boolean;
  sameBook: boolean;
  promo: { bookKey: string; bookName: string; selectionLabel: string; oddsAmerican: number; oddsDerived: boolean };
  hedge: { bookKey: string; bookName: string; selectionLabel: string; oddsAmerican: number };
  promoStake: string;
  hedgeStake: string;
  totalStaked: string;
  promoPayout: string;
  hedgePayout: string;
  netIfPromoWins: string;
  netIfHedgeWins: string;
  guaranteedProfit: string;
  rateLabel: "ROI" | "Conversion";
  ratePct: string;
  /** Explains which cap bound the stake (D-02/CALC-03), or null when no cap bound it. */
  capNote: string | null;
  /** "Confirmed by X · Cap entered by Y" or null for auto-matched promos (no human to attribute). */
  attribution: string | null;
  worstCase: boolean;
}

export type GetPromosResponse =
  | { status: "ok"; scrapeStatus: ScrapeStatusLineDTO[]; emptyVariant: PromosEmptyVariant | null; rows: PromoRowDTO[] }
  | { status: "invalid" };
