import Decimal from "decimal.js";

/**
 * Totals for the "Since Sep 27" section, built from the older daily
 * promo_profit_observations table (one row per promo per Denver day). No I/O.
 * Each row is already one promo's best profit that day, so rows are summed
 * as they are. Money is summed with decimal.js and returned as two-decimal
 * strings.
 */

/** Key used for promos whose sport is unknown (no linked promo row). */
export const UNKNOWN_SPORT = "unknown";

export interface HistoryRow {
  denverDate: string;
  sportKey: string | null;
  profit: string;
}

export interface DailyPoint {
  date: string;
  total: string;
  /** Profit that day per sport key (UNKNOWN_SPORT for promos with no sport). */
  bySport: Record<string, string>;
}

export interface SportHistoryTotal {
  sportKey: string | null;
  total: string;
  promos: number;
  /** Total divided by promo records. */
  avgPerPromo: string;
  /** Total divided by days recorded (all days, not just days this sport appeared). */
  avgPerDay: string;
}

export interface DailyHistoryStats {
  days: DailyPoint[];
  sports: SportHistoryTotal[];
  grandTotal: string;
  dayCount: number;
  promoCount: number;
  avgPerPromo: string;
  avgPerDay: string;
}

function perDay(total: Decimal, days: number): string {
  return days === 0 ? "0.00" : total.dividedBy(days).toDecimalPlaces(2).toFixed(2);
}

export function dailyHistoryStats(rows: HistoryRow[]): DailyHistoryStats {
  const byDay = new Map<string, { total: Decimal; bySport: Map<string, Decimal> }>();
  const bySport = new Map<string | null, { total: Decimal; promos: number }>();
  let grand = new Decimal(0);

  for (const row of rows) {
    const profit = new Decimal(row.profit);
    grand = grand.plus(profit);

    const day = byDay.get(row.denverDate) ?? { total: new Decimal(0), bySport: new Map() };
    day.total = day.total.plus(profit);
    const sportKeyForDay = row.sportKey ?? UNKNOWN_SPORT;
    day.bySport.set(sportKeyForDay, (day.bySport.get(sportKeyForDay) ?? new Decimal(0)).plus(profit));
    byDay.set(row.denverDate, day);

    const sport = bySport.get(row.sportKey) ?? { total: new Decimal(0), promos: 0 };
    sport.total = sport.total.plus(profit);
    sport.promos += 1;
    bySport.set(row.sportKey, sport);
  }

  const dayCount = byDay.size;

  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, day]) => ({
      date,
      total: day.total.toFixed(2),
      bySport: Object.fromEntries([...day.bySport.entries()].map(([key, value]) => [key, value.toFixed(2)])),
    }));

  const sports = [...bySport.entries()]
    .map(([sportKey, value]) => ({
      sportKey,
      total: value.total.toFixed(2),
      promos: value.promos,
      avgPerPromo: value.total.dividedBy(value.promos).toDecimalPlaces(2).toFixed(2),
      avgPerDay: perDay(value.total, dayCount),
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  return {
    days,
    sports,
    grandTotal: grand.toFixed(2),
    dayCount,
    promoCount: rows.length,
    avgPerPromo: rows.length === 0 ? "0.00" : grand.dividedBy(rows.length).toDecimalPlaces(2).toFixed(2),
    avgPerDay: perDay(grand, dayCount),
  };
}
