"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshPromos } from "@/app/actions/refresh-promos";
import type { PromoRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import type { SearchBanner } from "@/components/arb/spreadsTotalsSearch";
import {
  reducePromoRefreshOutcome,
  runPromoRefresh,
  type PromoRefreshConfirmState,
} from "./promoRefresh";

/**
 * quick-261001-jbc: the "Refresh promos" flow for the status bar. Every
 * press goes through the confirm dialog (startRefresh only makes the
 * unconfirmed call); the dialog makes the single confirmed call and feeds
 * its outcome to handleOutcome. Structural copy of useSpreadsTotalsSearch.
 */
export function usePromoRefresh({ onRefreshed }: { onRefreshed: () => void }) {
  const router = useRouter();
  const [confirmState, setConfirmState] = useState<PromoRefreshConfirmState | null>(null);
  const [banner, setBanner] = useState<SearchBanner | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOutcome(outcome: PromoRefreshOutcome) {
    const next = reducePromoRefreshOutcome(outcome);
    setConfirmState(next.confirm);
    if (outcome.status !== "confirm_required") setBanner(next.banner);
    if (next.refreshPage) router.refresh();
    if (next.recompute) onRefreshed();
  }

  function startRefresh() {
    setBanner(null);
    startTransition(async () => {
      handleOutcome(await runPromoRefresh(refreshPromos, "start"));
    });
  }

  return { confirmState, banner, pending, startRefresh, handleOutcome, cancelConfirm: () => setConfirmState(null) };
}
