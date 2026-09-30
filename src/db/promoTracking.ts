import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DonePromoSnapshot } from "@/domain/promos/doneSnapshot";
import type { DonePairSnapshot, PairMemberSnapshot } from "@/domain/promos/pairSnapshot";
import { getDb } from "./client";
import { promoCompletions, promoProfitObservations, promos } from "./schema";
import type { ProfitObservation } from "@/domain/promos/profitTotals";

/**
 * quick-260927-n12: reads/writes for per-member "mark used" state
 * (promo_completions, owner decision 2) and persisted per-promo,
 * per-Denver-day profit observations (promo_profit_observations, owner
 * decision 3). Mirrors src/db/promoReview.ts's getDb() pattern -- the ONLY
 * write path into either table.
 */

/**
 * quick-260929-igk: every completion THIS member has made, newest first,
 * with the saved snapshot and the promo's identity columns (used only to
 * label legacy rows that have no snapshot). Filtered by the session user id
 * (T-igk-03). profit_extracted stays a string (numeric from neon-http).
 */
export async function getPromoCompletions(userId: number) {
  const db = getDb();
  return db
    .select({
      promoId: promoCompletions.promoId,
      completedAt: promoCompletions.completedAt,
      snapshot: promoCompletions.snapshot,
      profitExtracted: promoCompletions.profitExtracted,
      promoBookKey: promos.bookKey,
      promoType: promos.promoType,
      promoParsed: promos.parsed,
      promoBoostPercent: promos.boostPercent,
      promoBoostedOddsAmerican: promos.boostedOddsAmerican,
      promoBonusAmount: promos.bonusAmount,
    })
    .from(promoCompletions)
    .innerJoin(promos, eq(promos.id, promoCompletions.promoId))
    .where(eq(promoCompletions.userId, userId))
    .orderBy(desc(promoCompletions.completedAt));
}

/**
 * quick-260929-igk: records a member's mark-done with its server-built
 * snapshot. ON CONFLICT DO NOTHING keeps the FIRST snapshot on a double-tap
 * (idempotent); the caller's recompute already proved the promo exists.
 */
export async function markPromoDone(args: {
  userId: number;
  promoId: number;
  now: Date;
  snapshot: DonePromoSnapshot;
  profitExtracted: string;
}): Promise<void> {
  const { userId, promoId, now, snapshot, profitExtracted } = args;
  const db = getDb();
  await db
    .insert(promoCompletions)
    .values({ userId, promoId, completedAt: now, snapshot, profitExtracted })
    .onConflictDoNothing({ target: [promoCompletions.userId, promoCompletions.promoId] });
}

/**
 * Phase 4 Plan 07: records BOTH promos of a pair in ONE multi-row INSERT
 * (atomic on neon-http, which has no interactive transactions). Deliberately
 * no ON CONFLICT clause: a half-written pair must never happen, so a unique
 * violation throws and nothing is saved. The caller pre-checks both promos
 * are active and not done. Always keyed by the session user id.
 */
export async function markPairDone(args: {
  userId: number;
  now: Date;
  primary: { promoId: number; snapshot: DonePairSnapshot; profitExtracted: string };
  member: { promoId: number; snapshot: PairMemberSnapshot; profitExtracted: string };
}): Promise<void> {
  const { userId, now, primary, member } = args;
  const db = getDb();
  await db.insert(promoCompletions).values([
    { userId, promoId: primary.promoId, completedAt: now, snapshot: primary.snapshot, profitExtracted: primary.profitExtracted },
    { userId, promoId: member.promoId, completedAt: now, snapshot: member.snapshot, profitExtracted: member.profitExtracted },
  ]);
}

/** Undoes a mark (idempotent -- deleting a non-existent row is a no-op). */
export async function unmarkPromoUsed(args: { userId: number; promoId: number }): Promise<void> {
  const { userId, promoId } = args;
  const db = getDb();
  await db
    .delete(promoCompletions)
    .where(and(eq(promoCompletions.userId, userId), eq(promoCompletions.promoId, promoId)));
}

/**
 * Upserts today's best-observed guaranteed profit per (promoId, denverDate)
 * (T-n12-04): a single multi-row INSERT ... ON CONFLICT DO UPDATE that can
 * only ever raise max_guaranteed_profit (GREATEST against the existing
 * value), never lower or duplicate it -- repeat Promos-tab loads/refreshes
 * on the same Denver day are safe to call this any number of times.
 * book_key is NOT updated on conflict (only set on first insert for that
 * day) -- by design, this table only tracks the best VALUE seen each day,
 * not which book most recently produced it. No-op on an empty entries list
 * (Drizzle rejects an empty `values([])` array).
 */
export async function recordProfitObservations(entries: ProfitObservation[], now: Date): Promise<void> {
  if (entries.length === 0) return;

  const db = getDb();
  await db
    .insert(promoProfitObservations)
    .values(
      entries.map((entry) => ({
        promoId: entry.promoId,
        denverDate: entry.denverDate,
        bookKey: entry.bookKey,
        maxGuaranteedProfit: entry.maxGuaranteedProfit,
        lastObservedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [promoProfitObservations.promoId, promoProfitObservations.denverDate],
      set: {
        maxGuaranteedProfit: sql`greatest(${promoProfitObservations.maxGuaranteedProfit}, excluded.max_guaranteed_profit)`,
        lastObservedAt: sql`excluded.last_observed_at`,
      },
    });
}

/** Every observation on or after `sinceDate` ("YYYY-MM-DD"), for summarizeAvailableProfit. */
export async function getProfitObservationsSince(sinceDate: string): Promise<ProfitObservation[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: promoProfitObservations.promoId,
      bookKey: promoProfitObservations.bookKey,
      denverDate: promoProfitObservations.denverDate,
      maxGuaranteedProfit: promoProfitObservations.maxGuaranteedProfit,
    })
    .from(promoProfitObservations)
    .where(gte(promoProfitObservations.denverDate, sinceDate));

  // numeric() comes back as a string from neon-http -- keep it a string
  // (mirrors src/db/promos.ts's ActivePromo money fields).
  return rows.map((row) => ({
    promoId: row.promoId,
    bookKey: row.bookKey,
    denverDate: row.denverDate,
    maxGuaranteedProfit: row.maxGuaranteedProfit,
  }));
}
