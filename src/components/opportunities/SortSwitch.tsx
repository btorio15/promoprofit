"use client";

import type { SortKey } from "@/domain/opportunities/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface SortSwitchProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
}

/** D-13: Profit ($) / ROI % single-select switch; 44px touch targets. */
export function SortSwitch({ value, onChange }: SortSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Sort by</span>
      <ToggleGroup
        aria-label="Sort by"
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          // Ignore deselect: one option is always active.
          if (next === "profit" || next === "roi") onChange(next);
        }}
      >
        <ToggleGroupItem value="profit" className="min-h-11 min-w-11 px-4 text-sm">
          Profit ($)
        </ToggleGroupItem>
        <ToggleGroupItem value="roi" className="min-h-11 min-w-11 px-4 text-sm">
          ROI %
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
