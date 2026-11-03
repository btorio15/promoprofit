"use client";

import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrackedNoSweatCardDTO } from "@/domain/promos/trackedCardDto";
import { TrackedNoSweatCard } from "./TrackedNoSweatCard";

interface TrackingStripProps {
  cards: TrackedNoSweatCardDTO[];
  onChanged: () => void;
}

/** Phase 9 (D-02): the Tracking section. Renders nothing (and reserves no space) when empty. */
export function TrackingStrip({ cards, onChanged }: TrackingStripProps) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="tracking-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="tracking-heading" className="flex items-center gap-2 text-xl font-semibold">
          <Pin className="size-5" aria-hidden="true" />
          Tracking
          <Badge variant="outline">{cards.length}</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          No-sweats you&apos;ve placed. Finish each one when the game is over.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {cards.map((card) => (
          <TrackedNoSweatCard key={card.promoId} card={card} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}
