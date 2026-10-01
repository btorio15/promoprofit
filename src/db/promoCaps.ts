import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { promos, userPromoCaps } from "./schema";
import { activePromoWhere } from "./promos";

/**
 * quick-261001-dhn: per-member max-stake overrides. This module holds the
 * ONLY read and write paths for user_promo_caps. The scraper never imports
 * it (boundary-tested), so a scrape can never overwrite a member's cap.
 */

type Db = ReturnType<typeof getDb>;

const UNDEFINED_TABLE = "42P01";

/**
 * True when err (or its .cause chain; drizzle wraps driver errors) is the
 * Postgres "undefined_table" error for user_promo_caps -- i.e. migration
 * 0011 has not been applied yet.
 */
export function isUndefinedTableError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === UNDEFINED_TABLE) return true;
    if (typeof e.message === "string" && /relation "user_promo_caps" does not exist/.test(e.message)) return true;
    current = e.cause;
  }
  return false;
}

export function buildMemberCapsQuery(db: Db, userId: number) {
  return db
    .select({ promoId: userPromoCaps.promoId, maxStake: userPromoCaps.maxStake })
    .from(userPromoCaps)
    .where(eq(userPromoCaps.userId, userId));
}

let warnedMissingTable = false;

/**
 * One member's caps keyed by promo id. Degrades to "no caps" ONLY when the
 * table is missing (migration not applied); any other error is rethrown.
 */
export async function getMemberPromoCaps(userId: number): Promise<Map<number, string>> {
  try {
    const rows = await buildMemberCapsQuery(getDb(), userId);
    return new Map(rows.map((row) => [row.promoId, row.maxStake]));
  } catch (err) {
    if (isUndefinedTableError(err)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "getMemberPromoCaps: user_promo_caps table not found (migration 0011 not applied yet); treating as no caps",
        );
      }
      return new Map();
    }
    throw err;
  }
}

/** The promo, only if it is active and visible to this viewer (same rule as the feeds). */
export function buildCapEditablePromoQuery(db: Db, promoId: number, userId: number, now: Date) {
  return db
    .select({ id: promos.id, promoType: promos.promoType })
    .from(promos)
    .where(and(eq(promos.id, promoId), activePromoWhere(now, userId)))
    .limit(1);
}

export async function getCapEditablePromo(
  promoId: number,
  userId: number,
  now: Date,
): Promise<{ id: number; promoType: string } | null> {
  const rows = await buildCapEditablePromoQuery(getDb(), promoId, userId, now);
  return rows[0] ?? null;
}

export async function upsertMemberPromoCap(input: {
  userId: number;
  promoId: number;
  maxStake: string;
  now: Date;
}): Promise<void> {
  await getDb()
    .insert(userPromoCaps)
    .values({ userId: input.userId, promoId: input.promoId, maxStake: input.maxStake, updatedAt: input.now })
    .onConflictDoUpdate({
      target: [userPromoCaps.userId, userPromoCaps.promoId],
      set: { maxStake: input.maxStake, updatedAt: input.now },
    });
}

/** Idempotent: no row is fine. */
export async function deleteMemberPromoCap(input: { userId: number; promoId: number }): Promise<void> {
  await getDb()
    .delete(userPromoCaps)
    .where(and(eq(userPromoCaps.userId, input.userId), eq(userPromoCaps.promoId, input.promoId)));
}
