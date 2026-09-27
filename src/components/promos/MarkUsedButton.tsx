"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { markPromoUsedAction, unmarkPromoUsedAction } from "@/app/actions/mark-promo-used";
import { Button } from "@/components/ui/button";

interface MarkUsedButtonProps {
  promoId: number;
  used: boolean;
  onChanged: () => void;
}

/**
 * quick-260927-n12 (owner decision 2, scope change A): a single toggle
 * button -- "Mark used" when the promo isn't marked yet, "Undo" when it is
 * (the row's own green-gradient background plus this button IS the undo
 * path; there's no separate collapsed section). Structure copied from
 * FlagMatchButton.tsx: useTransition, event.stopPropagation so a row's
 * expand/collapse trigger never also fires, ghost Button, pending-disable,
 * inline error shown below the button.
 */
export function MarkUsedButton({ promoId, used, onChanged }: MarkUsedButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    startTransition(async () => {
      const outcome = used ? await unmarkPromoUsedAction({ promoId }) : await markPromoUsedAction({ promoId });
      if (outcome.status === "ok") {
        setErrorMessage(null);
        onChanged();
        return;
      }
      setErrorMessage(
        "message" in outcome ? outcome.message : used ? "Couldn't undo this promo." : "Couldn't mark this promo used.",
      );
    });
  }

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="pointer-events-auto gap-1.5"
        aria-label={used ? "Undo marking this promo used" : "Mark this promo as used"}
        disabled={isPending}
        onClick={toggle}
      >
        {used ? <Undo2 className="size-4" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
        {used ? "Undo" : "Mark used"}
      </Button>
      {errorMessage ? (
        <p role="alert" className="absolute top-full left-0 z-10 w-max max-w-xs text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </span>
  );
}
