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

export type ConversionRateFor = (bookKey: string, amount: Decimal) => ConversionRate | null;

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
  hedgeBookKeys: ReadonlySet<string>;
}): ConversionRateFor {
  const cache = new Map<string, ConversionRate | null>();
  return (bookKey, amount) => {
    const key = `${bookKey}|${amount.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key)!;
    const value = topConversionFor({ ...args, refundBookKey: bookKey, amount });
    cache.set(key, value);
    return value;
  };
}
