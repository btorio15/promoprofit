import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "./client";
import { signupOffers } from "./schema";
import type { SignupOfferRow } from "@/domain/promos/signupOffers";

/**
 * quick-260928-mgi (owner decision 3): server-only read of currently-active
 * sign-up offers, following src/db/promos.ts's style. An offer is active
 * when its status is 'active' and it either has no expiry or its expiry is
 * still in the future -- expired offers (status flipped by signupStore.ts,
 * or simply past their own expires_at) never reach the tab.
 */
export async function getActiveSignupOffers(now: Date): Promise<SignupOfferRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: signupOffers.id,
      bookKey: signupOffers.bookKey,
      title: signupOffers.title,
      description: signupOffers.description,
      bonusAmount: signupOffers.bonusAmount,
      sourceUrl: signupOffers.sourceUrl,
      expiresAt: signupOffers.expiresAt,
    })
    .from(signupOffers)
    .where(
      and(
        eq(signupOffers.status, "active"),
        or(isNull(signupOffers.expiresAt), gt(signupOffers.expiresAt, now)),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    bookKey: row.bookKey,
    title: row.title,
    description: row.description,
    bonusAmount: row.bonusAmount,
    sourceUrl: row.sourceUrl,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
}
