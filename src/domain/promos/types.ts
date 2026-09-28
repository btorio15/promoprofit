/**
 * Promo domain vocabulary (PROMO-03, PROMO-04). This is the contract Plans
 * 04-10 build on -- later plans EXTEND dto.ts/get-promos.ts but must not
 * change this file's shape.
 */

/** boost = profit boost, bonus = bonus bet (D-01). */
export const PROMO_TYPES = ["profit_boost", "bonus_bet"] as const;
export type PromoType = (typeof PROMO_TYPES)[number];

/**
 * active: hedgeable now. pending_review: auto-match confidence was below
 * the accept threshold, or a cap field couldn't be parsed (D-10, D-18).
 * dismissed: a member rejected it -- never re-queued (D-14). expired: past
 * expires_at or event commence_time.
 */
export const PROMO_STATUSES = ["active", "pending_review", "dismissed", "expired"] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

/**
 * Why a promo sits in pending_review (D-10/D-18/quick-260928-it1): match =
 * event/market confidence too low, caps = a stake/winnings/odds cap couldn't
 * be parsed, classify = the scraper couldn't tell what this entry is; a
 * member classifies it (into a profit boost or bonus bet) before it can be
 * matched or capped at all.
 */
export const REVIEW_REASONS = ["match", "caps", "classify"] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const PROMO_MARKET_TYPES = ["moneyline", "spread", "total"] as const;
export type PromoMarketType = (typeof PROMO_MARKET_TYPES)[number];

export const PROMO_SIDES = ["home", "away", "over", "under"] as const;
export type PromoSide = (typeof PROMO_SIDES)[number];

/** Must equal profitBoost.ts's WinningsCapKind (Plan 02) -- shared cap-math vocabulary. */
export const WINNINGS_CAP_KINDS = ["net_winnings", "total_payout", "boost_extra"] as const;
export type WinningsCapKind = (typeof WINNINGS_CAP_KINDS)[number];

/** Which cap fields a scrape parse may fail to extract (D-18) -- names collected into promos.unparsed_cap_fields. */
export const CAP_FIELDS = ["maxStake", "maxWinnings", "minOdds"] as const;
export type CapField = (typeof CAP_FIELDS)[number];

/**
 * A matched event/market/side for a promo. line is null for moneyline; for
 * spread it's the PROMOTED side's own signed point (Broncos +3.5 -> 3.5,
 * never the magnitude); for total it's the total points.
 */
export interface PromoSelection {
  eventId: string;
  marketType: PromoMarketType;
  line: number | null;
  side: PromoSide;
}

/**
 * A presentational-only candidate match shown in a pending_review queue
 * card's "Best guess" line -- it never auto-activates (D-10 anti-pattern
 * guard).
 */
export interface BestGuess extends PromoSelection {
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
}
