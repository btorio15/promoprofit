"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { EnterCapsInputSchema } from "@/domain/promos/reviewInput";
import { getPendingPromo, applyCapEntry } from "@/db/promoReview";
import type { CapField } from "@/domain/promos/types";
import type { PromoReviewResponse } from "./confirm-promo-match";

const CONFLICT: PromoReviewResponse = { status: "conflict", message: "Someone else already handled this promo." };

type CapFieldErrors = Partial<Record<"maxStake" | "maxWinnings" | "minOdds", string[]>>;

const REQUIRED_FIELD_MESSAGES: Record<CapField, string> = {
  maxStake: "Enter the max stake.",
  maxWinnings: "Enter the max winnings.",
  minOdds: "Enter the min odds.",
};

/** zod's fieldErrors key is the schema field name (minOddsAmerican); the public CapField/response key is "minOdds" (T-03-09-03: matches unparsedCapFields' own naming). */
function mapSchemaFieldErrors(fieldErrors: Record<string, string[] | undefined>): CapFieldErrors {
  const result: CapFieldErrors = {};
  if (fieldErrors.maxStake) result.maxStake = fieldErrors.maxStake;
  if (fieldErrors.maxWinnings) result.maxWinnings = fieldErrors.maxWinnings;
  if (fieldErrors.minOddsAmerican) result.minOdds = fieldErrors.minOddsAmerican;
  return result;
}

/**
 * Supplies a boost's missing max stake / max winnings / min odds (D-18) --
 * the path every FanDuel boost takes, since FanDuel hides its max wager
 * when logged out. requireUser() is the literal first statement
 * (T-03-09-01). The max-winnings cap's "kind" always comes from the row
 * (row.maxWinningsKind), never from input (T-03-09-03): a member can supply
 * an amount but can never invent or override which payout-cap semantics the
 * book actually uses. Any cap field NOT in the row's own unparsedCapFields
 * passes through unchanged from the row -- this action only ever fills in
 * gaps, never overwrites a value the scraper already parsed correctly.
 */
export async function enterPromoCaps(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();

  const parsed = EnterCapsInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = mapSchemaFieldErrors(z.flattenError(parsed.error).fieldErrors);
    return Object.keys(fieldErrors).length > 0 ? { status: "invalid", fieldErrors } : { status: "invalid" };
  }

  const { promoId, maxStake, maxWinnings, minOddsAmerican } = parsed.data;

  const row = await getPendingPromo(promoId);
  if (!row || row.reviewReason !== "caps") {
    return CONFLICT;
  }

  const provided: Record<CapField, boolean> = {
    maxStake: maxStake !== undefined,
    maxWinnings: maxWinnings !== undefined,
    minOdds: minOddsAmerican !== undefined,
  };

  const missingFieldErrors: CapFieldErrors = {};
  for (const field of row.unparsedCapFields) {
    if (!provided[field]) {
      missingFieldErrors[field] = [REQUIRED_FIELD_MESSAGES[field]];
    }
  }
  if (Object.keys(missingFieldErrors).length > 0) {
    return { status: "invalid", fieldErrors: missingFieldErrors };
  }

  if (maxWinnings !== undefined && row.maxWinningsKind === null) {
    return {
      status: "invalid",
      fieldErrors: { maxWinnings: ["This book's winnings rule is unknown. Dismiss this promo instead."] },
    };
  }

  const normalizedMaxStake = row.unparsedCapFields.includes("maxStake")
    ? new Decimal(maxStake!).toFixed(2)
    : row.maxStake;
  const normalizedMaxWinnings = row.unparsedCapFields.includes("maxWinnings")
    ? new Decimal(maxWinnings!).toFixed(2)
    : row.maxWinnings;
  const normalizedMinOdds = row.unparsedCapFields.includes("minOdds") ? minOddsAmerican! : row.minOddsAmerican;

  const ok = await applyCapEntry({
    promoId,
    userId: user.userId,
    maxStake: normalizedMaxStake,
    maxWinnings: normalizedMaxWinnings,
    minOddsAmerican: normalizedMinOdds,
    now: new Date(),
  });

  if (!ok) {
    return CONFLICT;
  }

  revalidatePath("/");
  return { status: "ok" };
}
