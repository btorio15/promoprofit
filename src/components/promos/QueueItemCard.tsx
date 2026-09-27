"use client";

import { useState, useTransition } from "react";
import type { QueueItemDTO } from "@/domain/promos/dto";
import { confirmPromoMatch, type PromoReviewResponse } from "@/app/actions/confirm-promo-match";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAmerican, formatUsd } from "@/lib/format";
import { DismissPromoDialog } from "./DismissPromoDialog";

interface QueueItemCardProps {
  item: QueueItemDTO;
  onChanged: () => void;
}

const INVALID_MESSAGE = "Something went wrong with that request. Try refreshing the page.";

/**
 * One review-queue card, match or caps kind (D-13, D-14, PROMO-04;
 * 03-UI-SPEC.md "Queue item card"). Confirm/Dismiss both run in
 * useTransition; an "ok" outcome calls onChanged() (the parent re-fetches
 * getPromos and the card disappears from the queue); a stale/conflict/
 * invalid outcome renders inline instead -- another member may have
 * already acted on this exact card.
 */
export function QueueItemCard({ item, onChanged }: QueueItemCardProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);

  function handleOutcome(outcome: PromoReviewResponse) {
    if (outcome.status === "ok") {
      setMessage(null);
      onChanged();
      return;
    }
    setMessage(outcome.status === "invalid" ? INVALID_MESSAGE : outcome.message);
  }

  function confirmMatch() {
    startTransition(async () => {
      const outcome = await confirmPromoMatch({ promoId: item.promoId });
      handleOutcome(outcome);
    });
  }

  const capRecapText =
    item.kind === "caps" && item.capRecap
      ? `Max stake: ${item.capRecap.maxStake ? formatUsd(item.capRecap.maxStake) : "not found"} · Max winnings: ${
          item.capRecap.maxWinnings ? formatUsd(item.capRecap.maxWinnings) : "not found"
        } · Min odds: ${item.capRecap.minOdds !== null ? formatAmerican(item.capRecap.minOdds) : "not found"}`
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary p-4">
      <div className="flex flex-col gap-1">
        <span className="text-base">
          {item.bookName} — <Badge variant="outline">{item.promoTypeLabel}</Badge> · {item.description}
        </span>

        {item.kind === "match" ? (
          <>
            <span className="text-sm text-muted-foreground">
              Needs review: couldn&apos;t confirm which game this is for.
            </span>
            {item.bestGuessLabel ? (
              <span className="text-sm text-muted-foreground">{item.bestGuessLabel}</span>
            ) : null}
          </>
        ) : (
          <>
            {item.matchedLabel ? <span className="text-sm text-muted-foreground">{item.matchedLabel}</span> : null}
            <span className="text-sm text-muted-foreground">
              Needs review: couldn&apos;t read the stake/winnings cap from the promo text.
            </span>
            {capRecapText ? <span className="text-sm text-muted-foreground">{capRecapText}</span> : null}
          </>
        )}
      </div>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {item.kind === "match" && item.bestGuessLabel ? (
          <Button className="h-10" aria-label="Confirm this match" onClick={confirmMatch} disabled={isPending}>
            Confirm
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-10 text-destructive"
          aria-label="Dismiss this promo"
          onClick={() => setDismissOpen(true)}
          disabled={isPending}
        >
          Dismiss
        </Button>
      </div>

      <DismissPromoDialog
        open={dismissOpen}
        promoId={item.promoId}
        onCancel={() => setDismissOpen(false)}
        onOutcome={(outcome) => {
          setDismissOpen(false);
          handleOutcome(outcome);
        }}
      />
    </div>
  );
}
