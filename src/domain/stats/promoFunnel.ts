import Decimal from "decimal.js";

/**
 * Promo funnel (available, expired, dismissed, pending) and per-book health
 * (stake limits, promos removed). Site-wide; nothing about what members
 * marked done (quick-261021-hwm). Pure, no I/O.
 */

export interface FunnelPromo {
  promoId: number;
  bookKey: string;
  status: string;
  maxStake: string | null;
  /** When the promo ends; an "active" promo past this counts as expired. */
  expiresAt?: Date | null;
}

export interface FunnelTotals {
  total: number;
  available: number;
  expired: number;
  dismissed: number;
  pendingReview: number;
}

export interface BookHealth {
  bookKey: string;
  promos: number;
  active: number;
  removed: number;
  /** Mean of promo max stakes where a max stake is known, or null if none. */
  avgMaxStake: string | null;
  maxStakeKnown: number;
}

export interface PromoFunnelStats {
  totals: FunnelTotals;
  books: BookHealth[];
}

/**
 * The scraper only flips a promo to "expired" on its next run, so a promo
 * whose end time has passed is treated as expired here (quick-261021-gy4).
 */
function effectiveStatus(promo: FunnelPromo, now: Date): string {
  if (promo.status === "active" && promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) return "expired";
  return promo.status;
}

export function promoFunnel(
  promos: FunnelPromo[],
  now: Date = new Date(),
): PromoFunnelStats {
  const totals: FunnelTotals = {
    total: promos.length,
    available: 0,
    expired: 0,
    dismissed: 0,
    pendingReview: 0,
  };
  const books = new Map<string, { promos: number; active: number; removed: number; stakeSum: Decimal; known: number }>();

  for (const promo of promos) {
    const status = effectiveStatus(promo, now);
    if (status === "active") totals.available += 1;
    if (status === "expired") totals.expired += 1;
    if (status === "dismissed") totals.dismissed += 1;
    if (status === "pending_review") totals.pendingReview += 1;

    const book = books.get(promo.bookKey) ?? { promos: 0, active: 0, removed: 0, stakeSum: new Decimal(0), known: 0 };
    book.promos += 1;
    if (status === "active") book.active += 1;
    if (status === "expired" || status === "dismissed") book.removed += 1;
    if (promo.maxStake !== null) {
      book.stakeSum = book.stakeSum.plus(promo.maxStake);
      book.known += 1;
    }
    books.set(promo.bookKey, book);
  }

  return {
    totals,
    books: [...books.entries()]
      .map(([bookKey, book]) => ({
        bookKey,
        promos: book.promos,
        active: book.active,
        removed: book.removed,
        avgMaxStake: book.known === 0 ? null : book.stakeSum.dividedBy(book.known).toDecimalPlaces(2).toFixed(2),
        maxStakeKnown: book.known,
      }))
      .sort((a, b) => b.promos - a.promos),
  };
}
