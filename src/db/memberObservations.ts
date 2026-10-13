import { eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { memberProfitObservations } from "./schema";
import { isUndefinedTableErrorFor } from "./undefinedTable";

/**
 * Phase 6 D-18: per-member profit observations. Every function takes the user
 * id from a caller that got it from requireUser() or the users table in the
 * morning job; never from client input.
 */

type Db = ReturnType<typeof getDb>;

const TABLE = "member_profit_observations";

export type MemberObservationWrite = {
  promoId: number;
  bookKey: string;
  denverDate: string;
  profit: string;
  partnerPromoId: number | null;
};

/**
 * Upserts a member's observations: one multi-row statement that only raises
 * profit (GREATEST). Never throws (covers the table missing before migration 0012).
 */
export async function recordMemberProfitObservations(
  userId: number,
  entries: MemberObservationWrite[],
  now: Date,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const t = memberProfitObservations;
    await getDb()
      .insert(t)
      .values(
        entries.map((entry) => ({
          userId,
          promoId: entry.promoId,
          denverDate: entry.denverDate,
          bookKey: entry.bookKey,
          profit: entry.profit,
          partnerPromoId: entry.partnerPromoId,
          lastObservedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [t.userId, t.promoId, t.denverDate],
        set: {
          partnerPromoId: sql`case when excluded.profit > ${t.profit} then excluded.partner_promo_id else ${t.partnerPromoId} end`,
          profit: sql`greatest(${t.profit}, excluded.profit)`,
          lastObservedAt: sql`excluded.last_observed_at`,
        },
      });
  } catch (err) {
    console.error("recordMemberProfitObservations: failed to write member observations", err);
  }
}

export function buildMemberObservationsQuery(db: Db, userId: number) {
  return db
    .select({
      promoId: memberProfitObservations.promoId,
      denverDate: memberProfitObservations.denverDate,
      profit: memberProfitObservations.profit,
    })
    .from(memberProfitObservations)
    .where(eq(memberProfitObservations.userId, userId));
}

/** Table-wide earliest day (release day); a date only, nothing per member. */
export function buildGraphStartDayQuery(db: Db) {
  return db.select({ start: sql<string | null>`min(denver_date)` }).from(memberProfitObservations);
}

export type MemberProfitHistory =
  | {
      status: "ready";
      graphStartDay: string | null;
      rows: { promoId: number; denverDate: string; profit: string }[];
    }
  | { status: "not-ready" };

let warnedMissingTable = false;

export async function getMemberProfitHistory(userId: number): Promise<MemberProfitHistory> {
  try {
    const db = getDb();
    const [rows, startRows] = await Promise.all([
      buildMemberObservationsQuery(db, userId),
      buildGraphStartDayQuery(db),
    ]);
    return { status: "ready", graphStartDay: startRows[0]?.start ?? null, rows };
  } catch (err) {
    if (isUndefinedTableErrorFor(err, TABLE)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "member_profit_observations table not found (migration 0012 not applied yet); graph shows not-ready",
        );
      }
      return { status: "not-ready" };
    }
    throw err;
  }
}
