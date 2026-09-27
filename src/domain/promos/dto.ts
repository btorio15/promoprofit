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

export type GetPromosResponse =
  | { status: "ok"; scrapeStatus: ScrapeStatusLineDTO[]; emptyVariant: PromosEmptyVariant | null }
  | { status: "invalid" };
