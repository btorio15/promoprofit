import { addDays } from "@/domain/promos/profitTotals";

/**
 * Time ranges for the Statistics page. Dates are Denver calendar days
 * (YYYY-MM-DD). A range covers today and the days before it, so "7d" is
 * seven calendar days including today. Pure, no I/O.
 */

export const STATS_RANGES = ["7d", "1m", "1y", "all"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const STATS_RANGE_LABELS: Record<StatsRange, string> = {
  "7d": "7 days",
  "1m": "1 month",
  "1y": "1 year",
  all: "All time",
};

/** Unknown or missing values fall back to all time. */
export function parseStatsRange(value: unknown): StatsRange {
  return (STATS_RANGES as readonly string[]).includes(value as string) ? (value as StatsRange) : "all";
}

/** Shifts a YYYY-MM-DD date by whole months, clamping to the month's last day. */
export function shiftMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** First Denver day in the range, or null for all time. */
export function rangeStartDate(range: StatsRange, today: string): string | null {
  switch (range) {
    case "7d":
      return addDays(today, -6);
    case "1m":
      return shiftMonths(today, -1);
    case "1y":
      return shiftMonths(today, -12);
    case "all":
      return null;
  }
}
