"use client";

import { useState } from "react";
import type { OddsStatus } from "@/ingestion/odds/status";
import { Separator } from "@/components/ui/separator";
import { OddsStatusBar } from "./OddsStatusBar";
import { CreditBanner } from "./CreditBanner";
import { FinderForm } from "./FinderForm";

export interface FinderScreenProps {
  status: OddsStatus;
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
}

/**
 * Composes the sticky status bar, credit banner, and finder form. Owns
 * recomputeKey, incremented by OddsStatusBar's onRefreshed after a
 * successful refresh so FinderForm re-submits the last search against the
 * newly refreshed cache (ODDS-04, D-13) -- including the sport tabs, which
 * are derived from that same recomputed response. Between refreshes the
 * previous results stay on screen.
 */
export function FinderScreen({ status, bonusBooks, hasCachedOdds }: FinderScreenProps) {
  const [recomputeKey, setRecomputeKey] = useState(0);

  return (
    <>
      <OddsStatusBar status={status} onRefreshed={() => setRecomputeKey((key) => key + 1)} />
      <Separator />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Bonus bet finder</h1>
          <p className="text-sm text-muted-foreground">
            Find the best market to convert a bonus bet, and the best Colorado
            book to hedge it at.
          </p>
        </header>
        <CreditBanner status={status} />
        <FinderForm
          bonusBooks={bonusBooks}
          hasCachedOdds={hasCachedOdds}
          recomputeKey={recomputeKey}
        />
      </main>
    </>
  );
}
