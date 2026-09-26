import type { ArbMarketType } from "@/domain/hedge/rankArbs";

/**
 * Market-badge and selection-label formatters for arb rows (D-15). Pure,
 * zero-I/O. Line numbers extracted by spreadsTotalsFilter.ts are always
 * half-integers, so String(n) (via template literals) is exact -- no
 * rounding concern the way money strings have. signedPoint mirrors
 * src/lib/format.ts's formatAmerican U+2212-minus convention so spread
 * selections match the rest of the app's negative-number idiom.
 */
export function marketBadgeLabel(marketType: ArbMarketType, line: number | null): string {
  switch (marketType) {
    case "moneyline":
      return "Moneyline";
    case "spread":
      return `Spread ±${Math.abs(line ?? 0)}`;
    case "total":
      return `Total O/U ${line}`;
  }
}

function signedPoint(point: number): string {
  return point >= 0 ? `+${point}` : `−${Math.abs(point)}`;
}

export function selectionLabel(
  marketType: ArbMarketType,
  selection: string,
  point: number | null,
): string {
  switch (marketType) {
    case "moneyline":
      return selection;
    case "spread":
      return `${selection} ${signedPoint(point ?? 0)}`;
    case "total":
      return `${selection} ${point}`;
  }
}
