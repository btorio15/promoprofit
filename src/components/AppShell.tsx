"use client";

import { useState } from "react";
import type { OddsStatus } from "@/ingestion/odds/status";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { OddsStatusBar } from "@/components/finder/OddsStatusBar";
import { CreditBanner } from "@/components/finder/CreditBanner";
import { FinderScreen } from "@/components/finder/FinderScreen";
import { ArbScreen } from "@/components/arb/ArbScreen";

export interface AppShellProps {
  status: OddsStatus;
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  displayName: string;
}

type ActiveTab = "bonus" | "arbitrage";

/**
 * Page shell (D-09): one sticky status bar + credit banner shared above the
 * top-level "Bonus bets | Arbitrage" tabs, so odds age/credits/refresh stay
 * visible regardless of which tab is open. Owns recomputeKey (bumped after
 * a refresh or a successful spreads/totals search, so both tabs recompute
 * together) and activeTab (default "bonus", not URL-synced). Both
 * TabsContent panels are keepMounted so switching tabs never discards the
 * other tab's results/state.
 */
export function AppShell({ status, bonusBooks, hasCachedOdds, displayName }: AppShellProps) {
  const [recomputeKey, setRecomputeKey] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>("bonus");
  const bumpRecompute = () => setRecomputeKey((key) => key + 1);

  return (
    <>
      <AppHeader displayName={displayName} />
      <OddsStatusBar
        status={status}
        onRefreshed={bumpRecompute}
        showExtendedAge={activeTab === "arbitrage"}
      />
      <Separator />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-4 py-12">
        <CreditBanner status={status} />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ActiveTab)}
          className="gap-8"
        >
          <TabsList variant="line" aria-label="Select a tab" className="mt-2">
            <TabsTrigger value="bonus">Bonus bets</TabsTrigger>
            <TabsTrigger value="arbitrage">Arbitrage</TabsTrigger>
          </TabsList>

          <TabsContent value="bonus" keepMounted>
            <FinderScreen
              bonusBooks={bonusBooks}
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
            />
          </TabsContent>

          <TabsContent value="arbitrage" keepMounted>
            <ArbScreen
              status={status}
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
              onSearched={bumpRecompute}
            />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
