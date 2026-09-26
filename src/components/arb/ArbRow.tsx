"use client";

import { ChevronDown } from "lucide-react";
import type { ArbResultDTO } from "@/domain/arb/types";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MultipleBooksPopover } from "./MultipleBooksPopover";
import { ArbDetails } from "./ArbDetails";

interface ArbRowProps {
  result: ArbResultDTO;
}

/**
 * Compact arb row (D-10, D-15) wrapped in a Collapsible: the whole row is
 * the expand trigger (min 44px tap target on mobile). The trigger is an
 * empty, full-row overlay button BEHIND the row content rather than a button
 * wrapping it, so the interactive "Tie risk" tooltip and "Multiple books"
 * popover badges are never nested inside a <button> (invalid HTML, poor
 * screen-reader output, keyboard activation leaking into the row toggle --
 * 01.1 review WR-06). The content layer is pointer-events-none so taps fall
 * through to the trigger; only the badges opt back in. Both legs are cash
 * (no bonus/hedge distinction), so the finder's same-sportsbook badge is
 * omitted entirely here (D-06 makes that case impossible) and the market
 * badge sits inline in the Game cell instead.
 */
export function ArbRow({ result }: ArbRowProps) {
  return (
    <Collapsible className="group rounded-lg border border-border bg-secondary">
      <div className="relative">
        <CollapsibleTrigger
          aria-label={`Show stakes for ${result.awayTeam} @ ${result.homeTeam}`}
          className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="pointer-events-none relative grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base">
              {result.awayTeam} @ {result.homeTeam}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {result.sportLabel} · {formatKickoff(result.commenceTime)} ·{" "}
              <Badge variant="outline">{result.marketBadge}</Badge>
              {result.tieRisk ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge variant="outline" className="pointer-events-auto cursor-default">
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
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Side A</span>
            <span className="flex flex-wrap items-center gap-2">
              {result.sideA.selection}{" "}
              <span className="num">{formatAmerican(result.sideA.oddsAmerican)}</span>
              {result.sideA.tiedBookNames.length > 0 ? (
                <MultipleBooksPopover bookNames={result.sideA.tiedBookNames} />
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">{result.sideA.bookName}</span>
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Side B</span>
            <span className="flex flex-wrap items-center gap-2">
              {result.sideB.selection}{" "}
              <span className="num">{formatAmerican(result.sideB.oddsAmerican)}</span>
              {result.sideB.tiedBookNames.length > 0 ? (
                <MultipleBooksPopover bookNames={result.sideB.tiedBookNames} />
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">{result.sideB.bookName}</span>
          </div>

          <span className="num text-xl font-semibold text-primary md:text-right">
            {formatUsd(result.guaranteedProfit)}
          </span>

          <span className="flex flex-col md:items-end">
            <span className="num text-base">{formatPct(result.returnPct)}</span>
            <span className="text-sm text-muted-foreground">return</span>
          </span>

          <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180" />
        </div>
      </div>
      <CollapsibleContent>
        <ArbDetails result={result} />
      </CollapsibleContent>
    </Collapsible>
  );
}
