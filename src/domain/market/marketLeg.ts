import Decimal from "decimal.js";
import { isMarketVenueKey, type MarketVenueKey } from "@/config/venues";
import { marketFee } from "./fees";

const LocalDecimal = Decimal.clone({ precision: 40 });

export type ContractSide = "yes" | "no";

export interface MarketLeg {
  venueKey: MarketVenueKey;
  side: ContractSide;
  priceCents: number;
  availableContracts: number | null;
}

export interface MarketQuoteLike {
  bookKey: string;
  oddsAmerican: number;
  askSize?: number | null;
  contractSide?: ContractSide | null;
}

/** American quote -> whole-cent contract price (1..99), or null if invalid. */
export function priceCentsFromAmerican(american: number): number | null {
  if (!Number.isInteger(american) || Math.abs(american) < 100) return null;
  const a = new LocalDecimal(american);
  const implied = a.isNegative()
    ? a.abs().dividedBy(a.abs().plus(100))
    : new LocalDecimal(100).dividedBy(a.plus(100));
  const cents = parseInt(
    implied.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0),
    10,
  );
  return cents >= 1 && cents <= 99 ? cents : null;
}

/** Display-only American price for a whole-cent contract price. */
export function americanFromPriceCents(priceCents: number): number {
  if (!Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99) {
    throw new RangeError(`priceCents must be an integer in 1..99, got ${priceCents}`);
  }
  const c = new LocalDecimal(priceCents);
  const value =
    priceCents >= 50
      ? new LocalDecimal(100).times(c).dividedBy(new LocalDecimal(100).minus(c)).negated()
      : new LocalDecimal(100).times(new LocalDecimal(100).minus(c)).dividedBy(c);
  return parseInt(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0), 10);
}

export function toMarketLeg(quote: MarketQuoteLike): MarketLeg | null {
  if (!isMarketVenueKey(quote.bookKey)) return null;
  const priceCents = priceCentsFromAmerican(quote.oddsAmerican);
  if (priceCents === null) return null;
  const size = quote.askSize;
  const availableContracts =
    typeof size === "number" && Number.isInteger(size) && size >= 0 ? size : null;
  return {
    venueKey: quote.bookKey,
    side: quote.contractSide ?? "yes",
    priceCents,
    availableContracts,
  };
}

export function marketCost(
  leg: MarketLeg,
  contracts: number,
): { cost: Decimal; fee: Decimal; outlay: Decimal } {
  const fee = marketFee(leg.venueKey, contracts, leg.priceCents);
  const cost = new LocalDecimal(contracts).times(leg.priceCents).dividedBy(100);
  return { cost, fee, outlay: cost.plus(fee) };
}

export interface MarketFill {
  venueKey: MarketVenueKey;
  side: ContractSide;
  priceCents: number;
  contracts: number;
  cost: Decimal;
  fee: Decimal;
  outlay: Decimal;
  availableContracts: number | null;
}

export function toMarketFill(leg: MarketLeg, contracts: number): MarketFill {
  return {
    venueKey: leg.venueKey,
    side: leg.side,
    priceCents: leg.priceCents,
    contracts,
    ...marketCost(leg, contracts),
    availableContracts: leg.availableContracts,
  };
}
