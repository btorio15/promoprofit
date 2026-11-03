export interface BookPickerOption {
  key: string;
  displayName: string;
  venue?: "sportsbook" | "market";
}

export const MARKET_AVAILABILITY_NOTE =
  "Regulated by the CFTC, not Colorado's gaming division. Check it's available to you.";
export const MARKETS_GROUP_HELPER = "Optional. Used only to hedge your sportsbook promos.";

/** Splits options into sportsbooks and markets, preserving input order. */
export function groupBookOptions<T extends BookPickerOption>(
  options: readonly T[],
): { sportsbooks: T[]; markets: T[] } {
  const sportsbooks: T[] = [];
  const markets: T[] = [];
  for (const option of options) {
    if (option.venue === "market") markets.push(option);
    else sportsbooks.push(option);
  }
  return { sportsbooks, markets };
}

/** True only when at least one selected key is a sportsbook option (D-04). */
export function hasSportsbook(
  selected: ReadonlySet<string>,
  options: readonly BookPickerOption[],
): boolean {
  return options.some((o) => o.venue !== "market" && selected.has(o.key));
}
