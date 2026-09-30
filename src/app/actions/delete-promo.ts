"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { PromoIdInputSchema } from "@/domain/promos/reviewInput";
import type { AddedPromoResponse } from "@/domain/promos/addedPromoInput";
import { softDeleteOwnAddedPromo } from "@/db/addedPromos";

/** Soft-deletes a promo (D-10/D-11): only the adding member can act; userId comes from the session, never input. */
export async function deletePromo(input: unknown): Promise<AddedPromoResponse> {
  const user = await requireUser();

  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: {} };
  }

  const ok = await softDeleteOwnAddedPromo({ promoId: parsed.data.promoId, userId: user.userId });
  if (!ok) {
    // Generic on purpose: never reveals whether the id exists or is someone else's (T-5-14).
    return { status: "not_found", message: "That promo isn't available any more." };
  }

  revalidatePath("/");
  return { status: "ok", promoId: parsed.data.promoId };
}
