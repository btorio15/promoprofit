import Decimal from "decimal.js";
import { COLORADO_BOOKS } from "@/config/books";
import { formatUsd } from "@/lib/format";

/**
 * quick-260928-mgi (owner decision 3): pure domain shapes and grouping logic
 * for the "Sign-up offers" tab. Informational only -- no profit math, never
 * imports @/ingestion/promos (boundary test), and never touches ranking,
 * review or promo dedupe (schema.ts's signup_offers table is deliberately
 * separate from promos).
 */

/** What src/db/signupOffers.ts's getActiveSignupOffers returns. */
export interface SignupOfferRow {
  id: number;
  bookKey: string;
  title: string;
  description: string;
  bonusAmount: string | null;
  sourceUrl: string;
  expiresAt: string | null;
}

export interface SignupOfferDTO {
  id: number;
  title: string;
  description: string;
  bonusLabel: string | null;
  link: string | null;
  expiresAt: string | null;
}

export interface SignupOfferGroupDTO {
  bookKey: string;
  bookName: string;
  offers: SignupOfferDTO[];
}

export interface GetSignupOffersResponse {
  status: "ok";
  /** Books the member does NOT have -- the default view. */
  groups: SignupOfferGroupDTO[];
  /** Books the member already has; shown only behind "Show books I already have". */
  ownedGroups: SignupOfferGroupDTO[];
  /** Describes the default (not-owned) view only. */
  empty: null | "none" | "have-all";
}

/**
 * T-mgi-04: allowlists http:/https: only, same pattern as get-promos.ts's
 * safeHttpUrl -- copied rather than imported, since that file is "use
 * server" and this one must stay a plain, importable pure module.
 */
function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function toDTO(row: SignupOfferRow): SignupOfferDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    bonusLabel: row.bonusAmount !== null ? formatUsd(row.bonusAmount) : null,
    link: safeHttpUrl(row.sourceUrl),
    expiresAt: row.expiresAt,
  };
}

/** Descending by bonus amount (Decimal compare, nulls last), then title. */
function compareOffers(a: SignupOfferRow, b: SignupOfferRow): number {
  if (a.bonusAmount === null && b.bonusAmount === null) return a.title.localeCompare(b.title);
  if (a.bonusAmount === null) return 1;
  if (b.bonusAmount === null) return -1;
  const diff = new Decimal(b.bonusAmount).comparedTo(new Decimal(a.bonusAmount));
  return diff !== 0 ? diff : a.title.localeCompare(b.title);
}

const BOOK_SORT_ORDER = new Map(COLORADO_BOOKS.map((book) => [book.key, book.sortOrder]));

/** COLORADO_BOOKS order first; an unknown book key goes last, alphabetically. */
function compareBookKeys(a: string, b: string): number {
  const orderA = BOOK_SORT_ORDER.get(a);
  const orderB = BOOK_SORT_ORDER.get(b);
  if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
  if (orderA !== undefined) return -1;
  if (orderB !== undefined) return 1;
  return a.localeCompare(b);
}

/**
 * Groups active sign-up offers by book: `groups` for books the member does
 * NOT already own (owner decision 3 -- the default view, useful when
 * deciding which book to add next), `ownedGroups` for books they do (shown
 * only behind the "Show books I already have" checkbox). "none" when there
 * are no active offers at all; "have-all" when the member already owns
 * every book that has one.
 */
export function groupSignupOffersForMember(
  rows: readonly SignupOfferRow[],
  ownedBookKeys: ReadonlySet<string>,
): GetSignupOffersResponse {
  if (rows.length === 0) {
    return { status: "ok", groups: [], ownedGroups: [], empty: "none" };
  }

  const notOwned = rows.filter((row) => !ownedBookKeys.has(row.bookKey));
  const owned = rows.filter((row) => ownedBookKeys.has(row.bookKey));
  const groups = toGroups(notOwned);

  return { status: "ok", groups, ownedGroups: toGroups(owned), empty: groups.length === 0 ? "have-all" : null };
}

function toGroups(rows: readonly SignupOfferRow[]): SignupOfferGroupDTO[] {
  const byBook = new Map<string, SignupOfferRow[]>();
  for (const row of rows) {
    const list = byBook.get(row.bookKey) ?? [];
    list.push(row);
    byBook.set(row.bookKey, list);
  }

  return [...byBook.keys()].sort(compareBookKeys).map((bookKey) => {
    const bookName = COLORADO_BOOKS.find((book) => book.key === bookKey)?.displayName ?? bookKey;
    const sortedRows = [...(byBook.get(bookKey) ?? [])].sort(compareOffers);
    return { bookKey, bookName, offers: sortedRows.map(toDTO) };
  });
}
