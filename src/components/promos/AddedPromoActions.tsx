"use client";

import { useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import type { AddedPromoResponse } from "@/domain/promos/addedPromoInput";
import { Button } from "@/components/ui/button";
import { ExpirePromoDialog } from "./ExpirePromoDialog";
import { DeletePromoDialog } from "./DeletePromoDialog";

interface AddedPromoActionsProps {
  promoId: number;
  canExpire: boolean;
  isDone: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}

/**
 * Manage actions for a promo the member added: "Expire now" (active only)
 * and "Delete", each behind a confirm dialog. Failures (including a promo
 * that is no longer available) surface through onError as an inline alert.
 */
export function AddedPromoActions({ promoId, canExpire, isDone, onChanged, onError }: AddedPromoActionsProps) {
  const [dialog, setDialog] = useState<"expire" | "delete" | null>(null);

  function handleOutcome(kind: "expire" | "delete", outcome: AddedPromoResponse) {
    setDialog(null);
    if (outcome.status === "ok") {
      onChanged();
    } else {
      onError(kind === "expire" ? "Couldn't expire that promo. Try again." : "Couldn't delete that promo. Try again.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canExpire ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialog("expire")}>
          <Clock aria-hidden="true" />
          Expire now
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 text-destructive"
        onClick={() => setDialog("delete")}
      >
        <Trash2 aria-hidden="true" />
        Delete
      </Button>
      <ExpirePromoDialog
        open={dialog === "expire"}
        promoId={promoId}
        onCancel={() => setDialog(null)}
        onOutcome={(o) => handleOutcome("expire", o)}
      />
      <DeletePromoDialog
        open={dialog === "delete"}
        promoId={promoId}
        isDone={isDone}
        onCancel={() => setDialog(null)}
        onOutcome={(o) => handleOutcome("delete", o)}
      />
    </div>
  );
}
