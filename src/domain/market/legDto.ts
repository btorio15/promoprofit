import { z } from "zod";
import { americanFromPriceCents } from "@/domain/market/marketLeg";
import type { MarketFill } from "@/domain/market/marketLeg";
import { settlementNoteFor } from "@/domain/market/settlement";
import { formatAmerican } from "@/lib/format";

export const MarketLegDTOSchema = z.object({
  venueKey: z.enum(["kalshi", "polymarket_us"]),
  venueName: z.string(),
  side: z.enum(["yes", "no"]),
  contracts: z.number().int().positive(),
  priceCents: z.number().int().min(1).max(99),
  cost: z.string(),
  fee: z.string(),
  outlay: z.string(),
  americanDisplay: z.number().int(),
  liquidity: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("price_may_move") }),
    z.object({
      kind: z.literal("thin"),
      available: z.number().int().nonnegative(),
      needed: z.number().int().positive(),
    }),
  ]),
  settlementNote: z.string(),
});

export type MarketLegDTO = z.infer<typeof MarketLegDTOSchema>;

export function toMarketLegDTO(
  fill: MarketFill,
  opts: { sportKey: string; venueName: string },
): MarketLegDTO {
  const thin = fill.availableContracts !== null && fill.availableContracts < fill.contracts;
  return {
    venueKey: fill.venueKey,
    venueName: opts.venueName,
    side: fill.side,
    contracts: fill.contracts,
    priceCents: fill.priceCents,
    cost: fill.cost.toFixed(2),
    fee: fill.fee.toFixed(2),
    outlay: fill.outlay.toFixed(2),
    americanDisplay: americanFromPriceCents(fill.priceCents),
    liquidity:
      thin && fill.availableContracts !== null
        ? { kind: "thin", available: fill.availableContracts, needed: fill.contracts }
        : { kind: "price_may_move" },
    settlementNote: settlementNoteFor(opts.sportKey, fill.venueKey),
  };
}

/** D-12: "buy 42 YES @ 61¢ ($25.62 + $0.70 fee) ≈ −156" */
export function marketLegText(leg: MarketLegDTO): string {
  return `buy ${leg.contracts} ${leg.side.toUpperCase()} @ ${leg.priceCents}¢ ($${leg.cost} + $${leg.fee} fee) ≈ ${formatAmerican(leg.americanDisplay)}`;
}

export function tieRiskTooltipText(hasMarketLeg: boolean): string {
  return hasMarketLeg
    ? "Regular-season NFL games can end in a tie (<1% historically). With a prediction-market hedge a tie does not void both legs; see Settlement differs."
    : "Regular-season NFL games can end in a tie (<1% historically). A tie voids both legs: profit becomes $0, no cash loss.";
}
