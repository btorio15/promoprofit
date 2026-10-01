"use client";

import { useTransition } from "react";
import { refreshPromos } from "@/app/actions/refresh-promos";
import type { PromoRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import { describePromoRefreshConfirm, runPromoRefresh } from "./promoRefresh";
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

export interface PromoRefreshDialogProps {
  open: boolean;
  sportKeys: string[];
  estimatedCredits: number;
  remaining: number | null;
  onCancel: () => void;
  onOutcome: (outcome: PromoRefreshOutcome) => void;
}

/**
 * quick-261001-jbc D-04 in-page confirm for "Refresh promos" -- a structural
 * copy of SearchSpreadsTotalsDialog. Every press lands here first; the action
 * makes the single confirmed call and reports the outcome up to the status
 * bar. The credit figure is an estimate ("about"): alternate-spread games are
 * an upper bound and the real spend is recorded after the fetch.
 */
export function PromoRefreshDialog({
  open,
  sportKeys,
  estimatedCredits,
  remaining,
  onCancel,
  onOutcome,
}: PromoRefreshDialogProps) {
  const [isPending, startTransition] = useTransition();

  function confirmRefresh() {
    startTransition(async () => {
      onOutcome(await runPromoRefresh(refreshPromos, "confirm"));
    });
  }

  const description =
    `${describePromoRefreshConfirm(sportKeys, estimatedCredits, remaining)} ` +
    "Updates moneyline, spreads and totals for those sports, then alternate spreads for each promo's best game (up to 5).";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refresh odds for your promos?</AlertDialogTitle>
          <AlertDialogDescription className="num">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Locked while a confirmed (credit-spending) refresh is in flight:
              closing the dialog would not stop the server action, and would
              re-enable the main buttons mid-spend (01.1 review WR-04). */}
          <AlertDialogCancel
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              if (!isPending) onCancel();
            }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmRefresh} disabled={isPending}>
            {isPending ? "Refreshing promos…" : "Refresh promos"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
