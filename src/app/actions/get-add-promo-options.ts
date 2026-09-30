"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getCachedEvents, getCachedExtendedEvents, getUsableUserBooks } from "@/db/queries";
import { listCorrectionOptions } from "@/domain/promos/correctionOptions";
import type { AddPromoFormOptions } from "@/domain/promos/addedPromoInput";

/**
 * Phase 5 (D-08): the Add promo form's book list (only the member's own
 * usable books) and game/league picker options. Reads the odds cache only --
 * zero Odds API credits.
 */
export async function getAddPromoFormOptions(input: unknown): Promise<AddPromoFormOptions> {
  const user = await requireUser();

  if (!z.strictObject({}).safeParse(input).success) {
    return { status: "invalid" };
  }

  const [books, { events: moneyline }, { events: extended }] = await Promise.all([
    getUsableUserBooks(user.userId),
    getCachedEvents(),
    getCachedExtendedEvents(),
  ]);

  return {
    status: "ok",
    books: books.map((b) => ({ key: b.key, displayName: b.displayName })),
    options: listCorrectionOptions({ moneyline, extended }, { now: new Date() }),
  };
}
