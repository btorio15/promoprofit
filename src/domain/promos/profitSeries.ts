/**
 * Pure series math for the profit graph (Phase 6).
 *
 * D-04 (revised) / D-18: the graph starts on the "graph start day" passed in
 * by the caller (earliest denver_date in the per-member observation table, or
 * today when empty). There is no group-level fallback and no estimated days.
 * All money is 2dp strings; arithmetic is decimal.js only.
 */
import Decimal from "decimal.js";
import { addDays, denverDate } from "./profitTotals";

export interface MemberProfitRow {
  promoId: number;
  denverDate: string;
  profit: string;
}

export interface CompletionGainInput {
  completedAt: Date;
  profitExtracted: string;
}

export interface DailyGain {
  date: string;
  available: string;
  extracted: string;
}

export interface ProfitSeriesData {
  today: string;
  graphStartDay: string;
  days: DailyGain[];
}

export type ProfitSeriesDTO =
  | { status: "ready"; today: string; graphStartDay: string; days: DailyGain[] }
  | { status: "not-ready" }
  | { status: "error" };

export type GraphRange = "7d" | "30d" | "all";

export interface SeriesPoint {
  date: string;
  availableTotal: string;
  extractedTotal: string;
  availableGain: string;
  extractedGain: string;
  anchor: boolean;
}

export interface SeriesArgs {
  memberRows: MemberProfitRow[];
  completions: CompletionGainInput[];
  graphStartDay: string;
  today: string;
}

export const GRAPH_RANGE_LABELS: Record<GraphRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

export function buildDailyGains({ memberRows, completions, graphStartDay, today }: SeriesArgs): DailyGain[] {
  const best = new Map<number, { profit: Decimal; firstDay: string }>();
  for (const r of memberRows) {
    const p = new Decimal(r.profit);
    const cur = best.get(r.promoId);
    if (!cur) {
      best.set(r.promoId, { profit: p, firstDay: r.denverDate });
    } else {
      if (p.greaterThan(cur.profit)) cur.profit = p;
      if (r.denverDate < cur.firstDay) cur.firstDay = r.denverDate;
    }
  }

  const availableByDay = new Map<string, Decimal>();
  for (const { profit, firstDay } of best.values()) {
    if (firstDay < graphStartDay || firstDay > today) continue;
    availableByDay.set(firstDay, (availableByDay.get(firstDay) ?? new Decimal(0)).plus(profit));
  }

  const extractedByDay = new Map<string, Decimal>();
  for (const c of completions) {
    const day = denverDate(c.completedAt);
    if (day < graphStartDay || day > today) continue;
    extractedByDay.set(day, (extractedByDay.get(day) ?? new Decimal(0)).plus(new Decimal(c.profitExtracted)));
  }

  const days: DailyGain[] = [];
  for (let d = graphStartDay; d <= today; d = addDays(d, 1)) {
    days.push({
      date: d,
      available: (availableByDay.get(d) ?? new Decimal(0)).toFixed(2),
      extracted: (extractedByDay.get(d) ?? new Decimal(0)).toFixed(2),
    });
  }
  return days;
}

export function buildProfitSeriesData(args: SeriesArgs): ProfitSeriesData {
  return { today: args.today, graphStartDay: args.graphStartDay, days: buildDailyGains(args) };
}

export function rangeStartDate(range: GraphRange, today: string, graphStartDay: string): string {
  const raw = range === "7d" ? addDays(today, -6) : range === "30d" ? addDays(today, -29) : graphStartDay;
  return raw > graphStartDay ? raw : graphStartDay;
}

export function cumulate(days: DailyGain[], startDate: string): SeriesPoint[] {
  let avail = new Decimal(0);
  let extr = new Decimal(0);
  const out: SeriesPoint[] = [];
  for (const d of days) {
    if (d.date < startDate) continue;
    avail = avail.plus(new Decimal(d.available));
    extr = extr.plus(new Decimal(d.extracted));
    out.push({
      date: d.date,
      availableTotal: avail.toFixed(2),
      extractedTotal: extr.toFixed(2),
      availableGain: d.available,
      extractedGain: d.extracted,
      anchor: false,
    });
  }
  return out;
}

export function withZeroAnchor(points: SeriesPoint[], startDate: string): SeriesPoint[] {
  const anchor: SeriesPoint = {
    date: addDays(startDate, -1),
    availableTotal: "0.00",
    extractedTotal: "0.00",
    availableGain: "0.00",
    extractedGain: "0.00",
    anchor: true,
  };
  return [anchor, ...points];
}

export function hasAnyGain(points: SeriesPoint[]): boolean {
  return points.some(
    (p) => !p.anchor && (!new Decimal(p.availableGain).isZero() || !new Decimal(p.extractedGain).isZero()),
  );
}

export function rangeTotals(points: SeriesPoint[]): { availableTotal: string; extractedTotal: string } {
  const last = points[points.length - 1];
  return last
    ? { availableTotal: last.availableTotal, extractedTotal: last.extractedTotal }
    : { availableTotal: "0.00", extractedTotal: "0.00" };
}

export function parseGraphRange(value: string | null | undefined): GraphRange {
  return value === "7d" || value === "30d" || value === "all" ? value : "30d";
}
