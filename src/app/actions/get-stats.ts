"use server";

import { requireUser } from "@/lib/session";
import { loadProfitSnapshotRows } from "@/db/profitSnapshots";
import { loadCompletionRows, loadDailyProfitHistory, loadDonePromoIds, loadFunnelPromos } from "@/db/profitHistory";
import {
  sportWeekdayStats,
  timeOfDayStats,
  type HourOfDayStat,
  type SportWeekdayStats,
} from "@/domain/stats/profitStats";
import { dailyHistoryStats, type DailyHistoryStats } from "@/domain/stats/dailyHistory";
import { promoFunnel, type PromoFunnelStats } from "@/domain/stats/promoFunnel";
import { parseStatsRange, rangeStartDate, type StatsRange } from "@/domain/stats/statsRange";
import { denverDate } from "@/domain/promos/profitTotals";

export interface StatsDTO {
  /** The range these figures cover. */
  range: StatsRange;
  /** Scheduled odds runs in the range that recorded at least one snapshot. */
  snapshotRuns: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  timeOfDay: HourOfDayStat[];
  sportWeekday: SportWeekdayStats;
  /** Older daily data (promo_profit_observations) in the range. */
  history: DailyHistoryStats;
  /** Promo availability, marked-done counts, and per-book health (current state, not ranged). */
  funnel: PromoFunnelStats;
}

/**
 * Stats figures for a range (7 days, 1 month, 1 year, or all time). Dates
 * are Denver days. The range ends today. Group-level, so the same for every
 * member. requireUser() is the literal first statement, so only signed-in
 * members can read it.
 */
export async function getStats(range: string = "all"): Promise<StatsDTO> {
  await requireUser();

  const selected = parseStatsRange(range);
  const today = denverDate(new Date());
  const start = rangeStartDate(selected, today);
  const window = start === null ? undefined : { start, end: today };

  const [allRows, historyRows, completionRows, funnelPromos, doneIds] = await Promise.all([
    loadProfitSnapshotRows(),
    loadDailyProfitHistory(),
    loadCompletionRows(),
    loadFunnelPromos(),
    loadDonePromoIds(),
  ]);
  const rows = start === null ? allRows : allRows.filter((row) => denverDate(row.capturedAt) >= start);

  const runTimes = new Set(rows.map((row) => row.capturedAt.getTime()));
  let first: number | null = null;
  let last: number | null = null;
  for (const time of runTimes) {
    if (first === null || time < first) first = time;
    if (last === null || time > last) last = time;
  }

  return {
    range: selected,
    snapshotRuns: runTimes.size,
    firstCapturedAt: first === null ? null : new Date(first).toISOString(),
    lastCapturedAt: last === null ? null : new Date(last).toISOString(),
    timeOfDay: timeOfDayStats(rows),
    sportWeekday: sportWeekdayStats(rows),
    history: dailyHistoryStats(historyRows, window, completionRows),
    funnel: promoFunnel(funnelPromos, doneIds),
  };
}
