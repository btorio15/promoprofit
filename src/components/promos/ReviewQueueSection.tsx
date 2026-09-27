"use client";

import type { QueueItemDTO } from "@/domain/promos/dto";
import { QueueItemCard } from "./QueueItemCard";

interface ReviewQueueSectionProps {
  queue: QueueItemDTO[];
  onChanged: () => void;
}

/**
 * "Needs review (N)" section (D-13) -- rendered ONLY when the queue is
 * non-empty; the section (heading included) is entirely absent otherwise,
 * the same "don't show an empty container" instinct the rest of the app
 * follows (03-UI-SPEC.md). Rendered on the Promos tab directly after the
 * scrape-status panel and before RiskAdvisory/the active-promos rows.
 */
export function ReviewQueueSection({ queue, onChanged }: ReviewQueueSectionProps) {
  if (queue.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          Needs review (<span className="num">{queue.length}</span>)
        </h2>
        <p className="text-sm text-muted-foreground">
          Scraped promos we couldn&apos;t confidently match. Confirm, correct, or dismiss each one before it&apos;s
          used in hedge math.
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {queue.map((item) => (
          <QueueItemCard key={item.promoId} item={item} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}
