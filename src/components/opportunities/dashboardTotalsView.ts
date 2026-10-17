/**
 * Pure view model for the Dashboard totals card (Phase 7). No React.
 * All money stays a server decimal string run through formatUsd.
 */
import type { DashboardTotalsDTO } from "@/domain/promos/dashboardTotals";
import { formatUsd } from "@/lib/format";
import { formatTickDate } from "./profitGraphView";

export interface TotalsCell {
  label: string;
  value: string;
  tone: "extracted" | "available" | "muted";
  caption: string | null;
}

export interface TotalsView {
  cells: [TotalsCell, TotalsCell, TotalsCell, TotalsCell];
  counts:
    | { empty: true; text: "No promos done yet" }
    | {
        empty: false;
        lead: string;
        average: string | null;
        best: { profit: string; label: string; fullName: string } | null;
      };
  countsText: string;
}

const SEP = " · ";

export function buildTotalsView(dto: DashboardTotalsDTO): TotalsView {
  const { extracted, available, counts } = dto;
  const caption = (v: string | undefined): string | null => (available && v !== undefined ? `of ${formatUsd(v)} available` : null);

  const cells: TotalsView["cells"] = [
    { label: "Extracted all-time", value: formatUsd(extracted.allTime), tone: "extracted", caption: null },
    available
      ? {
          label: `Available since ${formatTickDate(available.sinceDay)}`,
          value: formatUsd(available.allTime),
          tone: "available",
          caption: null,
        }
      : { label: "Available", value: "Not ready yet", tone: "muted", caption: null },
    { label: "Last 7 days", value: formatUsd(extracted.last7), tone: "extracted", caption: caption(available?.last7) },
    { label: "Last 30 days", value: formatUsd(extracted.last30), tone: "extracted", caption: caption(available?.last30) },
  ];

  if (counts.promosDone === 0) {
    return { cells, counts: { empty: true, text: "No promos done yet" }, countsText: "No promos done yet" };
  }

  const lead = counts.promosDone === 1 ? "1 promo done" : `${counts.promosDone} promos done`;
  const average = counts.averageExtracted !== null ? formatUsd(counts.averageExtracted) : null;
  const best = counts.best
    ? {
        profit: formatUsd(counts.best.profit),
        label: counts.best.bookLabel,
        fullName: counts.best.name ? `${counts.best.bookLabel}${SEP}${counts.best.name}` : counts.best.bookLabel,
      }
    : null;

  const segments = [lead];
  if (average !== null) segments.push(`avg ${average} each`);
  if (best) segments.push(`best ${best.profit}${SEP}${best.fullName}`);

  return { cells, counts: { empty: false, lead, average, best }, countsText: segments.join(SEP) };
}
