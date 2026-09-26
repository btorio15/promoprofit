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
 * Tooltip, because the list must be reachable by tap on mobile. The
 * trigger's click is stopped from propagating so tapping the badge does
 * not also toggle the parent row's Collapsible.
 */
export function MultipleBooksPopover({ bookNames }: MultipleBooksPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Badge
            variant="outline"
            className="cursor-pointer"
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
