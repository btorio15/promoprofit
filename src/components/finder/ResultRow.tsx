"use client";

import { ChevronDown } from "lucide-react";
import type { FinderResultDTO } from "@/domain/finder/types";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResultDetails } from "./ResultDetails";

interface ResultRowProps {
  result: FinderResultDTO;
}

/**
 * Compact result row (D-07) wrapped in a Collapsible: the whole row is the
 * expand trigger (min 44px tap target on mobile). Multiple rows may be
 * open at once — each row owns its own Collapsible instance.
 */
export function ResultRow({ result }: ResultRowProps) {
  return (
    <Collapsible className="rounded-lg border border-border bg-secondary">
      <CollapsibleTrigger className="group grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base">
            {result.awayTeam} @ {result.homeTeam}
          </span>
          <span className="text-sm text-muted-foreground">
            {result.sportLabel} · {formatKickoff(result.commenceTime)}
          </span>
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Bonus</span>
          <span className="flex flex-wrap items-center gap-2">
            {result.bonus.team} <span className="num">{formatAmerican(result.bonus.oddsAmerican)}</span>
          </span>
          <span className="text-sm text-muted-foreground">{result.bonus.bookName}</span>
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
          <span className="flex flex-wrap items-center gap-2">
            {result.hedge.team} <span className="num">{formatAmerican(result.hedge.oddsAmerican)}</span>
            {result.sameBook ? (
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
            {result.tieRisk ? (
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
          <span className="text-sm text-muted-foreground">{result.hedge.bookName}</span>
        </div>

        <span className="num text-xl font-semibold text-primary md:text-right">
          {formatUsd(result.guaranteedProfit)}
        </span>

        <span className="flex flex-col md:items-end">
          <span className="num text-base">{formatPct(result.conversionPct)}</span>
          <span className="text-sm text-muted-foreground">Conversion</span>
        </span>

        <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ResultDetails result={result} />
      </CollapsibleContent>
    </Collapsible>
  );
}
