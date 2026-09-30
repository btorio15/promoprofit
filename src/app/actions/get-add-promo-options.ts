"use server";

import { z } from "zod";
import { COLORADO_BOOKS } from "@/config/books";
import { requireUser } from "@/lib/session";
import { getCachedEvents, getCachedExtendedEvents, getUsableUserBooks } from "@/db/queries";
import { getOwnActiveAddedPromo } from "@/db/addedPromos";
import { getActivePromos } from "@/db/promos";
import type { DuplicateCandidate } from "@/domain/promos/duplicateHint";
import { listCorrectionOptions } from "@/domain/promos/correctionOptions";
import type { AddPromoFormOptions } from "@/domain/promos/addedPromoInput";

const OptionsInputSchema = z.strictObject({ promoId: z.number().int().positive().optional() });

/**
 * Phase 5 (D-08): the Add promo form's book list (only the member's own
 * usable books) and game/league picker options. Reads the odds cache only --
 * zero Odds API credits. With a promoId it also returns that promo for the
 * edit form, but only if the member added it and it is still active (T-5-idor).
 */
export async function getAddPromoFormOptions(input: unknown): Promise<AddPromoFormOptions> {
  const user = await requireUser();

  const parsed = OptionsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  let editing = null;
  if (parsed.data.promoId !== undefined) {
    editing = await getOwnActiveAddedPromo(parsed.data.promoId, user.userId);
    if (!editing) return { status: "not_found" };
  }

  const now = new Date();
  const [books, { events: moneyline }, { events: extended }, activePromos] = await Promise.all([
    getUsableUserBooks(user.userId),
    getCachedEvents(),
    getCachedExtendedEvents(),
    getActivePromos(now, user.userId),
  ]);

  // D-12 / T-5-visibility: only the member's own visible SCRAPED promos at their own books.
  // getActivePromos is viewer-scoped, and !addedByYou drops every added promo.
  const ownBookKeys = new Set(books.map((b) => b.key));
  const duplicateCandidates: DuplicateCandidate[] = activePromos
    .filter((p) => !p.addedByYou && ownBookKeys.has(p.bookKey))
    .map((p) => ({
      bookKey: p.bookKey,
      promoType: p.promoType,
      bonusAmount: p.bonusAmount,
      boostPercent: p.boostPercent,
      boostedOddsAmerican: p.boostedOddsAmerican,
      scope:
        p.scope.kind === "sport_window"
          ? {
              kind: "sport_window" as const,
              sportKey: p.scope.sportKey,
              windowStart: p.scope.windowStart.toISOString(),
              windowEnd: p.scope.windowEnd.toISOString(),
            }
          : p.scope,
    }));

  // WR-03: the edit form's Book is locked; if the member has since dropped
  // that book, still list it so the locked field shows its name.
  const formBooks = books.map((b) => ({ key: b.key, displayName: b.displayName }));
  if (editing && !ownBookKeys.has(editing.bookKey)) {
    const lockedBook = COLORADO_BOOKS.find((b) => b.key === editing.bookKey);
    if (lockedBook) formBooks.push({ key: lockedBook.key, displayName: lockedBook.displayName });
  }

  return {
    status: "ok",
    books: formBooks,
    options: listCorrectionOptions({ moneyline, extended }, { now }),
    duplicateCandidates,
    editing,
  };
}
