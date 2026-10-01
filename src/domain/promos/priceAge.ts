import type { OddsEvent } from "@/domain/odds/schemas";
import { formatKickoff } from "@/lib/format";
import type { ResolvedSelection } from "./selection";

/**
 * quick-261001-e1j: how old a promo row's prices are. Pure, no src/db
 * imports and no Date.now(): callers pass "now". The timestamps are CACHE
 * fetch times (when we pulled the prices from the Odds API), which is
 * exactly what the "Prices as of" label claims.
 */

/** D-02: a row's prices are flagged as possibly moved after this many minutes. */
export const PRICE_STALE_AFTER_MINUTES = 15;

export type OddsCacheSource = "moneyline" | "extended";

export interface PriceAgeContext {
  moneylineEventIds: ReadonlySet<string>;
  moneylineFetchedAt: Date | null;
  extendedFetchedAt: Date | null;
}

export function buildPriceAgeContext(
  moneylineEvents: OddsEvent[],
  moneylineFetchedAt: Date | null,
  extendedFetchedAt: Date | null,
): PriceAgeContext {
  return {
    moneylineEventIds: new Set(moneylineEvents.map((e) => e.id)),
    moneylineFetchedAt,
    extendedFetchedAt,
  };
}

/**
 * Which cache a selection's prices came from. Mirrors enumerateScopeSelections
 * / getPinnedCandidates: a moneyline selection reads the moneyline cache when
 * its event is in it, otherwise the extended cache; spread/total (incl.
 * alternate spreads) always read the extended cache.
 */
export function oddsSourceFor(
  selection: Pick<ResolvedSelection, "eventId" | "marketType">,
  ctx: PriceAgeContext,
): OddsCacheSource {
  return selection.marketType === "moneyline" && ctx.moneylineEventIds.has(selection.eventId) ? "moneyline" : "extended";
}

/** ISO time of the OLDER cache among the selections' sources; null when any is unknown. */
export function pricesAsOfFor(
  selections: Pick<ResolvedSelection, "eventId" | "marketType">[],
  ctx: PriceAgeContext,
): string | null {
  let oldest: Date | null = null;
  for (const selection of selections) {
    const at = oddsSourceFor(selection, ctx) === "moneyline" ? ctx.moneylineFetchedAt : ctx.extendedFetchedAt;
    if (at === null) return null;
    if (oldest === null || at.getTime() < oldest.getTime()) oldest = at;
  }
  return oldest === null ? null : oldest.toISOString();
}

/** True iff the prices are STRICTLY older than the threshold (exactly 15:00.000 is still fresh). */
export function isPriceStale(pricesAsOf: string | null, now: Date): boolean {
  if (pricesAsOf === null) return false;
  return now.getTime() - new Date(pricesAsOf).getTime() > PRICE_STALE_AFTER_MINUTES * 60_000;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "numeric",
  minute: "2-digit",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" });

/** "Prices as of 9:43 AM" (Mountain time); includes the weekday when not the same Denver day as now. */
export function describePriceAge(pricesAsOf: string | null, now: Date): { label: string; stale: boolean } | null {
  if (pricesAsOf === null) return null;
  const asOf = new Date(pricesAsOf);
  const sameDay = DAY_FORMATTER.format(asOf) === DAY_FORMATTER.format(now);
  const time = sameDay ? TIME_FORMATTER.format(asOf) : formatKickoff(pricesAsOf);
  return { label: `Prices as of ${time}`, stale: isPriceStale(pricesAsOf, now) };
}
