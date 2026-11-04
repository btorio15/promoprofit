/**
 * Colorado sportsbook configuration — single source of truth (ODDS-05,
 * D-14, D-16). Backend reads this to populate both the bonus-book dropdown
 * and the odds-fetch bookmaker list; never hardcode book keys elsewhere.
 * Prediction markets (Kalshi, Polymarket US) are hedge-only venues (D-14,
 * D-04): never promo books, refreshed in the same bookmakers= bucket.
 */
export type BookTier = "free" | "paid_only" | "none";

export interface BookConfig {
  key: string;
  displayName: string;
  region: "us" | "us2" | "us_ex" | null;
  apiCoverage: boolean;
  tier: BookTier;
  sortOrder: number;
  note: string | null;
  /** "market" venues are hedge-only prediction markets (D-14, D-04); never promo books. */
  venue: "sportsbook" | "market";
  /** Where a market venue's odds come from; null for every sportsbook. */
  marketSource: "odds_api" | "kalshi_native" | "dropped" | null;
}

export const COLORADO_BOOKS: readonly BookConfig[] = [
  {
    key: "draftkings",
    displayName: "DraftKings",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 1,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "fanduel",
    displayName: "FanDuel",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 2,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "betmgm",
    displayName: "BetMGM",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 3,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "betrivers",
    displayName: "BetRivers",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 4,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "espnbet",
    displayName: "theScore Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 5,
    note: "Odds API key retained as \"espnbet\" after the Dec 2025 rebrand to theScore Bet",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "hardrockbet",
    displayName: "Hard Rock Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 6,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "ballybet",
    displayName: "Bally Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 7,
    note: null,
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "williamhill_us",
    displayName: "Caesars",
    region: "us",
    apiCoverage: true,
    tier: "paid_only",
    sortOrder: 8,
    note: "Odds API: paid subscriptions only, excluded per D-16",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "fanatics",
    displayName: "Fanatics",
    region: "us",
    apiCoverage: true,
    tier: "paid_only",
    sortOrder: 9,
    note: "Odds API: paid subscriptions only, excluded per D-16",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "bet365",
    displayName: "bet365",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 10,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "circa",
    displayName: "Circa",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 11,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "sbk",
    displayName: "SBK",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 12,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "betmonarch",
    displayName: "BetMonarch",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 13,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
    venue: "sportsbook",
    marketSource: null,
  },
  {
    key: "kalshi",
    displayName: "Kalshi",
    region: "us_ex",
    apiCoverage: true,
    tier: "free",
    sortOrder: 20,
    note: "CFTC-regulated prediction market; hedge venue only (Phase 12)",
    venue: "market",
    marketSource: "odds_api",
  },
  {
    key: "polymarket_us",
    displayName: "Polymarket",
    region: "us_ex",
    apiCoverage: true,
    tier: "free",
    sortOrder: 21,
    note: "CFTC-regulated prediction market; hedge venue only (Phase 12)",
    venue: "market",
    marketSource: "odds_api",
  },
] as const;

/**
 * Sportsbooks usable in the bonus-book dropdown and every "promo book" check
 * (D-14/D-15): API-covered, free-tier, sorted for display. Sportsbooks only --
 * promos only come from sportsbooks, so a market venue is never a promo book.
 */
export function usableOddsBooks(): BookConfig[] {
  return sportsbooksFrom(COLORADO_BOOKS);
}

function sportsbooksFrom(books: readonly BookConfig[]): BookConfig[] {
  return books
    .filter((b) => b.venue === "sportsbook" && b.apiCoverage && b.tier === "free")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Pure helper: market venues in `books` that are not dropped, sorted. */
export function marketVenuesFrom(books: readonly BookConfig[]): BookConfig[] {
  return books
    .filter((b) => b.venue === "market" && b.marketSource !== "dropped")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Pure helper: sportsbooks followed by market venues. */
export function hedgeBooksFrom(books: readonly BookConfig[]): BookConfig[] {
  return [...sportsbooksFrom(books), ...marketVenuesFrom(books)];
}

/** Pure helper: bookmaker keys one refresh requests (sportsbooks + Odds API markets). */
export function refreshKeysFrom(books: readonly BookConfig[]): string[] {
  return [
    ...sportsbooksFrom(books),
    ...marketVenuesFrom(books).filter((b) => b.marketSource === "odds_api"),
  ].map((b) => b.key);
}

/** Prediction-market hedge venues (Kalshi, Polymarket US), config order. */
export function usableMarketVenues(): BookConfig[] {
  return marketVenuesFrom(COLORADO_BOOKS);
}

/** Every hedge venue: sportsbooks then markets (hedge search, My Books). */
export function usableHedgeBooks(): BookConfig[] {
  return hedgeBooksFrom(COLORADO_BOOKS);
}

/** Bookmaker keys for one refresh; must stay <= 10 (one credit bucket, D-06). */
export function refreshBookmakerKeys(): string[] {
  return refreshKeysFrom(COLORADO_BOOKS);
}

export function isMarketVenue(key: string): boolean {
  return usableMarketVenues().some((b) => b.key === key);
}

/**
 * Site-wide / group "every usable book" keys (group recording, Statistics,
 * empty-state checks). Sportsbook-only by orchestrator decision so market
 * hedges stay per-member (D-03).
 */
export function groupHedgeBookKeys(): string[] {
  return usableOddsBooks().map((b) => b.key);
}

/** Every sportsbook with Odds API coverage, including paid_only (for the ODDS-05 live smoke test). */
export function smokeTestBookKeys(): string[] {
  return COLORADO_BOOKS.filter((b) => b.venue === "sportsbook" && b.apiCoverage).map((b) => b.key);
}
