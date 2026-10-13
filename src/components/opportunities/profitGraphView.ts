/**
 * Pure view model for the ProfitGraph (Phase 6, STATS-04/05/06). No React,
 * no recharts. All displayed money stays a server decimal string run through
 * formatUsd.
 */
import {
  GRAPH_RANGE_LABELS,
  cumulate,
  hasAnyGain,
  rangeStartDate,
  rangeTotals,
  withZeroAnchor,
  type GraphRange,
  type ProfitSeriesDTO,
  type SeriesPoint,
} from "@/domain/promos/profitSeries";
import { formatUsd } from "@/lib/format";

export type GraphViewState = "chart" | "empty" | "not-ready" | "error";

export interface ChartPoint extends SeriesPoint {
  /**
   * Plotting-only numbers. Per CLAUDE.md (no float money math) nothing
   * displayed is derived from these; the string fields are what is shown.
   */
  availableY: number;
  extractedY: number;
}

export interface GraphView {
  state: GraphViewState;
  heading?: string;
  body?: string;
  points: ChartPoint[];
  headline: { extracted: string; available: string };
  ariaLabel: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function utcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatTickDate(date: string): string {
  const d = utcDate(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatTooltipDate(date: string): string {
  const d = utcDate(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatGain(amount: string): string {
  return `+${formatUsd(amount)}`;
}

export function tooltipGainLine(point: Pick<SeriesPoint, "availableGain" | "extractedGain">): string {
  return `That day: ${formatGain(point.availableGain)} available, ${formatGain(point.extractedGain)} extracted`;
}

function ariaFor(extracted: string, available: string, range: GraphRange): string {
  return `Extracted ${formatUsd(extracted)} of ${formatUsd(available)} available, ${GRAPH_RANGE_LABELS[range]}`;
}

export function buildGraphView(series: ProfitSeriesDTO, range: GraphRange): GraphView {
  const zero = { extracted: "0.00", available: "0.00" };
  if (series.status === "not-ready") {
    return {
      state: "not-ready",
      heading: "Graph not ready yet",
      body: "The graph is being set up and will appear once setup finishes. Your totals elsewhere are not affected.",
      points: [],
      headline: zero,
      ariaLabel: "Profit graph",
    };
  }
  if (series.status === "error") {
    return {
      state: "error",
      heading: "Couldn't load the graph",
      body: "Your opportunities below are fine. Refresh the page to try again.",
      points: [],
      headline: zero,
      ariaLabel: "Profit graph",
    };
  }

  const start = rangeStartDate(range, series.today, series.graphStartDay);
  const real = cumulate(series.days, start);
  const totals = rangeTotals(real);
  const headline = { extracted: totals.extractedTotal, available: totals.availableTotal };
  const points: ChartPoint[] = withZeroAnchor(real, start).map((p) => ({
    ...p,
    availableY: Number(p.availableTotal),
    extractedY: Number(p.extractedTotal),
  }));
  const ariaLabel = ariaFor(headline.extracted, headline.available, range);

  if (!hasAnyGain(real)) {
    return {
      state: "empty",
      heading: "Nothing yet",
      body:
        series.graphStartDay === series.today
          ? "The graph starts today. Come back tomorrow to see your first line."
          : "Once you have profit to take or you mark a promo done, your lines will show up here.",
      points,
      headline,
      ariaLabel,
    };
  }
  return { state: "chart", points, headline, ariaLabel };
}
