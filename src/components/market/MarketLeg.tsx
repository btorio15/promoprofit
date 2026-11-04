"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { marketLegText } from "@/domain/market/legDto";
import type { MarketLegDTO } from "@/domain/market/legDto";

/** D-12 leg string plus the D-13 "price may move" note (UI-SPEC Component Contract 1-3). */
export function MarketLegLine({ leg }: { leg: MarketLegDTO }) {
  return (
    <span className="flex flex-col">
      <span className="num text-sm">{marketLegText(leg)}</span>
      {leg.liquidity.kind === "price_may_move" ? (
        <p className="text-xs text-muted-foreground">
          Price may move. Check the order book before buying.
        </p>
      ) : null}
    </span>
  );
}

/** Always-on "Settlement differs" badge (D-08) and conditional thin-market badge (D-13). */
export function MarketLegBadges({ leg }: { leg: MarketLegDTO }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className="cursor-default">
              Settlement differs
            </Badge>
          }
        />
        <TooltipContent>{leg.settlementNote}</TooltipContent>
      </Tooltip>
      {leg.liquidity.kind === "thin" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge variant="outline" className="cursor-default">
                {`Thin market: only ${leg.liquidity.available} contracts at ${leg.priceCents}¢`}
              </Badge>
            }
          />
          <TooltipContent>
            {`You need ${leg.liquidity.needed} contracts. Buying more will cost more than the price shown.`}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
