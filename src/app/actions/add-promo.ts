"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  ADDED_PROMO_MAX_ACTIVE,
  AddPromoInputSchema,
  MSG_TOO_MANY,
  fieldErrorsFromIssues,
  type AddedPromoResponse,
} from "@/domain/promos/addedPromoInput";
import { countOwnActiveAddedPromos, insertAddedPromo } from "@/db/addedPromos";
import { prepareAddedPromoValues } from "@/db/addedPromoPipeline";

/**
 * Phase 5: a member adds a promo for themselves (D-07/D-09). requireUser() is
 * the literal first statement; the owner is always user.userId (the input
 * schema has no owner field). The validation pipeline (own book, expiry,
 * game/league scope, boost pin) is shared with editPromo and lives in
 * prepareAddedPromoValues; the row goes live immediately as 'active' with no
 * review queue.
 */
export async function addPromo(input: unknown): Promise<AddedPromoResponse> {
  const user = await requireUser();

  const parsed = AddPromoInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }
  const data = parsed.data;

  const now = new Date();
  if ((await countOwnActiveAddedPromos(user.userId, now)) >= ADDED_PROMO_MAX_ACTIVE) {
    return { status: "invalid", fieldErrors: { form: [MSG_TOO_MANY] } };
  }

  const prepared = await prepareAddedPromoValues({
    userId: user.userId,
    data,
    now,
    dedupeKey: `added:${crypto.randomUUID()}`,
  });
  if (!prepared.ok) return prepared.response;

  const promoId = await insertAddedPromo(prepared.values);

  revalidatePath("/");
  return { status: "ok", promoId };
}
