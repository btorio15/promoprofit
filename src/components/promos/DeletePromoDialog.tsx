"use client";

import { useTransition } from "react";
import { deletePromo } from "@/app/actions/delete-promo";
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

export interface DeletePromoDialogProps {
  open: boolean;
  promoId: number;
  isDone: boolean;
  onCancel: () => void;
  onOutcome: (outcome: AddedPromoResponse) => void;
}

/** Confirm dialog for "Delete". Soft delete server-side; Done entries and recorded profit stay. */
export function DeletePromoDialog({ open, promoId, isDone, onCancel, onOutcome }: DeletePromoDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      try {
        onOutcome(await deletePromo({ promoId }));
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
          <AlertDialogTitle>Delete this promo?</AlertDialogTitle>
          <AlertDialogDescription>
            {isDone
              ? "It will be removed from your Promos and Opportunities. Your Done entry and the profit you recorded stay exactly as they are. This can't be undone."
              : "It will be removed from your Promos and Opportunities. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" onClick={onCancel}>
            Keep it
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete promo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
