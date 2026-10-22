import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { promoProfitObservations, promos, scrapeRuns } from "./schema";
import { promoVisibilityCondition } from "./promos";
import type { HistoryRow } from "@/domain/stats/dailyHistory";
import type { FunnelPromo } from "@/domain/stats/promoFunnel";

/**
 * Every daily promo profit observation (the older promo_profit_observations
 * table), joined to its promo for sport, type, face value and max stake.
 * Read-only; feeds the Statistics page "Since Sep 27" section. Rows for
 * members' private promos are excluded.
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
    .leftJoin(promos, eq(promos.id, promoProfitObservations.promoId))
    // Site-wide page: scraped promos only, never a member's private promo
    // (WR-02). No viewer means the group-only visibility rule.
    .where(promoVisibilityCondition());

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

/** Every promo's status, book and max stake, for the funnel and book health. */
export async function loadFunnelPromos(): Promise<FunnelPromo[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: promos.id,
      bookKey: promos.bookKey,
      status: promos.status,
      maxStake: promos.maxStake,
      expiresAt: promos.expiresAt,
    })
    .from(promos);
  return rows;
}


/**
 * Start time of every scrape run (one scrape_runs row per book shares the
 * run's ran_at). Counts runs that found nothing profitable, which leave no
 * profit_snapshots rows. Read-only.
 */
export async function loadScrapeRunTimes(): Promise<Date[]> {
  const db = getDb();
  const rows = await db.selectDistinct({ ranAt: scrapeRuns.ranAt }).from(scrapeRuns);
  return rows.map((row) => row.ranAt);
}
