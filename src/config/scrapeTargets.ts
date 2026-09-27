/**
 * Book keys the scraper actually targets (D-06). Plan 05 sets this value
 * from 03-RECON.md's Scraper Contract once per-book feasibility is
 * confirmed; until then it holds RESEARCH.md's D-06 recommendation (Bally
 * Bet only) so getPromos/ScrapeStatusPanel have a real book to show
 * "not scraped yet" for from day one.
 */
export const SCRAPE_TARGET_BOOK_KEYS: readonly string[] = ["ballybet"];
