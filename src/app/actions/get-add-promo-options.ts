"use server";

import { z } from "zod";
import { requireUser } from "@/lib/session";
import { getCachedEvents, getCachedExtendedEvents, getUsableUserBooks } from "@/db/queries";
import { getOwnActiveAddedPromo } from "@/db/addedPromos";
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

  const [books, { events: moneyline }, { events: extended }] = await Promise.all([
    getUsableUserBooks(user.userId),
    getCachedEvents(),
    getCachedExtendedEvents(),
  ]);

  return {
    status: "ok",
    books: books.map((b) => ({ key: b.key, displayName: b.displayName })),
    options: listCorrectionOptions({ moneyline, extended }, { now: new Date() }),
    editing,
  };
}
