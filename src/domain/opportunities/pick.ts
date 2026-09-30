import Decimal from "decimal.js";
import type { RankKey, SortKey } from "./types";

/** D-04: each source section shows its top 5. */
export const TOP_N = 5;

/**
 * Sorts by the chosen measure, descending, comparing exact decimals (never
 * string or float compare). Ties break by commenceTime asc, then rowKey asc.
 * Returns a new array.
 */
export function sortByMeasure<T>(items: T[], sort: SortKey, key: (item: T) => RankKey): T[] {
  const field = sort === "profit" ? "profit" : "pct";
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = new Decimal(kb[field]).comparedTo(new Decimal(ka[field]));
    if (cmp !== 0) return cmp;
    if (ka.commenceTime !== kb.commenceTime) return ka.commenceTime < kb.commenceTime ? -1 : 1;
    if (ka.rowKey !== kb.rowKey) return ka.rowKey < kb.rowKey ? -1 : 1;
    return 0;
  });
}

export function pickTop<T extends RankKey>(items: T[], sort: SortKey, n: number): T[] {
  return sortByMeasure(items, sort, (item) => item).slice(0, n);
}
