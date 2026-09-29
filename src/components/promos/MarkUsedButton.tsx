"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { markPromoUsedAction, unmarkPromoUsedAction } from "@/app/actions/mark-promo-used";
import { Button } from "@/components/ui/button";

type MarkUsedButtonProps =
  | {
      mode: "mark";
      promoId: number;
      precision: "whole" | "cents";
      /** The guaranteed profit this row displays (2-dp string), or null for a greyed-out row. */
      expectedGuaranteedProfit: string | null;
      onChanged: () => void;
    }
  | { mode: "undo"; promoId: number; onChanged: () => void };

/**
 * quick-260929-igk: "Mark done" on an Active row, "Undo" on a Done row. The
 * server recomputes the member's row and rejects with an "Odds changed"
 * message when the displayed profit no longer matches; in that case the feed
 * is reloaded (onChanged) so the row shows fresh numbers. Structure copied
 * from FlagMatchButton.tsx: useTransition, event.stopPropagation so a row's
 * expand/collapse trigger never also fires, ghost Button, pending-disable,
 * inline error shown below the button. min-h-10 keeps the tap target at
 * least 40px tall (03-UI-SPEC), since size="sm" alone is 28px.
 */
export function MarkUsedButton(props: MarkUsedButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isUndo = props.mode === "undo";

  function run(event: MouseEvent) {
    event.stopPropagation();
    startTransition(async () => {
      if (props.mode === "undo") {
        const outcome = await unmarkPromoUsedAction({ promoId: props.promoId });
        if (outcome.status === "ok") {
          setErrorMessage(null);
          props.onChanged();
          return;
        }
        setErrorMessage("Couldn't undo this promo.");
        return;
      }

      const outcome = await markPromoUsedAction({
        promoId: props.promoId,
        precision: props.precision,
        expectedGuaranteedProfit: props.expectedGuaranteedProfit,
      });
      if (outcome.status === "ok") {
        setErrorMessage(null);
        props.onChanged();
        return;
      }
      if (outcome.status === "odds_changed") {
        setErrorMessage(outcome.message);
        props.onChanged();
        return;
      }
      setErrorMessage(outcome.status === "not_found" ? outcome.message : "Couldn't mark this promo done.");
    });
  }

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="pointer-events-auto min-h-10 gap-1.5"
        aria-label={
          isUndo ? "Undo marking this promo done — it returns to Active" : "Mark this promo as done"
        }
        disabled={isPending}
        onClick={run}
      >
        {isUndo ? <Undo2 className="size-4" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
        {isUndo ? "Undo" : "Mark done"}
      </Button>
      {errorMessage ? (
        <p role="alert" className="absolute top-full left-0 z-10 w-max max-w-xs text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </span>
  );
}
