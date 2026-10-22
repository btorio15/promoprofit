/**
 * Conversion rate for valuing a no-sweat refund bonus bet (NSB-02).
 *
 * Values a refund bonus bet at the bonus-bet finder's top-1 conversion for the
 * refund book right now (D-01; the owner knows this runs slightly optimistic,
 * the worst case is the honesty check). Only the member's books are used as
 * hedge books (D-03), but the refund book's own quotes are always kept.
 * Cached events are passed in by the caller (load them with getCachedEvents()),
 * so this spends 0 Odds API credits; this module must never import from
 * src/ingestion/odds or the-odds-api client. A null result means "can't
 * price": there is no fallback rate (D-04).
 */
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { extractTwoWayMoneylines } from "./marketFilter";
import { rankBonusBetHedges } from "./rankBonusBetHedges";
import { SPORT_KEYS } from "@/config/sports";

/** Must stay equal to WINDOW_DAYS in src/app/actions/find-hedges.ts. */
export const CONVERSION_WINDOW_DAYS = 7;

export interface ConversionRate {
  refundBookKey: string;
  amount: Decimal;
  /** Cent-exact dollar value of the refund (top.result.guaranteedProfit). */
  profit: Decimal;
  /** profit / amount, unrounded, for display math. */
  rate: Decimal;
  /** Finder's truncated conversion percent, for display. */
  pct: Decimal;
  eventId: string;
  hedgeBookKey: string;
}

/**
 * Values a refund of `amount` at `bookKey`, hedging only at `hedgeBookKeys`.
 * The hedge books are an argument (not fixed when the function is built) so
 * the caller passes the same set it hedges the qualifying bet with: the refund
 * can never be valued at books the member can't use (D-03).
 */
export type ConversionRateFor = (
  bookKey: string,
  amount: Decimal,
  hedgeBookKeys: ReadonlySet<string>,
) => ConversionRate | null;

export function topConversionFor(args: {
  events: OddsEvent[];
  now: Date;
  refundBookKey: string;
  amount: Decimal;
  hedgeBookKeys: ReadonlySet<string>;
}): ConversionRate | null {
  const { events, now, refundBookKey, amount, hedgeBookKeys } = args;
  const allowed = new Set([...hedgeBookKeys, refundBookKey]);
  const markets = extractTwoWayMoneylines(events, {
    now,
    windowDays: CONVERSION_WINDOW_DAYS,
    allowedBookKeys: allowed,
    sportKeys: new Set(SPORT_KEYS),
  });
  const top = rankBonusBetHedges(markets, {
    bonusBookKey: refundBookKey,
    bonusAmount: amount,
    hedgeBookKeys,
    limit: 1,
  })[0];
  if (!top) return null;
  const profit = top.result.guaranteedProfit;
  return {
    refundBookKey,
    amount,
    profit,
    rate: profit.dividedBy(amount),
    pct: top.result.conversionPct,
    eventId: top.eventId,
    hedgeBookKey: top.hedge.bookKey,
  };
}

export function makeConversionRateFor(args: {
  events: OddsEvent[];
  now: Date;
}): ConversionRateFor {
  const cache = new Map<string, ConversionRate | null>();
  return (bookKey, amount, hedgeBookKeys) => {
    // Reject before the cache: toFixed(2) below would otherwise round
    // 25.004 onto 25.00's entry and return a result for a different amount.
    if (amount.lte(0) || amount.decimalPlaces() > 2) {
      throw new RangeError(
        `amount must be greater than 0 with at most 2 decimal places, got ${amount.toString()}`,
      );
    }
    const hedgeKey = [...hedgeBookKeys].sort().join(",");
    const key = `${bookKey}|${amount.toFixed(2)}|${hedgeKey}`;
    if (cache.has(key)) return cache.get(key)!;
    const value = topConversionFor({
      ...args,
      refundBookKey: bookKey,
      amount,
      hedgeBookKeys,
    });
    cache.set(key, value);
    return value;
  };
}
