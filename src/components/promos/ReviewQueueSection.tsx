"use client";

import type { CorrectionOptions, QueueItemDTO } from "@/domain/promos/dto";
import { ClassifyQueueCard } from "./ClassifyQueueCard";
import { QueueItemCard } from "./QueueItemCard";

interface ReviewQueueSectionProps {
  queue: QueueItemDTO[];
  /** Correct/classify sub-panel dropdown data (Plan 09, T-03-09-06; quick-260928-it1); forwarded to every card. */
  correctionOptions: CorrectionOptions;
  onChanged: () => void;
}

/**
 * "Needs review (N)" section (D-13) -- rendered ONLY when the queue is
 * non-empty; the section (heading included) is entirely absent otherwise,
 * the same "don't show an empty container" instinct the rest of the app
 * follows (03-UI-SPEC.md). Rendered on the Promos tab directly after the
 * scrape-status panel and before RiskAdvisory/the active-promos rows.
 * quick-260928-it1: renders ClassifyQueueCard for kind "classify" (an
 * uncertain entry the scraper couldn't even identify), QueueItemCard for
 * every other kind (match/caps).
 */
export function ReviewQueueSection({ queue, correctionOptions, onChanged }: ReviewQueueSectionProps) {
  if (queue.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          Needs review (<span className="num">{queue.length}</span>)
        </h2>
        <p className="text-sm text-muted-foreground">
          Scraped promos we couldn&apos;t fully read or match. Classify, confirm, correct, or dismiss each one before
          it&apos;s used in hedge math.
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {queue.map((item) =>
          item.kind === "classify" ? (
            <ClassifyQueueCard key={item.promoId} item={item} correctionOptions={correctionOptions} onChanged={onChanged} />
          ) : (
            <QueueItemCard
              key={item.promoId}
              item={item}
              correctionOptions={correctionOptions}
              onChanged={onChanged}
            />
          ),
        )}
      </div>
    </section>
  );
}
