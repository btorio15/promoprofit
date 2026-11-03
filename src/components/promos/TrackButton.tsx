"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { Pin } from "lucide-react";
import { trackNoSweatAction } from "@/app/actions/track-no-sweat";
import { NoSweatRiskAdvisory } from "@/components/NoSweatRiskAdvisory";
import { Button } from "@/components/ui/button";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import { TRACK_FAILED_COPY, TRACK_ODDS_CHANGED_COPY } from "./noSweatRowView";

interface TrackButtonProps {
  promoId: number;
  precision: "whole" | "cents";
  /** The estimate this row displays (2-dp string); the server compares it to its own recompute. */
  expectedEstimate: string;
  onChanged: () => void;
}

/**
 * Phase 9 (D-01, D-20): "Track bet" on a no-sweat row. The account-risk line
 * sits directly above the button so it is always visible before the member
 * tracks. Structure mirrors MarkUsedButton: useTransition, safeAction,
 * stopPropagation so the row's expand trigger never also fires, inline
 * role="alert" error.
 */
export function TrackButton({ promoId, precision, expectedEstimate, onChanged }: TrackButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function run(event: MouseEvent) {
    event.stopPropagation();
    startTransition(async () => {
      const call = await safeAction(
        () => trackNoSweatAction({ promoId, precision, expectedEstimate }),
        "trackNoSweatAction",
      );
      if (!call.ok) {
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      const outcome = call.value;
      if (outcome.status === "ok") {
        setErrorMessage(null);
        onChanged();
        return;
      }
      if (outcome.status === "odds_changed") {
        setErrorMessage(TRACK_ODDS_CHANGED_COPY);
        onChanged();
        return;
      }
      if (outcome.status === "not_found" || outcome.status === "cant_track" || outcome.status === "unavailable") {
        setErrorMessage(outcome.message);
        return;
      }
      setErrorMessage(TRACK_FAILED_COPY);
    });
  }

  return (
    <div className="pointer-events-auto flex max-w-xs flex-col items-start gap-2">
      <NoSweatRiskAdvisory variant="compact" />
      <Button type="button" className="min-h-11 gap-1.5" disabled={isPending} onClick={run}>
        <Pin className="size-4" aria-hidden="true" />
        Track bet
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
