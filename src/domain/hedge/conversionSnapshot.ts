/**
 * Pure row builder for the bonus-bet conversion rate history (quick-261103-mok).
 *
 * Hedge books are group-level -- every usable Colorado book -- not any one
 * member's books, so the recorded rate is identical whichever member later
 * reads it (same rule as recordCurrentProfitSnapshots). Reads cached events
 * only: 0 Odds API credits. Changes no valuation or ranking behaviour; it
 * calls the same rankRefundOpportunities that topConversionFor uses.
 */
import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { denverDate } from "@/domain/promos/profitTotals";
import { denverHour } from "@/domain/stats/profitStats";
import { rankRefundOpportunities } from "./conversionRate";

/**
 * A single fixed reference amount so rates from different runs and books are
 * directly comparable. Conversion pct is near-linear in amount; Phase 10
 * scales the rate to the real refund amount.
 */
export const CONVERSION_REFERENCE_AMOUNT = new Decimal("100.00");

/** How many of the best markets feed the recorded median. */
export const CONVERSION_SNAPSHOT_TOP_N = 5;

export interface ConversionSnapshotRow {
  bookKey: string;
  capturedAt: Date;
  denverDate: string;
  denverHour: number;
  referenceAmount: string;
  candidateCount: number;
  topNCount: number;
  topProfit: string | null;
  topPct: string | null;
  medianTopPct: string | null;
  topEventId: string | null;
  topSportKey: string | null;
  topHedgeBookKey: string | null;
}

function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return sorted[mid - 1].plus(sorted[mid]).dividedBy(2);
}

export function buildConversionSnapshotRows(args: {
  events: OddsEvent[];
  now: Date;
  bookKeys: readonly string[];
}): ConversionSnapshotRow[] {
  const { events, now, bookKeys } = args;
  const hedgeBookKeys = new Set(bookKeys);
  const date = denverDate(now);
  const hour = denverHour(now);

  return bookKeys.map((bookKey) => {
    const ranked = rankRefundOpportunities({
      events,
      now,
      refundBookKey: bookKey,
      amount: CONVERSION_REFERENCE_AMOUNT,
      hedgeBookKeys,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const top = ranked[0];
    const topN = ranked.slice(0, CONVERSION_SNAPSHOT_TOP_N);
    return {
      bookKey,
      capturedAt: now,
      denverDate: date,
      denverHour: hour,
      referenceAmount: CONVERSION_REFERENCE_AMOUNT.toFixed(2),
      candidateCount: ranked.length,
      topNCount: topN.length,
      topProfit: top ? top.result.guaranteedProfit.toFixed(2) : null,
      topPct: top ? top.result.conversionPct.toFixed(2) : null,
      medianTopPct:
        topN.length > 0
          ? median(topN.map((o) => o.result.conversionPct)).toDecimalPlaces(3).toString()
          : null,
      topEventId: top ? top.eventId : null,
      topSportKey: top ? top.sportKey : null,
      topHedgeBookKey: top ? top.hedge.bookKey : null,
    };
  });
}
