"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  EditPromoInputSchema,
  MSG_LOCKED,
  MSG_NOT_AVAILABLE,
  fieldErrorsFromIssues,
  type AddedPromoResponse,
} from "@/domain/promos/addedPromoInput";
import { getOwnActiveAddedPromo, updateOwnAddedPromo } from "@/db/addedPromos";
import { prepareAddedPromoValues } from "@/db/addedPromoPipeline";

/**
 * Phase 5 (D-10): only the member who added a promo can edit it, in place.
 * requireUser() is the first statement; the owner is always user.userId. Book
 * and type are locked; everything else is re-validated exactly like adding.
 */
export async function editPromo(input: unknown): Promise<AddedPromoResponse> {
  const user = await requireUser();

  const parsed = EditPromoInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }
  const { promoId, promo } = parsed.data;

  const existing = await getOwnActiveAddedPromo(promoId, user.userId);
  if (!existing) return { status: "not_found", message: MSG_NOT_AVAILABLE };

  if (promo.bookKey !== existing.bookKey || promo.promoType !== existing.promoType) {
    return { status: "invalid", fieldErrors: { form: [MSG_LOCKED] } };
  }

  const prepared = await prepareAddedPromoValues({
    userId: user.userId,
    data: promo,
    now: new Date(),
    dedupeKey: `added:edit:${promoId}`,
  });
  if (!prepared.ok) return prepared.response;

  const updated = await updateOwnAddedPromo({ promoId, userId: user.userId, values: prepared.values });
  if (!updated) return { status: "not_found", message: MSG_NOT_AVAILABLE };

  revalidatePath("/");
  return { status: "ok", promoId };
}
