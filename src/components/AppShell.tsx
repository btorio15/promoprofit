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
import { OpportunitiesScreen } from "@/components/opportunities/OpportunitiesScreen";
import { PromosScreen } from "@/components/promos/PromosScreen";
import { SignupOffersScreen } from "@/components/signup/SignupOffersScreen";

export interface AppShellProps {
  status: OddsStatus;
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  displayName: string;
}

type ActiveTab = "opportunities" | "bonus" | "arbitrage" | "promos" | "signup";

/**
 * Page shell (D-09, D-01): one sticky status bar + credit banner shared
 * above the top-level "Opportunities | Bonus bets | Arbitrage | Promos | Sign-up offers"
 * tabs, so odds age/credits/refresh stay visible regardless of which tab is
 * open. Owns recomputeKey (bumped after a refresh or a successful
 * spreads/totals search, so the odds-dependent tabs recompute together) and
 * activeTab (default "opportunities", D-01, not URL-synced) and promosVersion
 * (bumped after any Mark done / Undo so the Opportunities feed refetches). Every tab panel below stays
 * mounted while inactive so switching tabs never discards another tab's
 * results/state. quick-260928-mgi: the Sign-up offers tab needs neither
 * recomputeKey nor hasCachedOdds -- it's informational only, independent of
 * odds/ranking (T-mgi-08).
 */
export function AppShell({ status, bonusBooks, hasCachedOdds, displayName }: AppShellProps) {
  const [recomputeKey, setRecomputeKey] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>("opportunities");
  const [promosVersion, setPromosVersion] = useState(0);
  const bumpRecompute = () => setRecomputeKey((key) => key + 1);
  const bumpPromos = () => setPromosVersion((v) => v + 1);

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
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="bonus">Bonus bets</TabsTrigger>
            <TabsTrigger value="arbitrage">Arbitrage</TabsTrigger>
            <TabsTrigger value="promos">Promos</TabsTrigger>
            <TabsTrigger value="signup">Sign-up offers</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" keepMounted>
            <OpportunitiesScreen
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
              promosVersion={promosVersion}
              onPromosChanged={bumpPromos}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          </TabsContent>

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

          <TabsContent value="promos" keepMounted>
            <PromosScreen hasCachedOdds={hasCachedOdds} recomputeKey={recomputeKey} />
          </TabsContent>

          <TabsContent value="signup" keepMounted>
            <SignupOffersScreen />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
