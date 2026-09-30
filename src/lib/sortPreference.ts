import type { SortKey } from "@/domain/opportunities/types";

/** D-14/D-15: anything other than a stored "roi" falls back to profit. */
export function parseSortMode(value: string | null | undefined): SortKey {
  return value === "roi" ? "roi" : "profit";
}

export function sortCaption(sort: SortKey): string {
  return sort === "roi" ? "Top 5 by ROI" : "Top 5 by guaranteed profit";
}

export function countLabel(base: string, n: number): string {
  return n > 0 ? `${base} (${n})` : base;
}
