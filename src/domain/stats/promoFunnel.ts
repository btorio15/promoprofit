import Decimal from "decimal.js";

/**
 * Promo funnel (available, claimed-as-done, expired unused) and per-book
 * health (stake limits, promos removed). Pure, no I/O. "Claimed at the book"
 * is not stored yet, so the funnel tracks promos marked done in the app.
 */

export interface FunnelPromo {
  promoId: number;
  bookKey: string;
  status: string;
  maxStake: string | null;
}

export interface FunnelTotals {
  total: number;
  available: number;
  markedDone: number;
  expiredUnused: number;
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

export function promoFunnel(promos: FunnelPromo[], doneIds: ReadonlySet<number>): PromoFunnelStats {
  const totals: FunnelTotals = {
    total: promos.length,
    available: 0,
    markedDone: 0,
    expiredUnused: 0,
    dismissed: 0,
    pendingReview: 0,
  };
  const books = new Map<string, { promos: number; active: number; removed: number; stakeSum: Decimal; known: number }>();

  for (const promo of promos) {
    const done = doneIds.has(promo.promoId);
    if (done) totals.markedDone += 1;
    if (promo.status === "active") totals.available += 1;
    if (promo.status === "expired" && !done) totals.expiredUnused += 1;
    if (promo.status === "dismissed") totals.dismissed += 1;
    if (promo.status === "pending_review") totals.pendingReview += 1;

    const book = books.get(promo.bookKey) ?? { promos: 0, active: 0, removed: 0, stakeSum: new Decimal(0), known: 0 };
    book.promos += 1;
    if (promo.status === "active") book.active += 1;
    if (promo.status === "expired" || promo.status === "dismissed") book.removed += 1;
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
