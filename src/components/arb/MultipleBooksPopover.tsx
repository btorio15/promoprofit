"use client";

import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MultipleBooksPopoverProps {
  bookNames: string[];
}

/**
 * "Multiple books" badge + tap-friendly popover (D-07): shown next to a
 * side whose best price is exactly tied at other books. Uses Popover, not
 * Tooltip, because the list must be reachable by tap on mobile. ArbRow
 * renders it outside the row's trigger button (WR-06); it opts back into
 * pointer events over the row's pointer-events-none content layer, and its
 * click is still stopped from propagating as a belt-and-braces guard so
 * tapping the badge never toggles the parent row.
 */
export function MultipleBooksPopover({ bookNames }: MultipleBooksPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Badge
            variant="outline"
            className="pointer-events-auto cursor-pointer"
            onClick={(event: MouseEvent) => event.stopPropagation()}
          >
            Multiple books
          </Badge>
        }
      />
      <PopoverContent className="w-auto">
        <span className="text-sm">Also at: {bookNames.join(", ")}</span>
      </PopoverContent>
    </Popover>
  );
}
