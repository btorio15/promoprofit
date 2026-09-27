"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { flagPromoMatch } from "@/app/actions/flag-promo-match";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FlagMatchButtonProps {
  promoId: number;
  onChanged: () => void;
}

/**
 * Flag-back icon button (D-11 safety net), extracted verbatim from
 * PromoRow.tsx so both PromoRow and UnprofitablePromoRow (quick-260927-edt)
 * share one flagPromoMatch call site. Same classes, aria-label, tooltip
 * copy, stopPropagation, and useTransition pending-disable as the original.
 *
 * The error message is rendered inside this component (not surfaced to the
 * caller) -- it's absolutely positioned below the button inside a relative
 * inline-flex wrapper so it can sit inline in a badge line without
 * disrupting that line's flex layout, while staying visually equivalent to
 * PromoRow's original sibling-paragraph placement.
 */
export function FlagMatchButton({ promoId, onChanged }: FlagMatchButtonProps) {
  const [isFlagPending, startFlagTransition] = useTransition();
  const [flagMessage, setFlagMessage] = useState<string | null>(null);

  function flagMatch(event: MouseEvent) {
    event.stopPropagation();
    startFlagTransition(async () => {
      const outcome = await flagPromoMatch({ promoId });
      if (outcome.status === "ok") {
        setFlagMessage(null);
        onChanged();
        return;
      }
      setFlagMessage("message" in outcome ? outcome.message : "Couldn't flag this promo.");
    });
  }

  return (
    <span className="relative inline-flex">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto h-10 w-10"
              aria-label="Flag this match as wrong"
              disabled={isFlagPending}
              onClick={flagMatch}
            >
              <Flag className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>Flag this match as wrong — sends it back for review.</TooltipContent>
      </Tooltip>
      {flagMessage ? (
        <p role="alert" className="absolute top-full left-0 z-10 w-max max-w-xs text-sm text-destructive">
          {flagMessage}
        </p>
      ) : null}
    </span>
  );
}
