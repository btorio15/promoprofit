"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markPairDoneAction } from "@/app/actions/mark-pair-done";
import { formatUsd } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

export interface MarkPairDoneButtonProps {
  promoIdA: number;
  promoIdB: number;
  precision: "whole" | "cents";
  /** 2-dp strings straight from the PairRowDTO; the server only compares them. */
  expectedGuaranteedProfit: string;
  expectedStakeA: string;
  expectedStakeB: string;
  onChanged: () => void;
}

const ODDS_MOVED_MESSAGE =
  "The odds moved since this loaded, so the stakes changed. Nothing was saved. Check the new numbers and try again.";
const SAVE_FAILED_MESSAGE = "Couldn't save that. Check your connection and try again.";

/**
 * "Mark pair done" (D-11) with a confirm dialog. The server recomputes the
 * pair and rejects when profit or either stake moved (D-23); we then show
 * the odds-moved message and reload (onChanged) so the card re-ranks from
 * fresh data. No optimistic removal. stopPropagation keeps the card's
 * expand/collapse trigger from also firing.
 */
export function MarkPairDoneButton(props: MarkPairDoneButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function confirm() {
    startTransition(async () => {
      const call = await safeAction(() => markPairDoneAction({
        promoIdA: props.promoIdA,
        promoIdB: props.promoIdB,
        precision: props.precision,
        expectedGuaranteedProfit: props.expectedGuaranteedProfit,
        expectedStakeA: props.expectedStakeA,
        expectedStakeB: props.expectedStakeB,
      }), "markPairDoneAction");
      if (!call.ok) {
        setOpen(false);
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      const outcome = call.value;
      setOpen(false);
      if (outcome.status === "ok") {
        setErrorMessage(null);
        props.onChanged();
        return;
      }
      if (outcome.status === "odds_changed") {
        setErrorMessage(ODDS_MOVED_MESSAGE);
        props.onChanged();
        return;
      }
      if (outcome.status === "not_found") {
        setErrorMessage(outcome.message);
        props.onChanged();
        return;
      }
      setErrorMessage(SAVE_FAILED_MESSAGE);
    });
  }

  return (
    <div className="flex flex-col gap-2" onClick={(event: MouseEvent) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        className="pointer-events-auto min-h-11 gap-1.5 self-start"
        disabled={isPending}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <CheckCheck className="size-4" aria-hidden="true" />
        Mark pair done
      </Button>
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isPending) setOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark both promos done?</AlertDialogTitle>
            <AlertDialogDescription>
              This records both bets at these stakes and odds, adds {formatUsd(props.expectedGuaranteedProfit)} to
              your Total profit extracted, and moves both promos to Done. You can undo it from the Done list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost" onClick={() => setOpen(false)}>
              Not yet
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={isPending}>
              Mark both done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
