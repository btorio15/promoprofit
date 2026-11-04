import Decimal from "decimal.js";
import type { HistoryRow } from "@/domain/stats/dailyHistory";

/**
 * Running total of profit offered across the site, for the Statistics hero.
 * Each promo counts ONCE: its highest recorded daily profit, dated on the
 * first Denver day it appeared in the window. Days with nothing new carry the
 * previous total forward. Money is summed with decimal.js and returned as
 * two-decimal strings. No I/O.
 */
export interface RunningTotalPoint {
  date: string;
  /** Cumulative total up to and including this day. */
  total: string;
  /** Profit of promos first seen this day. */
  added: string;
}

export interface RunningTotal {
  points: RunningTotalPoint[];
  total: string;
  promoCount: number;
  /** First Denver date with a promo in the window, or null. */
  since: string | null;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildRunningTotal(
  history: HistoryRow[],
  range?: { start: string; end: string },
): RunningTotal {
  const promos = new Map<number, { first: string; best: Decimal }>();
  for (const row of history) {
    if (row.promoType === "no_sweat") continue;
    if (range && (row.denverDate < range.start || row.denverDate > range.end)) continue;
    const profit = new Decimal(row.profit);
    const seen = promos.get(row.promoId);
    if (!seen) {
      promos.set(row.promoId, { first: row.denverDate, best: profit });
    } else {
      if (row.denverDate < seen.first) seen.first = row.denverDate;
      if (profit.gt(seen.best)) seen.best = profit;
    }
  }
  if (promos.size === 0) return { points: [], total: "0.00", promoCount: 0, since: null };

  const addedByDate = new Map<string, Decimal>();
  for (const { first, best } of promos.values()) {
    addedByDate.set(first, (addedByDate.get(first) ?? new Decimal(0)).plus(best));
  }
  const dates = [...addedByDate.keys()].sort();
  const since = dates[0];
  const last = dates[dates.length - 1];

  const points: RunningTotalPoint[] = [];
  let running = new Decimal(0);
  for (let date = since; date <= last; date = nextDay(date)) {
    const added = addedByDate.get(date) ?? new Decimal(0);
    running = running.plus(added);
    points.push({ date, total: running.toFixed(2), added: added.toFixed(2) });
  }
  return { points, total: running.toFixed(2), promoCount: promos.size, since };
}
