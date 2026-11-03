"use client";

import { ChevronDown, TriangleAlert } from "lucide-react";
import type { NoSweatRowDTO } from "@/domain/promos/noSweatRowDto";
import { noSweatAriaLabel } from "@/domain/promos/noSweatRowDto";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NoSweatDetails } from "./NoSweatDetails";
import { TrackButton } from "./TrackButton";
import {
  NO_SWEAT_EST_TOOLTIP,
  estimateSecondaryLine,
  hiddenLinesNote,
  warningCopy,
} from "./noSweatRowView";

interface NoSweatRowProps {
  dto: NoSweatRowDTO;
  precision: "whole" | "cents";
  onChanged: () => void;
  addedActions?: {
    onError: (message: string) => void;
    onEdit?: (promoId: number, trigger: HTMLElement | null) => void;
  };
}

/**
 * Phase 9 (FEED-03): collapsible no-sweat row. Same shell and grid as
 * PromoRow (full-card trigger overlay behind pointer-events-none content).
 * The headline figure is an ESTIMATE: text-foreground (never the green
 * accent), an "est." badge, and an "Est. ROI" caption (D-08, D-09).
 */
export function NoSweatRow({ dto, precision, onChanged, addedActions }: NoSweatRowProps) {
  const hidden = hiddenLinesNote(dto.filteredOut);
  return (
    <Collapsible className="group rounded-lg border border-border bg-secondary">
      <div className="relative">
        <CollapsibleTrigger
          aria-label={`Show stakes for ${dto.awayTeam} @ ${dto.homeTeam}. ${noSweatAriaLabel(dto)} This is an estimate.`}
          className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="pointer-events-none relative grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {dto.sportLabel} · {formatKickoff(dto.commenceTime)}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-base">
              <Badge variant="outline">No-sweat</Badge>
              <span className="truncate">{dto.title}</span>
              {dto.addedByYou ? <Badge variant="outline">Added by you</Badge> : null}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">
                {dto.awayTeam} @ {dto.homeTeam}
              </span>
              <Badge variant="outline">{dto.marketBadge}</Badge>
            </span>
            {dto.scopeLabel ? <span className="text-sm text-muted-foreground">Promo: {dto.scopeLabel}</span> : null}
            {dto.warnings.map((w) => (
              <span key={w} className="flex items-start gap-1 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {warningCopy(w)}
              </span>
            ))}
            {hidden ? <span className="text-sm text-muted-foreground">{hidden}</span> : null}
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Qualifying bet</span>
            <span className="flex flex-wrap items-center gap-2">
              {dto.qualifying.selectionLabel}{" "}
              <span className="num">{formatAmerican(dto.qualifying.oddsAmerican)}</span>
            </span>
            <span className="text-sm text-muted-foreground">{dto.qualifying.bookName}</span>
            <span className="num text-sm text-muted-foreground">Stake {formatUsd(dto.qualifying.stake)}</span>
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
            <span className="flex flex-wrap items-center gap-2">
              {dto.hedge.selectionLabel} <span className="num">{formatAmerican(dto.hedge.oddsAmerican)}</span>
            </span>
            <span className="text-sm text-muted-foreground">{dto.hedge.bookName}</span>
            <span className="num text-sm text-muted-foreground">Stake {formatUsd(dto.hedge.stake)}</span>
          </div>

          <span className="flex flex-col md:items-end">
            <span className="flex items-center gap-2">
              <span className="num text-xl font-semibold text-foreground">
                {dto.estimatedProfit.startsWith("-") ? "" : "+"}
                {formatUsd(dto.estimatedProfit)}
              </span>
              <Tooltip>
                <TooltipTrigger render={<Badge variant="outline" className="pointer-events-auto cursor-default" />}>
                  est.
                </TooltipTrigger>
                <TooltipContent>{NO_SWEAT_EST_TOOLTIP}</TooltipContent>
              </Tooltip>
            </span>
            <span className="text-sm text-muted-foreground md:text-right">{estimateSecondaryLine(dto)}</span>
          </span>

          <span className="flex flex-col md:items-end">
            <span className="num text-base">{formatPct(dto.estRoiPct)}</span>
            <span className="text-sm text-muted-foreground">{dto.pctLabel}</span>
          </span>

          <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180" />
        </div>
        <div className="relative px-4 pb-4">
          <TrackButton
            promoId={dto.promoId}
            precision={precision}
            expectedEstimate={dto.estimatedProfit}
            onChanged={onChanged}
          />
        </div>
      </div>
      <CollapsibleContent>
        <NoSweatDetails dto={dto} precision={precision} onChanged={onChanged} addedActions={addedActions} />
      </CollapsibleContent>
    </Collapsible>
  );
}
