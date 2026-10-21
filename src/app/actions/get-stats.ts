"use server";

import { requireUser } from "@/lib/session";
import { loadProfitSnapshotRows } from "@/db/profitSnapshots";
import {
  loadCompletionRows,
  loadDailyProfitHistory,
  loadDonePromoIds,
  loadFunnelPromos,
  loadScrapeRunTimes,
} from "@/db/profitHistory";
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
  /** Scrape runs in the range (from scrape_runs), including ones that found nothing profitable. */
  runs: number;
  firstRunAt: string | null;
  lastRunAt: string | null;
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

  const [allRows, allRunTimes, historyRows, completionRows, funnelPromos, doneIds] = await Promise.all([
    loadProfitSnapshotRows(),
    loadScrapeRunTimes(),
    loadDailyProfitHistory(),
    loadCompletionRows(),
    loadFunnelPromos(),
    loadDonePromoIds(),
  ]);
  const rows = start === null ? allRows : allRows.filter((row) => denverDate(row.capturedAt) >= start);

  const runTimes = start === null ? allRunTimes : allRunTimes.filter((time) => denverDate(time) >= start);
  let first: number | null = null;
  let last: number | null = null;
  for (const time of runTimes) {
    const ms = time.getTime();
    if (first === null || ms < first) first = ms;
    if (last === null || ms > last) last = ms;
  }

  return {
    range: selected,
    runs: runTimes.length,
    firstRunAt: first === null ? null : new Date(first).toISOString(),
    lastRunAt: last === null ? null : new Date(last).toISOString(),
    timeOfDay: timeOfDayStats(rows, runTimes),
    sportWeekday: sportWeekdayStats(rows),
    history: dailyHistoryStats(historyRows, window, completionRows),
    funnel: promoFunnel(funnelPromos, doneIds),
  };
}
