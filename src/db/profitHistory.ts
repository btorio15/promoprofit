import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { promoProfitObservations, promos } from "./schema";
import type { HistoryRow } from "@/domain/stats/dailyHistory";

/**
 * Every daily promo profit observation (the older promo_profit_observations
 * table), with the promo's sport. Read-only; feeds the Statistics page
 * "Since Sep 27" section.
 */
export async function loadDailyProfitHistory(): Promise<HistoryRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      denverDate: promoProfitObservations.denverDate,
      sportKey: promos.sportKey,
      profit: promoProfitObservations.maxGuaranteedProfit,
    })
    .from(promoProfitObservations)
    .leftJoin(promos, eq(promos.id, promoProfitObservations.promoId));

  return rows;
}
