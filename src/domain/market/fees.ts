import Decimal from "decimal.js";
import {
  VENUE_FEES,
  type MarketVenueKey,
  type VenueFeeConfig,
} from "@/config/venues";

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

// Snap to 20 dp to erase representation noise far below a cent.
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}

function validate(contracts: number, priceCents: number): void {
  if (!Number.isInteger(contracts) || contracts < 0) {
    throw new RangeError(`contracts must be a non-negative integer, got ${contracts}`);
  }
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99) {
    throw new RangeError(`priceCents must be an integer in 1..99, got ${priceCents}`);
  }
}

/** Unrounded dollars: coefficient x multiplier x C x p x (1 - p). */
function rawFee(contracts: number, priceCents: number, cfg: VenueFeeConfig): Decimal {
  const p = new LocalDecimal(priceCents).dividedBy(100);
  return clean(
    new LocalDecimal(cfg.coefficient)
      .times(cfg.multiplier)
      .times(contracts)
      .times(p)
      .times(new LocalDecimal(1).minus(p)),
  );
}

/** Kalshi taker fee at the ask, rounded UP to the cent. */
export function kalshiTakerFee(
  contracts: number,
  priceCents: number,
  cfg: VenueFeeConfig = VENUE_FEES.kalshi,
): Decimal {
  validate(contracts, priceCents);
  return rawFee(contracts, priceCents, cfg).toDecimalPlaces(2, Decimal.ROUND_UP);
}

/** Polymarket US taker fee at the ask, banker's rounding to the cent. */
export function polymarketUsTakerFee(
  contracts: number,
  priceCents: number,
  cfg: VenueFeeConfig = VENUE_FEES.polymarket_us,
): Decimal {
  validate(contracts, priceCents);
  return rawFee(contracts, priceCents, cfg).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export function marketFee(
  venueKey: MarketVenueKey,
  contracts: number,
  priceCents: number,
): Decimal {
  const cfg = VENUE_FEES[venueKey];
  switch (cfg.model) {
    case "kalshi_taker":
      return kalshiTakerFee(contracts, priceCents, cfg);
    case "polymarket_us_taker":
      return polymarketUsTakerFee(contracts, priceCents, cfg);
    default: {
      const _exhaustive: never = cfg.model;
      throw new Error(`unknown fee model ${String(_exhaustive)}`);
    }
  }
}
