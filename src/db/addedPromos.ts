import { and, count, eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { promoProfitObservations, promos } from "./schema";
import type { AddedPromoInsert } from "@/domain/promos/buildAddedPromo";
import type { AddedPromoEditValues } from "@/domain/promos/addedPromoInput";

/** Inserts one member-added promo and returns its id (D-09: live immediately, no review queue). */
export async function insertAddedPromo(values: AddedPromoInsert): Promise<number> {
  const db = getDb();
  const [row] = await db.insert(promos).values(values).returning({ id: promos.id });
  return row.id;
}

/** How many active promos this member has added (per-user cap, T-5-10). */
export async function countOwnActiveAddedPromos(userId: number): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(promos)
    .where(and(eq(promos.addedByUserId, userId), eq(promos.status, "active")));
  return Number(row?.n ?? 0);
}

type Db = ReturnType<typeof getDb>;
interface OwnPromoArgs {
  promoId: number;
  userId: number;
}

/** Expire statement: ownership (added_by_user_id) is in the WHERE (T-5-idor). */
export function buildExpireOwnStatement(db: Db, { promoId, userId }: OwnPromoArgs) {
  return db
    .update(promos)
    .set({ status: "expired" })
    .where(and(eq(promos.id, promoId), eq(promos.addedByUserId, userId), eq(promos.status, "active")))
    .returning({ id: promos.id });
}

/**
 * Soft delete (D-11: never a SQL DELETE on promos, so promo_completions
 * survive) plus A4: the promo's profit observations are removed, scoped by
 * an ownership subquery (T-5-16).
 */
export function buildSoftDeleteStatements(db: Db, { promoId, userId }: OwnPromoArgs) {
  const update = db
    .update(promos)
    .set({ status: "deleted" })
    .where(
      and(
        eq(promos.id, promoId),
        eq(promos.addedByUserId, userId),
        inArray(promos.status, ["active", "expired"]),
      ),
    )
    .returning({ id: promos.id });
  const deleteObservations = db.delete(promoProfitObservations).where(
    and(
      eq(promoProfitObservations.promoId, promoId),
      inArray(
        promoProfitObservations.promoId,
        db
          .select({ id: promos.id })
          .from(promos)
          .where(and(eq(promos.id, promoId), eq(promos.addedByUserId, userId))),
      ),
    ),
  );
  return [update, deleteObservations] as const;
}

/** True when this member's active promo was expired; false for any other id. */
export async function expireOwnAddedPromo(args: OwnPromoArgs): Promise<boolean> {
  const rows = await buildExpireOwnStatement(getDb(), args);
  return rows.length === 1;
}

/** This member's own ACTIVE added promo for editing; null for anyone else's, expired, deleted or missing (T-5-idor). */
export async function getOwnActiveAddedPromo(promoId: number, userId: number): Promise<AddedPromoEditValues | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(promos)
    .where(and(eq(promos.id, promoId), eq(promos.addedByUserId, userId), eq(promos.status, "active")))
    .limit(1);
  if (!row) return null;
  return {
    promoId: row.id,
    bookKey: row.bookKey,
    promoType: row.promoType,
    bonusAmount: row.bonusAmount,
    boostPercent: row.boostPercent,
    boostedOddsAmerican: row.boostedOddsAmerican,
    maxStake: row.maxStake,
    maxWinnings: row.maxWinnings,
    maxWinningsKind: row.maxWinningsKind,
    minOddsAmerican: row.minOddsAmerican,
    scopeKind: row.scopeKind,
    eventId: row.eventId,
    sportKey: row.sportKey,
    windowStart: row.windowStart ? row.windowStart.toISOString() : null,
    windowEnd: row.windowEnd ? row.windowEnd.toISOString() : null,
    marketType: row.marketType,
    line: row.line,
    side: row.side,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

/**
 * Updates the member's own active promo in place (same id). Owner, status and
 * the locked book/type are all in the WHERE (T-5-idor, T-5-17). False when no
 * row matched.
 */
export async function updateOwnAddedPromo(args: {
  promoId: number;
  userId: number;
  values: AddedPromoInsert;
}): Promise<boolean> {
  const { promoId, userId, values } = args;
  const editable: Partial<AddedPromoInsert> = { ...values };
  delete editable.id;
  delete editable.dedupeKey;
  delete editable.addedByUserId;
  delete editable.firstSeenAt;
  delete editable.status;
  delete editable.bookKey;
  delete editable.promoType;
  const db = getDb();
  const rows = await db
    .update(promos)
    .set({ ...editable, lastSeenAt: new Date() })
    .where(
      and(
        eq(promos.id, promoId),
        eq(promos.addedByUserId, userId),
        eq(promos.status, "active"),
        eq(promos.bookKey, values.bookKey),
        eq(promos.promoType, values.promoType),
      ),
    )
    .returning({ id: promos.id });
  return rows.length === 1;
}

/** True when this member's promo was soft-deleted; false for any other id. */
export async function softDeleteOwnAddedPromo(args: OwnPromoArgs): Promise<boolean> {
  const db = getDb();
  const [updated] = await db.batch(buildSoftDeleteStatements(db, args));
  return updated.length === 1;
}
