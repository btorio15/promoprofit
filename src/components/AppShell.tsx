"use client";

import { useCallback, useState } from "react";
import type { OddsStatus } from "@/ingestion/odds/status";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { OddsStatusBar } from "@/components/finder/OddsStatusBar";
import { CreditBanner } from "@/components/finder/CreditBanner";
import { ArbScreen } from "@/components/arb/ArbScreen";
import { OpportunitiesScreen } from "@/components/opportunities/OpportunitiesScreen";
import { countLabel } from "@/lib/sortPreference";
import { PromosScreen, type PromosView } from "@/components/promos/PromosScreen";
import { ToolsScreen } from "@/components/tools/ToolsScreen";

export interface AppShellProps {
  status: OddsStatus;
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  displayName: string;
}

type ActiveTab = "opportunities" | "arbitrage" | "promos" | "tools";

/**
 * Page shell (D-09, D-01): one sticky status bar + credit banner shared
 * above the top-level "Opportunities | Arbitrage | Promos | Tools"
 * tabs, so odds age/credits/refresh stay visible regardless of which tab is
 * open. Owns recomputeKey (bumped after a refresh or a successful
 * spreads/totals search, so the odds-dependent tabs recompute together) and
 * activeTab (default "opportunities", D-01, not URL-synced) and promosVersion
 * (bumped after any Mark done / Undo so the Opportunities feed refetches). Every tab panel below stays
 * mounted while inactive so switching tabs never discards another tab's
 * results/state. The Tools tab wraps the bonus-bet finder and the
 * informational Sign-up offers list (T-mgi-08) under sub-tabs.
 */
export function AppShell({ status, bonusBooks, hasCachedOdds, displayName }: AppShellProps) {
  const [recomputeKey, setRecomputeKey] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>("opportunities");
  const [promosView, setPromosView] = useState<PromosView>("active");
  const [reviewCount, setReviewCount] = useState(0);
  const handleReviewCount = useCallback((n: number) => setReviewCount(n), []);
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
            <TabsTrigger value="opportunities" className="min-h-11 whitespace-nowrap">
              Opportunities
            </TabsTrigger>
            <TabsTrigger value="arbitrage" className="min-h-11 whitespace-nowrap">
              Arbitrage
            </TabsTrigger>
            <TabsTrigger
              value="promos"
              className="min-h-11 whitespace-nowrap"
              aria-label={countLabel("Promos", reviewCount)}
            >
              Promos
              {reviewCount > 0 ? (
                <>
                  {" "}
                  <span className="num">({reviewCount})</span>
                </>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="tools" className="min-h-11 whitespace-nowrap">
              Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" keepMounted>
            <OpportunitiesScreen
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
              promosVersion={promosVersion}
              onPromosChanged={bumpPromos}
              onNavigate={(tab) => {
                if (tab === "promos") setPromosView("active");
                setActiveTab(tab);
              }}
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
            <PromosScreen
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
              promosVersion={promosVersion}
              onPromosChanged={bumpPromos}
              view={promosView}
              onViewChange={setPromosView}
              onReviewCount={handleReviewCount}
            />
          </TabsContent>

          <TabsContent value="tools" keepMounted>
            <ToolsScreen
              bonusBooks={bonusBooks}
              hasCachedOdds={hasCachedOdds}
              recomputeKey={recomputeKey}
            />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
