"use client";

import { useTransition } from "react";
import { expirePromo } from "@/app/actions/expire-promo";
import type { AddedPromoResponse } from "@/domain/promos/addedPromoInput";
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

export interface ExpirePromoDialogProps {
  open: boolean;
  promoId: number;
  onCancel: () => void;
  onOutcome: (outcome: AddedPromoResponse) => void;
}

/** Confirm dialog for "Expire now". Neutral (not destructive): Done history is untouched. */
export function ExpirePromoDialog({ open, promoId, onCancel, onOutcome }: ExpirePromoDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmExpire() {
    startTransition(async () => {
      try {
        onOutcome(await expirePromo({ promoId }));
      } catch {
        onOutcome({ status: "not_found", message: "" });
      }
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
          <AlertDialogTitle>Expire this promo now?</AlertDialogTitle>
          <AlertDialogDescription>
            It will stop showing in Promos and Opportunities right away. Anything you already marked done stays in
            Done.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" onClick={onCancel}>
            Keep it
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmExpire} disabled={isPending}>
            {isPending ? "Expiring…" : "Expire promo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
