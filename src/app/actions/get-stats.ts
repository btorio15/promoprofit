"use server";

import { requireUser } from "@/lib/session";
import { loadProfitSnapshotRows } from "@/db/profitSnapshots";
import { loadDailyProfitHistory, loadDonePromoIds, loadFunnelPromos } from "@/db/profitHistory";
import {
  sportWeekdayStats,
  timeOfDayStats,
  type HourOfDayStat,
  type SportWeekdayStats,
} from "@/domain/stats/profitStats";
import { dailyHistoryStats, type DailyHistoryStats } from "@/domain/stats/dailyHistory";
import { promoFunnel, type PromoFunnelStats } from "@/domain/stats/promoFunnel";

export interface StatsDTO {
  /** Scheduled odds runs that have recorded at least one snapshot. */
  snapshotRuns: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  timeOfDay: HourOfDayStat[];
  sportWeekday: SportWeekdayStats;
  /** Older daily data from before the scheduled snapshots (Since Sep 27). */
  history: DailyHistoryStats;
  /** Promo availability, marked-done counts, and per-book health. */
  funnel: PromoFunnelStats;
}

/**
 * Stats figures from every stored snapshot (long-term, never trimmed).
 * Group-level, so the same for every member. requireUser() is the literal
 * first statement, so only signed-in members can read it.
 */
export async function getStats(): Promise<StatsDTO> {
  await requireUser();

  const [rows, historyRows, funnelPromos, doneIds] = await Promise.all([
    loadProfitSnapshotRows(),
    loadDailyProfitHistory(),
    loadFunnelPromos(),
    loadDonePromoIds(),
  ]);
  const runTimes = new Set(rows.map((row) => row.capturedAt.getTime()));
  let first: number | null = null;
  let last: number | null = null;
  for (const time of runTimes) {
    if (first === null || time < first) first = time;
    if (last === null || time > last) last = time;
  }

  return {
    snapshotRuns: runTimes.size,
    firstCapturedAt: first === null ? null : new Date(first).toISOString(),
    lastCapturedAt: last === null ? null : new Date(last).toISOString(),
    timeOfDay: timeOfDayStats(rows),
    sportWeekday: sportWeekdayStats(rows),
    history: dailyHistoryStats(historyRows),
    funnel: promoFunnel(funnelPromos, doneIds),
  };
}
