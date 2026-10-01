"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshSpreadsTotals } from "@/app/actions/refresh-spreads-totals";
import type { ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import {
  reduceSearchOutcome,
  runSpreadsTotalsSearch,
  type SearchBanner,
  type SearchConfirmState,
} from "./spreadsTotalsSearch";

/**
 * quick-261001-e1j: the spreads/totals/alt-lines search flow shared by the
 * Arbitrage tab (ArbForm) and the status bar so the two buttons can never
 * drift. Every press goes through the confirm dialog (startSearch only makes
 * the unconfirmed call); the dialog makes the single confirmed call and feeds
 * its outcome to handleOutcome.
 */
export function useSpreadsTotalsSearch({ onSearched }: { onSearched: () => void }) {
  const router = useRouter();
  const [confirmState, setConfirmState] = useState<SearchConfirmState | null>(null);
  const [banner, setBanner] = useState<SearchBanner | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOutcome(outcome: ExtendedRefreshOutcome) {
    const next = reduceSearchOutcome(outcome);
    setConfirmState(next.confirm);
    // confirm_required leaves any existing banner alone (matches the old ArbForm).
    if (outcome.status !== "confirm_required") setBanner(next.banner);
    if (next.refreshPage) router.refresh();
    if (next.recompute) onSearched();
  }

  function startSearch() {
    setBanner(null);
    startTransition(async () => {
      handleOutcome(await runSpreadsTotalsSearch(refreshSpreadsTotals, "start"));
    });
  }

  return { confirmState, banner, pending, startSearch, handleOutcome, cancelConfirm: () => setConfirmState(null) };
}
