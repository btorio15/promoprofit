"use client";

import type { CorrectionOptions, QueueItemDTO, ScrapeStatusLineDTO } from "@/domain/promos/dto";
import { ScrapeStatusPanel } from "./ScrapeStatusPanel";
import { ReviewQueueSection } from "./ReviewQueueSection";

export interface ReviewPanelProps {
  scrapeStatus: ScrapeStatusLineDTO[];
  queue: QueueItemDTO[];
  correctionOptions: CorrectionOptions;
  onChanged: () => void;
}

/** Review sub-tab of Promos (D-06): scrape freshness, then the review queue, with its own empty state. */
export function ReviewPanel({ scrapeStatus, queue, correctionOptions, onChanged }: ReviewPanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Scraped promos we couldn&apos;t confidently match, and when each sportsbook was last checked.
      </p>
      <ScrapeStatusPanel scrapeStatus={scrapeStatus} />
      <ReviewQueueSection queue={queue} correctionOptions={correctionOptions} onChanged={onChanged} />
      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            Nothing to review. New scraped promos that need a human look will show up here.
          </p>
        </div>
      ) : null}
    </div>
  );
}
