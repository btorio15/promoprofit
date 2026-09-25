/**
 * Colorado sportsbook configuration — single source of truth (ODDS-05,
 * D-14, D-16). Backend reads this to populate both the bonus-book dropdown
 * and the odds-fetch bookmaker list; never hardcode book keys elsewhere.
 */
export type BookTier = "free" | "paid_only" | "none";

export interface BookConfig {
  key: string;
  displayName: string;
  region: "us" | "us2" | null;
  apiCoverage: boolean;
  tier: BookTier;
  sortOrder: number;
  note: string | null;
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
  },
  {
    key: "fanduel",
    displayName: "FanDuel",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 2,
    note: null,
  },
  {
    key: "betmgm",
    displayName: "BetMGM",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 3,
    note: null,
  },
  {
    key: "betrivers",
    displayName: "BetRivers",
    region: "us",
    apiCoverage: true,
    tier: "free",
    sortOrder: 4,
    note: null,
  },
  {
    key: "espnbet",
    displayName: "theScore Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 5,
    note: "Odds API key retained as \"espnbet\" after the Dec 2025 rebrand to theScore Bet",
  },
  {
    key: "hardrockbet",
    displayName: "Hard Rock Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 6,
    note: null,
  },
  {
    key: "ballybet",
    displayName: "Bally Bet",
    region: "us2",
    apiCoverage: true,
    tier: "free",
    sortOrder: 7,
    note: null,
  },
  {
    key: "williamhill_us",
    displayName: "Caesars",
    region: "us",
    apiCoverage: true,
    tier: "paid_only",
    sortOrder: 8,
    note: "Odds API: paid subscriptions only, excluded per D-16",
  },
  {
    key: "fanatics",
    displayName: "Fanatics",
    region: "us",
    apiCoverage: true,
    tier: "paid_only",
    sortOrder: 9,
    note: "Odds API: paid subscriptions only, excluded per D-16",
  },
  {
    key: "bet365",
    displayName: "bet365",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 10,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
  },
  {
    key: "circa",
    displayName: "Circa",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 11,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
  },
  {
    key: "sbk",
    displayName: "SBK",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 12,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
  },
  {
    key: "betmonarch",
    displayName: "BetMonarch",
    region: null,
    apiCoverage: false,
    tier: "none",
    sortOrder: 13,
    note: "No Odds API coverage, hidden until manual odds entry (ODDS-06, D-14)",
  },
] as const;

/** Books usable in the bonus-book dropdown and hedge-book search (D-14/D-15): API-covered, free-tier, sorted for display. */
export function usableOddsBooks(): BookConfig[] {
  return COLORADO_BOOKS.filter((b) => b.apiCoverage && b.tier === "free").sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Every book with Odds API coverage, including paid_only (for the ODDS-05 live smoke test). */
export function smokeTestBookKeys(): string[] {
  return COLORADO_BOOKS.filter((b) => b.apiCoverage).map((b) => b.key);
}
