"use client";

import { TriangleAlert } from "lucide-react";
import type { ScrapeStatusLineDTO } from "@/domain/promos/dto";
import { describeScrapeStatus } from "./scrapeAge";

interface ScrapeStatusPanelProps {
  scrapeStatus: ScrapeStatusLineDTO[];
}

/**
 * Always-visible per-book scrape freshness block (D-08). Not sticky, not
 * collapsible -- per-book freshness is exactly the kind of "is this
 * trustworthy right now" context the app already surfaces unconditionally
 * (odds age, credit meter). Mirrors src/components/finder/OddsStatusBar.tsx's
 * warning-line treatment (TriangleAlert + text-warning), minus its
 * refresh-button/credit-meter machinery -- scrape status is read-only.
 * Never destructive red: a failed run doesn't wipe existing promos (D-08).
 */
export function ScrapeStatusPanel({ scrapeStatus }: ScrapeStatusPanelProps) {
  const now = new Date();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-4">
      {scrapeStatus.map((line) => {
        const { label, warning } = describeScrapeStatus(line, now);
        return warning ? (
          <p key={line.bookKey} className="inline-flex items-center gap-1.5 text-sm text-warning">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {label}
          </p>
        ) : (
          <p key={line.bookKey} className="text-sm text-muted-foreground">
            {label}
          </p>
        );
      })}
    </div>
  );
}
