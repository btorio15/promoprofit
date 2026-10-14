import Decimal from "decimal.js";

/**
 * Totals for the "Since Sep 27" section, built from the older daily
 * promo_profit_observations table (one row per promo per Denver day). No I/O.
 * Each row is already one promo's best profit that day, so rows are summed
 * as they are.
 */

export interface HistoryRow {
  denverDate: string;
  sportKey: string | null;
  profit: string;
}

export interface DailyPoint {
  date: string;
  total: string;
}

export interface SportHistoryTotal {
  sportKey: string | null;
  total: string;
  promos: number;
}

export interface DailyHistoryStats {
  days: DailyPoint[];
  sports: SportHistoryTotal[];
  grandTotal: string;
  dayCount: number;
  promoCount: number;
}

export function dailyHistoryStats(rows: HistoryRow[]): DailyHistoryStats {
  const byDay = new Map<string, Decimal>();
  const bySport = new Map<string | null, { total: Decimal; promos: number }>();
  let grand = new Decimal(0);

  for (const row of rows) {
    const profit = new Decimal(row.profit);
    grand = grand.plus(profit);
    byDay.set(row.denverDate, (byDay.get(row.denverDate) ?? new Decimal(0)).plus(profit));
    const sport = bySport.get(row.sportKey) ?? { total: new Decimal(0), promos: 0 };
    sport.total = sport.total.plus(profit);
    sport.promos += 1;
    bySport.set(row.sportKey, sport);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, total]) => ({ date, total: total.toFixed(2) }));

  const sports = [...bySport.entries()]
    .map(([sportKey, value]) => ({ sportKey, total: value.total.toFixed(2), promos: value.promos }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  return {
    days,
    sports,
    grandTotal: grand.toFixed(2),
    dayCount: byDay.size,
    promoCount: rows.length,
  };
}
