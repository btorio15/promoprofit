import type { CapField, PromoType, ReviewReason } from "./types";
import type { CorrectionOptions } from "./correctionOptions";
import type { AvailableProfit } from "./profitTotals";
import type { DonePromoDTO } from "./doneSnapshot";

export type { DonePromoDTO } from "./doneSnapshot";

export type {
  CorrectionEventOption,
  CorrectionMarketOption,
  CorrectionOptions,
  CorrectionSportDayOption,
} from "./correctionOptions";

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
  /** quick-261002-dqn: true for active scraped promos (auto-matched or human-confirmed) -- drives the Flag button independently of autoMatched. Optional because frozen Done snapshots lack it (absent = not flaggable). */
  flaggable?: boolean;
  /** True when the viewing member added this promo themselves (phase 5). Optional: frozen Done snapshots lack it. */
  addedByYou?: boolean;
  finePrintNote: string | null;
  /** "Opt in / claim in the app first" when the promo requires it, else null. */
  claimHint: string | null;
  tieRisk: boolean;
  sameBook: boolean;
  promo: {
    bookKey: string;
    bookName: string;
    selectionLabel: string;
    oddsAmerican: number;
    oddsDerived: boolean;
    /** quick-261001-e1j: the book's price before the boost (boosts only). Optional: Done snapshots lack it. */
    baseOddsAmerican?: number | null;
  };
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
  /** quick-261001-e1j: ISO cache time of this row's prices. Optional: Done snapshots lack it. */
  pricesAsOf?: string | null;
  /**
   * WR-07: whether the member has an account at the promo's own book (set
   * on the server from their saved books). Rows where this is false are
   * still shown, but dimmed and sorted after every own-book row.
   */
  hasPromoBook: boolean;
  /**
   * quick-261001-dhn: Promos-tab-only "Your cap" edit data for profit boosts.
   * Optional because frozen Done snapshots lack it.
   */
  yourCap?: { promoCap: string; override: string | null };
}

/**
 * quick-260927-edt: one active promo whose best hedge is not strictly
 * profitable, shown as a muted/greyed row after the profitable rows so
 * members can see the promo was evaluated (and flag a wrong auto-match)
 * without ever being told to place a losing bet. By design this NEVER
 * carries stakes, hedge book, or selection fields -- only enough to render
 * the row and its "best" (or "nothing eligible") note.
 */
export interface UnprofitablePromoRowDTO {
  rowKey: string;
  promoId: number;
  promoType: PromoType;
  promoTypeLabel: "Boost" | "Bonus bet";
  bookKey: string;
  bookName: string;
  title: string;
  scopeLabel: string;
  autoMatched: boolean;
  /** quick-261002-dqn: true for active scraped promos (auto-matched or human-confirmed) -- drives the Flag button independently of autoMatched. Optional because frozen Done snapshots lack it (absent = not flaggable). */
  flaggable?: boolean;
  addedByYou: boolean;
  /** Fixed 2-dp string (e.g. "-0.65"), or null when no candidate could be evaluated at all. */
  bestGuaranteedProfit: string | null;
  /** Display-ready: "No profitable hedge right now (best: −$0.65)" or "No eligible bets right now". */
  note: string;
  /** WR-07: same meaning as PromoRowDTO.hasPromoBook -- false rows are sorted last. */
  hasPromoBook: boolean;
  /**
   * quick-261001-dhn: Promos-tab-only "Your cap" edit data for profit boosts.
   * Optional because frozen Done snapshots lack it.
   */
  yourCap?: { promoCap: string; override: string | null };
}

/**
 * One review-queue card (D-13, D-14, PROMO-04) -- a scraped promo that
 * can't yet feed hedge math, never used in hedge math until a member
 * confirms/corrects it. kind mirrors promos.review_reason: "match" =
 * event/market confidence too low (bestGuessLabel, when a guess exists);
 * "caps" = the event/market matched but a stake/winnings/odds cap couldn't
 * be parsed (matchedLabel + capRecap, unparsedCapFields names which of the
 * three recap fields still need a human-entered value).
 */
/**
 * quick-260928-it1: a "classify" queue card's data -- non-null only when
 * `kind` is "classify". `suggested` prefills the ClassifyQueueCard's
 * boost/bonus sub-panel fields from whatever buildClassifyDraft could
 * infer; every field is presentational only, never trusted server-side
 * (classifyPromo re-validates everything the member actually submits).
 */
export interface ClassifyQueueItemDTO {
  title: string;
  /** Whitespace-collapsed, <= 280 chars, ending in "…" when trimmed. */
  excerpt: string;
  /** Allowlisted to http:/https: (T-it1-06) -- null for any other scheme, or when absent. */
  sourceUrl: string | null;
  expiresAt: string | null;
  suggested: {
    promoType: PromoType;
    boostPercent: string | null;
    bonusAmount: string | null;
    maxStake: string | null;
    maxWinnings: string | null;
    minOdds: number | null;
    sportKey: string | null;
  };
  /** Whether the book's winnings-cap KIND is already known (independent of whether an amount parsed) -- the Max winnings field is hidden client-side when false (D-18). */
  maxWinningsKindKnown: boolean;
}

export interface QueueItemDTO {
  promoId: number;
  kind: ReviewReason;
  bookName: string;
  promoTypeLabel: "Boost" | "Bonus bet";
  description: string;
  bestGuessLabel: string | null;
  matchedLabel: string | null;
  capRecap: { maxStake: string | null; maxWinnings: string | null; minOdds: number | null } | null;
  unparsedCapFields: CapField[];
  classify: ClassifyQueueItemDTO | null;
  /**
   * quick-260929-gcn: the promo's scraped sport window as first/last ET days,
   * used only to prefill the review pickers ("Game or day" + "Through").
   * Presentational -- the server re-validates whatever the member submits.
   */
  scrapedWindow: { sportKey: string; startEtDate: string; endEtDate: string } | null;
}

export type GetPromosResponse =
  | {
      status: "ok";
      scrapeStatus: ScrapeStatusLineDTO[];
      emptyVariant: PromosEmptyVariant | null;
      rows: PromoRowDTO[];
      unprofitableRows: UnprofitablePromoRowDTO[];
      queue: QueueItemDTO[];
      /** Correct sub-panel dropdown data (Plan 09, T-03-09-06) -- empty lists unless the queue has at least one match-kind item. */
      correctionOptions: CorrectionOptions;
      /**
       * quick-260927-n12: exact-cent Decimal sum of guaranteed profit across
       * `rows` at the member's own books, excluding rows they've marked
       * done (quick-260929-igk: done promos leave the feed). Fixed 2-dp string, "0.00" when there are no
       * eligible rows. Always present in every "ok" response, including
       * every empty-state variant, so the headline never disappears.
       */
      totalProfit: string;
      /**
       * quick-260929-igk: this member's done promos, newest first, rendered
       * only from their saved snapshots (never live odds).
       */
      doneRows: DonePromoDTO[];
      /**
       * quick-260929-igk: exact-cent Decimal sum of this member's
       * profit_extracted. "0.00" when nothing has been marked done.
       */
      totalExtracted: string;
      /**
       * quick-260927-n12: today/week/month best-guaranteed-profit-seen
       * totals (owner decision 3), from persisted observations at the
       * member's own books -- independent of the live feed, so it still
       * reflects past days even when emptyVariant is set.
       */
      availableProfit: AvailableProfit;
    }
  | { status: "invalid" };
