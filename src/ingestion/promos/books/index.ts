import type { BookScraper } from "@/domain/promos/scraped";
import { ballybetScraper } from "./ballybet";
import { draftkingsScraper } from "./draftkings";
import { fanduelScraper } from "./fanduel";

/**
 * Single registration point for every book scraper (03-RECON.md Scraper
 * Contract; D-06, D-09). Plans 12-14 wrote each of these three parsers in
 * parallel worktrees without ever touching this file -- run.ts (Plan 06)
 * looks a scraper up here by SCRAPE_TARGET_BOOK_KEYS entry, never by
 * importing a book file directly.
 */
export const BOOK_SCRAPERS: Readonly<Record<string, BookScraper>> = {
  ballybet: ballybetScraper,
  draftkings: draftkingsScraper,
  fanduel: fanduelScraper,
};
