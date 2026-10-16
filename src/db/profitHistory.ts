import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { promoCompletions, promoProfitObservations, promos } from "./schema";
import type { CompletionRow, HistoryRow } from "@/domain/stats/dailyHistory";
import type { FunnelPromo } from "@/domain/stats/promoFunnel";
import { denverDate } from "@/domain/promos/profitTotals";

/**
 * Every daily promo profit observation (the older promo_profit_observations
 * table), joined to its promo for sport, type, face value and max stake.
 * Read-only; feeds the Statistics page "Since Sep 27" section.
 */
export async function loadDailyProfitHistory(): Promise<HistoryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: promoProfitObservations.promoId,
      denverDate: promoProfitObservations.denverDate,
      bookKey: promoProfitObservations.bookKey,
      profit: promoProfitObservations.maxGuaranteedProfit,
      sportKey: promos.sportKey,
      promoType: promos.promoType,
      bonusAmount: promos.bonusAmount,
      maxStake: promos.maxStake,
    })
    .from(promoProfitObservations)
    .leftJoin(promos, eq(promos.id, promoProfitObservations.promoId));

  return rows.map((row) => ({
    promoId: row.promoId,
    denverDate: row.denverDate,
    bookKey: row.bookKey,
    profit: row.profit,
    sportKey: row.sportKey,
    promoType: row.promoType ?? "unknown",
    bonusAmount: row.bonusAmount,
    maxStake: row.maxStake,
  }));
}

/**
 * Every member's "marked done" completion, joined to its promo. The Denver
 * date is the day it was marked done. Read-only.
 */
export async function loadCompletionRows(): Promise<CompletionRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: promoCompletions.promoId,
      completedAt: promoCompletions.completedAt,
      profitExtracted: promoCompletions.profitExtracted,
      sportKey: promos.sportKey,
      promoType: promos.promoType,
      bookKey: promos.bookKey,
    })
    .from(promoCompletions)
    .leftJoin(promos, eq(promos.id, promoCompletions.promoId));

  return rows.map((row) => ({
    promoId: row.promoId,
    denverDate: denverDate(row.completedAt),
    profitExtracted: row.profitExtracted,
    sportKey: row.sportKey,
    promoType: row.promoType ?? "unknown",
    bookKey: row.bookKey ?? "unknown",
  }));
}

/** Every promo's status, book and max stake, for the funnel and book health. */
export async function loadFunnelPromos(): Promise<FunnelPromo[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: promos.id,
      bookKey: promos.bookKey,
      status: promos.status,
      maxStake: promos.maxStake,
    })
    .from(promos);
  return rows;
}

/** Promo ids a member has marked done (across all members). */
export async function loadDonePromoIds(): Promise<Set<number>> {
  const db = getDb();
  const rows = await db.selectDistinct({ promoId: promoCompletions.promoId }).from(promoCompletions);
  return new Set(rows.map((row) => row.promoId));
}
