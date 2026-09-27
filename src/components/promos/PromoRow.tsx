"use client";

import { ChevronDown } from "lucide-react";
import type { PromoRowDTO } from "@/domain/promos/dto";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PromoDetails } from "./PromoDetails";

interface PromoRowProps {
  row: PromoRowDTO;
}

/**
 * Compact promo+hedge row (D-01, D-04, D-11, D-17), copying
 * src/components/finder/ResultRow.tsx's Collapsible six-column grid
 * verbatim. The whole row is the expand trigger (min 44px mobile tap
 * target). Col 1 names the game the app picked and its promo scope; Col 2/3
 * are the promo and hedge legs; Col 4/5 are guaranteed profit and
 * ROI/Conversion; Col 6 is the chevron.
 */
export function PromoRow({ row }: PromoRowProps) {
  return (
    <Collapsible className="rounded-lg border border-border bg-secondary">
      <CollapsibleTrigger className="group grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {row.sportLabel} · {formatKickoff(row.commenceTime)}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-base">
            <span className="truncate">
              {row.awayTeam} @ {row.homeTeam}
            </span>
            <Badge variant="outline">{row.marketBadge}</Badge>
            {row.autoMatched ? <Badge variant="outline">Auto-matched</Badge> : null}
          </span>
          <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span>
          {row.claimHint ? <span className="text-sm text-muted-foreground">{row.claimHint}</span> : null}
          {row.finePrintNote ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="line-clamp-1 cursor-default text-sm text-muted-foreground">
                    {row.finePrintNote}
                  </span>
                }
              />
              <TooltipContent>{row.finePrintNote}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Promo</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{row.promoTypeLabel}</Badge>
            {row.promo.selectionLabel} <span className="num">{formatAmerican(row.promo.oddsAmerican)}</span>
          </span>
          <span className="text-sm text-muted-foreground">{row.promo.bookName}</span>
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
          <span className="flex flex-wrap items-center gap-2">
            {row.hedge.selectionLabel} <span className="num">{formatAmerican(row.hedge.oddsAmerican)}</span>
            {row.sameBook ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge variant="outline" className="cursor-default">
                      Same book
                    </Badge>
                  }
                />
                <TooltipContent>Both legs are at the same sportsbook.</TooltipContent>
              </Tooltip>
            ) : null}
            {row.tieRisk ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge variant="outline" className="cursor-default">
                      Tie risk
                    </Badge>
                  }
                />
                <TooltipContent>
                  Regular-season NFL games can end in a tie (&lt;1% historically). A tie voids
                  both legs: profit becomes $0, no cash loss.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </span>
          <span className="text-sm text-muted-foreground">{row.hedge.bookName}</span>
        </div>

        <span className="num text-xl font-semibold text-primary md:text-right">
          {formatUsd(row.guaranteedProfit)}
        </span>

        <span className="flex flex-col md:items-end">
          <span className="num text-base">{formatPct(row.ratePct)}</span>
          <span className="text-sm text-muted-foreground">{row.rateLabel}</span>
        </span>

        <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <PromoDetails row={row} />
      </CollapsibleContent>
    </Collapsible>
  );
}
