"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { SetPromoCapInputSchema } from "@/domain/promos/yourCap";
import {
  deleteMemberPromoCap,
  getCapEditablePromo,
  isUndefinedTableError,
  upsertMemberPromoCap,
} from "@/db/promoCaps";

/**
 * quick-261001-dhn (T-dhn-01..03, T-dhn-06): set or clear the CURRENT
 * member's own max-stake override ("Your cap") for a profit boost.
 * requireUser() is the literal first statement; the input schema is strict
 * with no userId field, so the row owner is only ever the session user. The
 * promo must be active AND visible to this viewer (the same visibility rule
 * the feeds use), so another member's added promo, an expired promo, or an
 * unknown id all get one generic not_found message (IDOR guard). Only
 * profit boosts take a cap.
 */
export type SetPromoCapResponse =
  | { status: "ok" }
  | { status: "invalid"; message: string }
  | { status: "not_found"; message: string }
  | { status: "unavailable"; message: string };

export async function setPromoCapAction(input: unknown): Promise<SetPromoCapResponse> {
  const user = await requireUser();

  const parsed = SetPromoCapInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", message: parsed.error.issues[0]?.message ?? "Enter an amount between $0.01 and $10,000." };
  }

  const { promoId, maxStake } = parsed.data;
  const now = new Date();

  const promo = await getCapEditablePromo(promoId, user.userId, now);
  if (promo === null) {
    return { status: "not_found", message: "This promo is no longer available." };
  }
  if (promo.promoType !== "profit_boost") {
    return { status: "invalid", message: "Only profit boosts have a max stake." };
  }

  try {
    if (maxStake === null) {
      await deleteMemberPromoCap({ userId: user.userId, promoId });
    } else {
      await upsertMemberPromoCap({
        userId: user.userId,
        promoId,
        maxStake: new Decimal(maxStake).toFixed(2),
        now,
      });
    }
  } catch (err) {
    if (isUndefinedTableError(err)) {
      return {
        status: "unavailable",
        message: "Your cap can't be saved yet — the database update hasn't been applied.",
      };
    }
    throw err;
  }

  revalidatePath("/");
  return { status: "ok" };
}
