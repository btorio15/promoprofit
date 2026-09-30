"use client";

import { useTransition } from "react";
import { dismissPromo } from "@/app/actions/dismiss-promo";
import type { PromoReviewResponse } from "@/app/actions/confirm-promo-match";
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
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

export interface DismissPromoDialogProps {
  open: boolean;
  promoId: number;
  onCancel: () => void;
  onOutcome: (outcome: PromoReviewResponse) => void;
}

/**
 * D-14 dismiss confirmation -- the one irreversible action this phase
 * introduces (03-UI-SPEC.md "Dismiss confirmation"). Copies
 * RefreshConfirmDialog's AlertDialog structure verbatim with new copy.
 * "Cancel" closes the dialog with no server call. "Dismiss" calls
 * dismissPromo({ promoId }) itself and reports the outcome up to
 * QueueItemCard, which owns the stale/conflict/invalid message display.
 */
export function DismissPromoDialog({ open, promoId, onCancel, onOutcome }: DismissPromoDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmDismiss() {
    startTransition(async () => {
      const call = await safeAction(() => dismissPromo({ promoId }), "dismissPromo");
      if (!call.ok) {
        // Synthesized status is only a carrier for the message.
        onOutcome({ status: "stale", message: ACTION_FAILED_MESSAGE });
        return;
      }
      const outcome = call.value;
      onOutcome(outcome);
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
          <AlertDialogTitle>Dismiss this promo?</AlertDialogTitle>
          <AlertDialogDescription>
            {/* eslint-disable-next-line react/no-unescaped-entities -- verbatim UI-SPEC copy, acceptance-grepped */}
            It won't be suggested again from later scrapes of this book. This can't be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDismiss} disabled={isPending}>
            {isPending ? "Dismissing…" : "Dismiss"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
