/**
 * Prediction-market hedge venues (Phase 12, D-10). Fee coefficients live ONLY
 * here; a pinned test (src/domain/market/fees.test.ts) fails if they change.
 *
 * Sources: Kalshi docs.kalshi.com fee_rounding (taker fee =
 * ceil_to_cent(0.07 x C x P x (1-P))); Polymarket US docs.polymarket.us/fees.md
 * (effective 2026-10-19; theta 0.0695, banker's rounding to the cent).
 * Polymarket changed its fee schedule at least 3 times in 2026, so re-verify
 * before trusting these and update FEES_LAST_VERIFIED when you do.
 */
export type MarketVenueKey = "kalshi" | "polymarket_us";

export interface VenueFeeConfig {
  venueKey: MarketVenueKey;
  model: "kalshi_taker" | "polymarket_us_taker";
  /** Decimal string coefficient. */
  coefficient: string;
  /** Decimal string multiplier (M). */
  multiplier: string;
  rounding: "ceil_cent" | "half_even_cent";
  source: string;
}

export const VENUE_FEES: Readonly<Record<MarketVenueKey, VenueFeeConfig>> = {
  kalshi: {
    venueKey: "kalshi",
    model: "kalshi_taker",
    coefficient: "0.07",
    multiplier: "1",
    rounding: "ceil_cent",
    source: "https://docs.kalshi.com (fee_rounding)",
  },
  polymarket_us: {
    venueKey: "polymarket_us",
    model: "polymarket_us_taker",
    coefficient: "0.0695",
    multiplier: "1",
    rounding: "half_even_cent",
    source: "https://docs.polymarket.us/fees.md",
  },
};

export const FEES_LAST_VERIFIED = "2026-11-02";

export function isMarketVenueKey(key: string): key is MarketVenueKey {
  return key === "kalshi" || key === "polymarket_us";
}
