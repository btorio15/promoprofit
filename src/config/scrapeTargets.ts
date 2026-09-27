/**
 * Book keys the scraper actually targets (D-06, D-09; 03-RECON.md Scraper
 * Contract "Shared keys" table). The owner's Task 2 recon pass found real,
 * logged-out JSON promo APIs for all three of these books and asked to
 * target all three this phase, each render_mode "http" (plain fetch, no
 * browser, no stealth, D-09) -- see Plans 12 (Bally Bet), 13 (DraftKings),
 * 14 (FanDuel) for the parsers.
 *
 * Every other Odds-API-covered Colorado book is `skip` this phase, per
 * 03-RECON.md's "Per-Book Anti-Bot Posture"/"D-09 Decisions" tables:
 * - BetRivers (`betrivers`): confirmed dead end -- the reachable page is
 *   the loyalty Bonus Store, not single-game boosts.
 * - BetMGM (`betmgm`), theScore Bet (`espnbet`): login-gated/JS-only
 *   surfaces recon didn't clear for a plain-http parser this phase.
 * - Caesars (`williamhill_us`): 403'd every probed path.
 * - Fanatics (`fanatics`): app-only, no public web surface found.
 * - Hard Rock Bet (`hardrockbet`): CO app subdomain not found (DNS
 *   failure) -- never evaluated further.
 */
export const SCRAPE_TARGET_BOOK_KEYS: readonly string[] = ["ballybet", "draftkings", "fanduel"];
