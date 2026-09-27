"use client";

import { ChevronDown } from "lucide-react";
import type { PromoRowDTO } from "@/domain/promos/dto";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FlagMatchButton } from "./FlagMatchButton";
import { PromoDetails } from "./PromoDetails";

/** WR-07: shown on rows whose promo is at a book the member hasn't saved. */
export const NO_PROMO_BOOK_HINT = "You don't have this book";

interface PromoRowProps {
  row: PromoRowDTO;
  onChanged: () => void;
}

/**
 * Compact promo+hedge row (D-01, D-04, D-11, D-17), copying
 * src/components/finder/ResultRow.tsx's Collapsible six-column grid.
 *
 * The trigger is an empty, full-row overlay button BEHIND the row content
 * rather than a button wrapping it (ArbRow.tsx's pattern, 01.1 review
 * WR-06) -- necessary here because the flag-back icon (D-11 safety net,
 * only on autoMatched rows) is a real interactive <button>, and nesting a
 * button inside CollapsibleTrigger's own <button> is invalid HTML with
 * unpredictable keyboard/click behavior. The content layer is
 * pointer-events-none so taps fall through to the trigger; only the flag
 * button (and the existing Tooltip-wrapped badges) opt back in. onClick on
 * the flag button calls stopPropagation before dispatching flagPromoMatch,
 * belt-and-braces alongside the overlay/content split, so tapping it never
 * also toggles the row.
 */
export function PromoRow({ row, onChanged }: PromoRowProps) {
  // WR-07: a promo at a book the member doesn't have stays visible but uses
  // the same muted styling as UnprofitablePromoRow, with a short hint.
  return (
    <Collapsible
      className={cn(
        "group rounded-lg border border-border",
        row.hasPromoBook ? "bg-secondary" : "bg-secondary/40 opacity-60",
      )}
    >
      <div className="relative">
        <CollapsibleTrigger
          aria-label={
            row.hasPromoBook
              ? `Show stakes for ${row.awayTeam} @ ${row.homeTeam}`
              : `Show stakes for ${row.awayTeam} @ ${row.homeTeam} (${NO_PROMO_BOOK_HINT}: ${row.promo.bookName})`
          }
          className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="pointer-events-none relative grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {row.sportLabel} · {formatKickoff(row.commenceTime)}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">
                {row.awayTeam} @ {row.homeTeam}
              </span>
              <Badge variant="outline">{row.marketBadge}</Badge>
              {row.autoMatched ? (
                <>
                  <Badge variant="outline">Auto-matched</Badge>
                  <FlagMatchButton promoId={row.promoId} onChanged={onChanged} />
                </>
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span>
            {row.claimHint ? <span className="text-sm text-muted-foreground">{row.claimHint}</span> : null}
            {row.finePrintNote ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="pointer-events-auto line-clamp-1 cursor-default text-sm text-muted-foreground">
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
            {row.hasPromoBook ? null : <span className="text-sm text-muted-foreground">{NO_PROMO_BOOK_HINT}</span>}
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
            <span className="flex flex-wrap items-center gap-2">
              {row.hedge.selectionLabel} <span className="num">{formatAmerican(row.hedge.oddsAmerican)}</span>
              {row.sameBook ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge variant="outline" className="pointer-events-auto cursor-default">
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
            <span className="text-sm text-muted-foreground">{row.hedge.bookName}</span>
          </div>

          <span className="num text-xl font-semibold text-primary md:text-right">
            {formatUsd(row.guaranteedProfit)}
          </span>

          <span className="flex flex-col md:items-end">
            <span className="num text-base">{formatPct(row.ratePct)}</span>
            <span className="text-sm text-muted-foreground">{row.rateLabel}</span>
          </span>

          <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180" />
        </div>
      </div>
      <CollapsibleContent>
        <PromoDetails row={row} />
      </CollapsibleContent>
    </Collapsible>
  );
}
