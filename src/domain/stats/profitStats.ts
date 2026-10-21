import Decimal from "decimal.js";

/**
 * Pure aggregation for the Stats tab (profit_snapshots rows -> view numbers).
 * No I/O. All money is summed with decimal.js and returned as two-decimal
 * strings, matching how every other profit figure in the app is shown.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DENVER_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "2-digit",
  hourCycle: "h23",
});
const DENVER_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  weekday: "short",
});

/** Hour of day (0-23) in Denver for an instant. */
export function denverHour(instant: Date): number {
  return Number(DENVER_HOUR.format(instant)) % 24;
}

/** Weekday of an instant in Denver, Monday first. */
export function denverWeekday(instant: Date): Weekday {
  const short = DENVER_WEEKDAY.format(instant);
  const match = WEEKDAYS.find((day) => short.startsWith(day));
  if (!match) throw new Error(`denverWeekday: unexpected weekday "${short}"`);
  return match;
}

export interface SnapshotRow {
  promoId: number;
  capturedAt: Date;
  denverHour: number;
  sportKey: string;
  gameAt: Date | null;
  guaranteedProfit: string;
}

export interface HourOfDayStat {
  hour: number;
  /** Scheduled snapshot runs that captured this hour. */
  runs: number;
  /** Average total profit available per run captured in this hour. */
  avgProfit: string;
}

/** A snapshot belongs to the scrape run that started at most this long before it. */
export const SNAPSHOT_RUN_WINDOW_MS = 30 * 60 * 1000;

/**
 * Average profit available per run, grouped by the Denver hour of the run.
 * Each run's total is the sum of its promo profits; a promo appears once per
 * run, so the sum is "profit available in that run".
 *
 * Snapshots are only written when a run finds a profitable promo, so a run
 * with nothing profitable leaves no rows. Pass the scrape run start times
 * (scrape_runs.ran_at) to count those runs as $0 (quick-261021-gy4). Only
 * runs from the first snapshot onward count -- earlier runs predate the
 * recorder. Without runTimes, each distinct capture time is one run.
 */
export function timeOfDayStats(rows: SnapshotRow[], runTimes: Date[] = []): HourOfDayStat[] {
  const runTotals = new Map<number, { hour: number; total: Decimal }>();
  const firstCapture = rows.reduce<number | null>(
    (min, row) => (min === null || row.capturedAt.getTime() < min ? row.capturedAt.getTime() : min),
    null,
  );
  const runs = [...new Set(runTimes.map((time) => time.getTime()))]
    .filter((time) => firstCapture !== null && time >= firstCapture - SNAPSHOT_RUN_WINDOW_MS)
    .sort((a, b) => a - b);
  for (const time of runs) runTotals.set(time, { hour: denverHour(new Date(time)), total: new Decimal(0) });

  for (const row of rows) {
    const captured = row.capturedAt.getTime();
    // Latest run that started at or before this capture, within the window.
    let key: number | null = null;
    for (const time of runs) {
      if (time <= captured && captured - time <= SNAPSHOT_RUN_WINDOW_MS) key = time;
      if (time > captured) break;
    }
    const runKey = key ?? captured;
    const run = runTotals.get(runKey) ?? { hour: row.denverHour, total: new Decimal(0) };
    run.total = run.total.plus(row.guaranteedProfit);
    runTotals.set(runKey, run);
  }

  const byHour = new Map<number, { runs: number; total: Decimal }>();
  for (const run of runTotals.values()) {
    const bucket = byHour.get(run.hour) ?? { runs: 0, total: new Decimal(0) };
    bucket.runs += 1;
    bucket.total = bucket.total.plus(run.total);
    byHour.set(run.hour, bucket);
  }

  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bucket]) => ({
      hour,
      runs: bucket.runs,
      avgProfit: bucket.total.dividedBy(bucket.runs).toFixed(2),
    }));
}

export interface SportWeekdayRow {
  sportKey: string;
  byDay: Record<Weekday, string>;
  total: string;
  /** Weekday with the most profit for this sport, or null when it has none. */
  bestDay: Weekday | null;
}

export interface SportWeekdayStats {
  rows: SportWeekdayRow[];
  /** Promos with no game time (sport-wide windows without a start), not counted above. */
  unscheduledPromos: number;
}

/**
 * Profit by sport and game weekday. A promo can be observed in several runs,
 * so each promo counts once at its best observed profit (the same rule the
 * group-level observations use). Promos without a game time are counted as
 * unscheduled instead of being guessed onto a weekday.
 */
export function sportWeekdayStats(rows: SnapshotRow[]): SportWeekdayStats {
  const bestByPromo = new Map<number, { sportKey: string; gameAt: Date | null; best: Decimal }>();
  for (const row of rows) {
    const profit = new Decimal(row.guaranteedProfit);
    const current = bestByPromo.get(row.promoId);
    if (!current) {
      bestByPromo.set(row.promoId, { sportKey: row.sportKey, gameAt: row.gameAt, best: profit });
    } else if (profit.greaterThan(current.best)) {
      current.best = profit;
    }
  }

  const sports = new Map<string, Record<Weekday, Decimal>>();
  let unscheduledPromos = 0;
  for (const promo of bestByPromo.values()) {
    if (!promo.gameAt) {
      unscheduledPromos += 1;
      continue;
    }
    const days = sports.get(promo.sportKey) ?? emptyWeekdayTotals();
    const day = denverWeekday(promo.gameAt);
    days[day] = days[day].plus(promo.best);
    sports.set(promo.sportKey, days);
  }

  const result: SportWeekdayRow[] = [...sports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sportKey, days]) => {
      let total = new Decimal(0);
      let bestDay: Weekday | null = null;
      let bestValue = new Decimal(0);
      for (const day of WEEKDAYS) {
        total = total.plus(days[day]);
        if (days[day].greaterThan(bestValue)) {
          bestValue = days[day];
          bestDay = day;
        }
      }
      const byDay = Object.fromEntries(WEEKDAYS.map((day) => [day, days[day].toFixed(2)])) as Record<Weekday, string>;
      return { sportKey, byDay, total: total.toFixed(2), bestDay };
    });

  return { rows: result, unscheduledPromos };
}

function emptyWeekdayTotals(): Record<Weekday, Decimal> {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, new Decimal(0)])) as Record<Weekday, Decimal>;
}
