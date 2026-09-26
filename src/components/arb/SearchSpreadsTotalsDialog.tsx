"use client";

import { useTransition } from "react";
import { refreshSpreadsTotals } from "@/app/actions/refresh-spreads-totals";
import type { ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
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

export interface SearchSpreadsTotalsDialogProps {
  open: boolean;
  estimatedCredits: number;
  remaining: number | null;
  minutesSinceLastRefresh: number | null;
  onCancel: () => void;
  onOutcome: (outcome: ExtendedRefreshOutcome) => void;
}

/**
 * D-13/D-14 in-page confirm for "Search spreads & totals" -- a structural
 * copy of RefreshConfirmDialog, never a native window.confirm popup. Every
 * press of the button lands here first (the server always returns
 * confirm_required on an unconfirmed call, D-14); "Search anyway" confirms
 * the same server action itself and reports the outcome up to ArbForm,
 * which owns the credit/error banners.
 */
export function SearchSpreadsTotalsDialog({
  open,
  estimatedCredits,
  remaining,
  minutesSinceLastRefresh,
  onCancel,
  onOutcome,
}: SearchSpreadsTotalsDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmSearch() {
    startTransition(async () => {
      const outcome = await refreshSpreadsTotals({ confirmed: true });
      onOutcome(outcome);
    });
  }

  const remainingSentence =
    remaining === null
      ? "Your credit balance appears after the first refresh."
      : `${remaining} of 500 credits remain this month.`;

  const description =
    `This spends about ${estimatedCredits} credits — roughly 3× a normal refresh. ${remainingSentence}` +
    (minutesSinceLastRefresh !== null
      ? ` Odds were last fetched ${minutesSinceLastRefresh} min ago.`
      : "");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Search spreads & totals for every in-season sport?</AlertDialogTitle>
          <AlertDialogDescription className="num">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmSearch} disabled={isPending}>
            {isPending ? "Searching…" : "Search anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
