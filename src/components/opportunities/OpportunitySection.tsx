import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface OpportunitySectionProps {
  title: string;
  caption: string;
  seeAll: { label: string; onClick: () => void } | null;
  emptyCopy: string;
  isEmpty: boolean;
  children: ReactNode;
}

/** One source section on the Opportunities screen: title, sort caption, optional See all, rows or a compact empty block. */
export function OpportunitySection({ title, caption, seeAll, emptyCopy, isEmpty, children }: OpportunitySectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
        {seeAll ? (
          <Button type="button" variant="link" className="min-h-11" onClick={seeAll.onClick}>
            {seeAll.label}
          </Button>
        ) : null}
      </div>
      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">{emptyCopy}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
