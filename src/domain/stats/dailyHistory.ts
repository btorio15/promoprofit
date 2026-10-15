import Decimal from "decimal.js";

/**
 * Totals for the "Since Sep 27" section, built from the older daily
 * promo_profit_observations table (one row per promo per Denver day). No I/O.
 * Money is summed with decimal.js and returned as two-decimal strings.
 *
 * Days with no observations between the first and last recorded day are
 * counted as zero-profit days, so the average per day is over every calendar
 * day in the span, not just the days that happened to have a row.
 */

/** Key used for promos whose sport is unknown (no linked promo row). */
export const UNKNOWN_SPORT = "unknown";

/** Groups with fewer promo records than this are flagged as small samples. */
export const SMALL_SAMPLE_THRESHOLD = 5;

/**
 * Bonus amounts above this are treated as data-entry errors and left out of
 * conversion rates (e.g. a $250,000 bonus recorded for a $250 one).
 */
export const MAX_PLAUSIBLE_BONUS = new Decimal(1000);

export interface HistoryRow {
  denverDate: string;
  sportKey: string | null;
  bookKey: string;
  promoType: string;
  profit: string;
  bonusAmount: string | null;
  maxStake: string | null;
}

export interface DailyPoint {
  date: string;
  total: string;
  /** Running total up to and including this day. */
  cumulative: string;
  /** Profit that day per sport key (UNKNOWN_SPORT for promos with no sport). */
  bySport: Record<string, string>;
  /** One entry per promo record that day, largest first. Drives the segmented bars. */
  segments: DaySegment[];
  /** True for a day in the span with no observations. */
  zero: boolean;
}

export interface DaySegment {
  sportKey: string;
  profit: string;
}

export interface GroupTotal {
  key: string | null;
  total: string;
  promos: number;
  avgPerPromo: string;
  smallSample: boolean;
}

export interface ConversionRate {
  records: number;
  /** Sum of profit over the sum of face value, as a percentage, or null if none. */
  pct: string | null;
  /** Records dropped for an implausible face value. */
  excluded: number;
}

export interface DailyHistoryStats {
  days: DailyPoint[];
  sports: GroupTotal[];
  types: GroupTotal[];
  books: GroupTotal[];
  bonusConversion: ConversionRate;
  boostConversion: ConversionRate;
  grandTotal: string;
  /** Calendar days from the first to the last recorded day, inclusive. */
  dayCount: number;
  /** Days in the span with at least one observation. */
  activeDayCount: number;
  zeroDayCount: number;
  promoCount: number;
  avgPerPromo: string;
  avgPerDay: string;
}

function toPct(numerator: Decimal, denominator: Decimal): string | null {
  return denominator.greaterThan(0) ? numerator.dividedBy(denominator).times(100).toDecimalPlaces(2).toFixed(2) : null;
}

/** Every calendar day from `start` to `end` (YYYY-MM-DD), inclusive, in order. */
function calendarDays(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function groupTotals<K extends string | null>(
  rows: HistoryRow[],
  keyOf: (row: HistoryRow) => K,
): GroupTotal[] {
  const groups = new Map<K, { total: Decimal; promos: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { total: new Decimal(0), promos: 0 };
    group.total = group.total.plus(row.profit);
    group.promos += 1;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      total: group.total.toFixed(2),
      promos: group.promos,
      avgPerPromo: group.total.dividedBy(group.promos).toDecimalPlaces(2).toFixed(2),
      smallSample: group.promos < SMALL_SAMPLE_THRESHOLD,
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));
}

/**
 * Totals for the given window (inclusive Denver days). With a window, the
 * span is every calendar day in it, so zero-profit days count too. Without
 * one (all time), the span runs from the first recorded day to the last.
 */
export function dailyHistoryStats(allRows: HistoryRow[], window?: { start: string; end: string }): DailyHistoryStats {
  const rows = window ? allRows.filter((row) => row.denverDate >= window.start && row.denverDate <= window.end) : allRows;
  const byDay = new Map<string, { total: Decimal; bySport: Map<string, Decimal>; segments: { sportKey: string; profit: Decimal }[] }>();
  let grand = new Decimal(0);

  for (const row of rows) {
    const profit = new Decimal(row.profit);
    grand = grand.plus(profit);
    const day = byDay.get(row.denverDate) ?? {
      total: new Decimal(0),
      bySport: new Map<string, Decimal>(),
      segments: [] as { sportKey: string; profit: Decimal }[],
    };
    day.total = day.total.plus(profit);
    const sportKey = row.sportKey ?? UNKNOWN_SPORT;
    day.bySport.set(sportKey, (day.bySport.get(sportKey) ?? new Decimal(0)).plus(profit));
    day.segments.push({ sportKey, profit });
    byDay.set(row.denverDate, day);
  }

  const dates = [...byDay.keys()].sort();
  const span = window
    ? calendarDays(window.start, window.end)
    : dates.length === 0
      ? []
      : calendarDays(dates[0], dates[dates.length - 1]);
  let running = new Decimal(0);
  const days: DailyPoint[] = span.map((date) => {
    const day = byDay.get(date);
    const total = day?.total ?? new Decimal(0);
    running = running.plus(total);
    return {
      date,
      total: total.toFixed(2),
      cumulative: running.toFixed(2),
      bySport: Object.fromEntries([...(day?.bySport ?? new Map()).entries()].map(([k, v]) => [k, v.toFixed(2)])),
      segments: (day?.segments ?? [])
        .slice()
        .sort((a, b) => b.profit.comparedTo(a.profit))
        .map((segment) => ({ sportKey: segment.sportKey, profit: segment.profit.toFixed(2) })),
      zero: day === undefined,
    };
  });

  const dayCount = span.length;
  const activeDayCount = byDay.size;

  let bonusNum = new Decimal(0);
  let bonusDen = new Decimal(0);
  let bonusRecords = 0;
  let bonusExcluded = 0;
  let boostNum = new Decimal(0);
  let boostDen = new Decimal(0);
  let boostRecords = 0;
  let boostExcluded = 0;
  for (const row of rows) {
    const profit = new Decimal(row.profit);
    if (row.promoType === "bonus_bet" && row.bonusAmount !== null) {
      const face = new Decimal(row.bonusAmount);
      if (face.greaterThan(0) && face.lessThanOrEqualTo(MAX_PLAUSIBLE_BONUS)) {
        bonusNum = bonusNum.plus(profit);
        bonusDen = bonusDen.plus(face);
        bonusRecords += 1;
      } else {
        bonusExcluded += 1;
      }
    }
    if (row.promoType === "profit_boost" && row.maxStake !== null) {
      const stake = new Decimal(row.maxStake);
      if (stake.greaterThan(0)) {
        boostNum = boostNum.plus(profit);
        boostDen = boostDen.plus(stake);
        boostRecords += 1;
      } else {
        boostExcluded += 1;
      }
    }
  }

  return {
    days,
    sports: groupTotals(rows, (row) => row.sportKey ?? UNKNOWN_SPORT),
    types: groupTotals(rows, (row) => row.promoType),
    books: groupTotals(rows, (row) => row.bookKey),
    bonusConversion: { records: bonusRecords, pct: toPct(bonusNum, bonusDen), excluded: bonusExcluded },
    boostConversion: { records: boostRecords, pct: toPct(boostNum, boostDen), excluded: boostExcluded },
    grandTotal: grand.toFixed(2),
    dayCount,
    activeDayCount,
    zeroDayCount: dayCount - activeDayCount,
    promoCount: rows.length,
    avgPerPromo: rows.length === 0 ? "0.00" : grand.dividedBy(rows.length).toDecimalPlaces(2).toFixed(2),
    avgPerDay: dayCount === 0 ? "0.00" : grand.dividedBy(dayCount).toDecimalPlaces(2).toFixed(2),
  };
}
