"use client";

import { useTransition } from "react";
import { refreshOdds } from "@/app/actions/refresh-odds";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import type { RefreshOutcome } from "@/ingestion/odds/refresh";
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

export interface RefreshConfirmDialogProps {
  open: boolean;
  minutesSinceLastRefresh: number;
  estimatedCredits: number;
  onCancel: () => void;
  onOutcome: (outcome: RefreshOutcome) => void;
}

/**
 * D-10 in-page 15-minute refresh confirmation — a real AlertDialog, never
 * a native browser confirm popup. "Cancel" closes the dialog with no
 * server call and spends nothing. "Refresh anyway" calls
 * refreshOdds({ confirmed: true }) itself and reports the outcome up to
 * OddsStatusBar, which owns the age/credit display and the error/blocked
 * banners.
 */
export function RefreshConfirmDialog({
  open,
  minutesSinceLastRefresh,
  estimatedCredits,
  onCancel,
  onOutcome,
}: RefreshConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmRefresh() {
    startTransition(async () => {
      const call = await safeAction(() => refreshOdds({ confirmed: true }), "refreshOdds");
      onOutcome(call.ok ? call.value : { status: "error", message: ACTION_FAILED_MESSAGE });
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Odds were refreshed {minutesSinceLastRefresh} min ago.</AlertDialogTitle>
          <AlertDialogDescription>
            Refreshing again will spend approximately {estimatedCredits} credits. Refresh anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmRefresh} disabled={isPending}>
            {isPending ? "Refreshing…" : "Refresh anyway"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
