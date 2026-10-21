import Decimal from "decimal.js";

/**
 * Totals for the "Since Sep 27" section, built from the older daily
 * promo_profit_observations table (one row per promo per Denver day). No I/O.
 * Money is summed with decimal.js and returned as two-decimal strings.
 *
 * Two kinds of profit are kept apart:
 * - Available: the best profit each promo showed on a day (the observations).
 * - Extracted: the profit members recorded when they marked a promo done
 *   (the completions), counted on the day it was marked done.
 *
 * A promo is observed once per day it is live, so a 3-day promo has 3 rows.
 * Within the window each promo counts ONCE, at its best profit, placed on the
 * day it showed that profit (quick-261021-gy4). Without this a $5 boost live
 * for three days read as $15 available.
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
  promoId: number;
  denverDate: string;
  sportKey: string | null;
  bookKey: string;
  promoType: string;
  profit: string;
  bonusAmount: string | null;
  maxStake: string | null;
}

/** One "marked done" completion, with its promo's sport, type and book. */
export interface CompletionRow {
  promoId: number;
  /** Denver day the promo was marked done. */
  denverDate: string;
  sportKey: string | null;
  promoType: string;
  bookKey: string;
  profitExtracted: string;
}

export interface DaySegment {
  promoId: number;
  sportKey: string;
  profit: string;
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
  /** True for a day in the span with no observations (a day can be observed but hold no promo's best). */
  zero: boolean;
}

export interface GroupTotal {
  key: string;
  /** Available profit: the sum of each promo's best profit in the group. */
  total: string;
  /** Extracted profit: what members recorded when they marked promos in the group done. */
  extracted: string;
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
  /** Available profit in the window. */
  grandTotal: string;
  /** Extracted profit in the window. */
  extractedTotal: string;
  /** Calendar days from the first to the last recorded day, inclusive (or the window). */
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

type Keyed = { sportKey: string | null; promoType: string; bookKey: string };

/** Available and extracted totals per group, from observations and completions. */
function groupTotals(rows: HistoryRow[], completions: CompletionRow[], keyOf: (item: Keyed) => string): GroupTotal[] {
  const groups = new Map<string, { total: Decimal; extracted: Decimal; promos: number }>();
  const group = (key: string) => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { total: new Decimal(0), extracted: new Decimal(0), promos: 0 };
    groups.set(key, created);
    return created;
  };
  for (const row of rows) {
    const entry = group(keyOf(row));
    entry.total = entry.total.plus(row.profit);
    entry.promos += 1;
  }
  for (const completion of completions) {
    const entry = group(keyOf(completion));
    entry.extracted = entry.extracted.plus(completion.profitExtracted);
  }
  return [...groups.entries()]
    .map(([key, entry]) => ({
      key,
      total: entry.total.toFixed(2),
      extracted: entry.extracted.toFixed(2),
      promos: entry.promos,
      avgPerPromo: entry.promos === 0 ? "0.00" : entry.total.dividedBy(entry.promos).toDecimalPlaces(2).toFixed(2),
      smallSample: entry.promos < SMALL_SAMPLE_THRESHOLD,
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));
}

/** One row per promo: its best profit, on the earliest day it showed it. */
export function bestRowPerPromo(rows: HistoryRow[]): HistoryRow[] {
  const best = new Map<number, HistoryRow>();
  for (const row of rows) {
    const current = best.get(row.promoId);
    if (
      !current ||
      new Decimal(row.profit).greaterThan(current.profit) ||
      (new Decimal(row.profit).equals(current.profit) && row.denverDate < current.denverDate)
    ) {
      best.set(row.promoId, row);
    }
  }
  return [...best.values()];
}

/**
 * Totals for the given window (inclusive Denver days). With a window, the
 * span is every calendar day in it, so zero-profit days count too. Without
 * one (all time), the span runs from the first recorded day to the last.
 * Completions are filtered to the window by the day they were marked done.
 */
export function dailyHistoryStats(
  allRows: HistoryRow[],
  window?: { start: string; end: string },
  allCompletions: CompletionRow[] = [],
): DailyHistoryStats {
  const inWindow = (date: string) => !window || (date >= window.start && date <= window.end);
  const windowRows = allRows.filter((row) => inWindow(row.denverDate));
  const rows = bestRowPerPromo(windowRows);
  const completions = allCompletions.filter((completion) => inWindow(completion.denverDate));

  const byDay = new Map<string, { total: Decimal; bySport: Map<string, Decimal>; segments: DaySegment[] }>();
  let grand = new Decimal(0);

  for (const row of rows) {
    const profit = new Decimal(row.profit);
    grand = grand.plus(profit);
    const day = byDay.get(row.denverDate) ?? {
      total: new Decimal(0),
      bySport: new Map<string, Decimal>(),
      segments: [] as DaySegment[],
    };
    day.total = day.total.plus(profit);
    const sportKey = row.sportKey ?? UNKNOWN_SPORT;
    day.bySport.set(sportKey, (day.bySport.get(sportKey) ?? new Decimal(0)).plus(profit));
    day.segments.push({ promoId: row.promoId, sportKey, profit: profit.toFixed(2) });
    byDay.set(row.denverDate, day);
  }

  // The all-time span runs over every observed day, not only the best days.
  const observedDays = new Set(windowRows.map((row) => row.denverDate));
  const dates = [...observedDays].sort();
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
        .sort((a, b) => Number(b.profit) - Number(a.profit)),
      zero: !observedDays.has(date),
    };
  });

  const dayCount = span.length;
  const activeDayCount = span.filter((date) => observedDays.has(date)).length;

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

  const extractedTotal = completions.reduce((sum, completion) => sum.plus(completion.profitExtracted), new Decimal(0));

  return {
    days,
    sports: groupTotals(rows, completions, (item) => item.sportKey ?? UNKNOWN_SPORT),
    types: groupTotals(rows, completions, (item) => item.promoType),
    books: groupTotals(rows, completions, (item) => item.bookKey),
    bonusConversion: { records: bonusRecords, pct: toPct(bonusNum, bonusDen), excluded: bonusExcluded },
    boostConversion: { records: boostRecords, pct: toPct(boostNum, boostDen), excluded: boostExcluded },
    grandTotal: grand.toFixed(2),
    extractedTotal: extractedTotal.toFixed(2),
    dayCount,
    activeDayCount,
    zeroDayCount: dayCount - activeDayCount,
    promoCount: rows.length,
    avgPerPromo: rows.length === 0 ? "0.00" : grand.dividedBy(rows.length).toDecimalPlaces(2).toFixed(2),
    avgPerDay: dayCount === 0 ? "0.00" : grand.dividedBy(dayCount).toDecimalPlaces(2).toFixed(2),
  };
}
