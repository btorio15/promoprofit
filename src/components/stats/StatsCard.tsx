"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * A Statistics section that opens and closes from its title row, so the
 * screen stays short until you open the part you want.
 */
export function StatsCard({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border border-border bg-secondary">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{title}</span>
          {description ? <span className="text-sm text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
