"use client";

import type { MouseEvent } from "react";
import { Info } from "lucide-react";
import type { LowProfileWarning } from "@/domain/promos/lowProfile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NO_SWEAT_EST_TOOLTIP,
  NO_SWEAT_RISK_COPY,
  TRACK_HELPER_COPY,
  hiddenLinesNote,
  warningCopy,
} from "./noSweatRowView";

interface NoSweatNoticesPopoverProps {
  warnings: LowProfileWarning[];
  filteredOut: number;
}

/**
 * One (i) popover holding every no-sweat notice. Opts back into pointer events
 * over the row's pointer-events-none content layer and stops propagation so
 * tapping it never toggles the row's Collapsible.
 */
export function NoSweatNoticesPopover({ warnings, filteredOut }: NoSweatNoticesPopoverProps) {
  const hidden = hiddenLinesNote(filteredOut);
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About this estimate"
        className="pointer-events-auto -m-2 cursor-pointer rounded-full p-2 text-muted-foreground"
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        <Info className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2 text-sm" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <span>{NO_SWEAT_EST_TOOLTIP}</span>
        {warnings.map((w) => (
          <span key={w} className="text-warning">
            {warningCopy(w)}
          </span>
        ))}
        <span>{NO_SWEAT_RISK_COPY}</span>
        {hidden ? <span className="text-muted-foreground">{hidden}</span> : null}
        <span className="text-muted-foreground">{TRACK_HELPER_COPY}</span>
      </PopoverContent>
    </Popover>
  );
}
