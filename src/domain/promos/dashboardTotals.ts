/**
 * Pure totals and counts for the Dashboard totals card (Phase 7, STATS-08/09).
 * All money is 2dp strings; arithmetic is decimal.js only.
 *
 * Extracted comes from raw completions (never clipped at the graph start day);
 * available comes only from the member series days so it cannot disagree with
 * the graph's grey line.
 */
import Decimal from "decimal.js";
import type { DonePromoDTO } from "./doneSnapshot";
import type { ProfitSeriesDTO } from "./profitSeries";
import { denverDate, periodStartDates } from "./profitTotals";

export interface DashboardBestPromo {
  profit: string; // 2dp
  bookLabel: string; // single: "DraftKings"; pair: "DraftKings + FanDuel pair"
  name: string | null; // single: full untruncated promo title; pair: null
  isPair: boolean;
}

export interface DashboardTotalsDTO {
  extracted: { allTime: string; last7: string; last30: string };
  /** null when the member series is not-ready or error. */
  available: { sinceDay: string; allTime: string; last7: string; last30: string } | null;
  counts: { promosDone: number; averageExtracted: string | null; best: DashboardBestPromo | null };
}

export interface DashboardTotalsInput {
  series: ProfitSeriesDTO;
  /** RAW rows including pair markers (0.00). */
  completions: { completedAt: Date; profitExtracted: string }[];
  /** Pair markers already dropped. */
  doneRows: Pick<DonePromoDTO, "kind" | "bookName" | "title" | "profitExtracted" | "completedAt">[];
  now: Date;
}

const ZERO = new Decimal(0);

export function buildDashboardTotals(input: DashboardTotalsInput): DashboardTotalsDTO {
  const { series, completions, doneRows, now } = input;
  const { today, weekStart, monthStart } = periodStartDates(now);

  let exAll = ZERO;
  let ex7 = ZERO;
  let ex30 = ZERO;
  for (const c of completions) {
    const p = new Decimal(c.profitExtracted);
    const day = denverDate(c.completedAt);
    exAll = exAll.plus(p);
    if (day <= today) {
      if (day >= weekStart) ex7 = ex7.plus(p);
      if (day >= monthStart) ex30 = ex30.plus(p);
    }
  }

  let available: DashboardTotalsDTO["available"] = null;
  if (series.status === "ready") {
    let avAll = ZERO;
    let av7 = ZERO;
    let av30 = ZERO;
    for (const d of series.days) {
      const a = new Decimal(d.available);
      avAll = avAll.plus(a);
      if (d.date <= today) {
        if (d.date >= weekStart) av7 = av7.plus(a);
        if (d.date >= monthStart) av30 = av30.plus(a);
      }
    }
    available = {
      sinceDay: series.graphStartDay,
      allTime: avAll.toFixed(2),
      last7: av7.toFixed(2),
      last30: av30.toFixed(2),
    };
  }

  const promosDone = doneRows.length;
  const averageExtracted =
    promosDone === 0 ? null : exAll.div(promosDone).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

  let bestRow: (typeof doneRows)[number] | null = null;
  let bestProfit = ZERO;
  for (const r of doneRows) {
    const p = new Decimal(r.profitExtracted);
    if (p.lte(0)) continue;
    if (bestRow === null || p.gt(bestProfit) || (p.eq(bestProfit) && r.completedAt > bestRow.completedAt)) {
      bestRow = r;
      bestProfit = p;
    }
  }
  const best: DashboardBestPromo | null =
    bestRow === null
      ? null
      : bestRow.kind === "pair"
        ? { profit: bestProfit.toFixed(2), bookLabel: `${bestRow.bookName} pair`, name: null, isPair: true }
        : { profit: bestProfit.toFixed(2), bookLabel: bestRow.bookName, name: bestRow.title, isPair: false };

  return {
    extracted: { allTime: exAll.toFixed(2), last7: ex7.toFixed(2), last30: ex30.toFixed(2) },
    available,
    counts: { promosDone, averageExtracted, best },
  };
}
