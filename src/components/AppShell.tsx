"use client";

import { useCallback, useState } from "react";
import type { OddsStatus } from "@/ingestion/odds/status";
import { LayoutDashboard, ChartNoAxesCombined, ArrowLeftRight, Ticket, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { OddsStatusBar } from "@/components/finder/OddsStatusBar";
import { CreditBanner } from "@/components/finder/CreditBanner";
import { ArbScreen } from "@/components/arb/ArbScreen";
import { OpportunitiesScreen } from "@/components/opportunities/OpportunitiesScreen";
import { countLabel } from "@/lib/sortPreference";
import { PromosScreen, type PromosView } from "@/components/promos/PromosScreen";
import { ToolsScreen } from "@/components/tools/ToolsScreen";
import { StatsScreen } from "@/components/stats/StatsScreen";

export interface AppShellProps {
  status: OddsStatus;
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  displayName: string;
}

type ActiveTab = "opportunities" | "stats" | "arbitrage" | "promos" | "tools";

/**
 * Page shell (D-09, D-01): one sticky status bar + credit banner shared
 * above the top-level "Dashboard · Statistics · Arbitrage · Promos · Tools"
 * tabs (the internal ActiveTab value for the Dashboard is still
 * "opportunities"), so odds age/credits/refresh stay visible regardless of which tab is
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
      <a href="#main-content" className="sr-only z-50 bg-background p-3 focus:not-sr-only focus:absolute">Skip to content</a>
      <AppHeader displayName={displayName} />
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ActiveTab)}
        className="flex-1 gap-0"
      >
          {/* Scroll navigation independently on narrow screens. */}
          <div className="border-b border-white/15 bg-[#080808] px-4 sm:px-6">
            <TabsList
              variant="line"
              aria-label="Select a tab"
              className="sportsbook-nav mx-auto flex w-full max-w-[1200px] justify-start gap-1 overflow-x-auto p-0 group-data-horizontal/tabs:h-auto [scrollbar-width:none]"
            >
              <TabsTrigger value="opportunities" className="min-h-14 flex-none gap-2 whitespace-nowrap px-3 text-[13px] font-semibold sm:px-5 sm:text-sm">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="stats" className="min-h-14 flex-none gap-2 whitespace-nowrap px-3 text-[13px] font-semibold sm:px-5 sm:text-sm">
                <ChartNoAxesCombined className="size-4" aria-hidden="true" />
                Statistics
              </TabsTrigger>
              <TabsTrigger value="arbitrage" className="min-h-14 flex-none gap-2 whitespace-nowrap px-3 text-[13px] font-semibold sm:px-5 sm:text-sm">
                <ArrowLeftRight className="size-4" aria-hidden="true" />
                Arbitrage
              </TabsTrigger>
              <TabsTrigger
                value="promos"
                className="min-h-14 flex-none gap-2 whitespace-nowrap px-3 text-[13px] font-semibold sm:px-5 sm:text-sm"
                aria-label={countLabel("Promos", reviewCount)}
              >
                <Ticket className="size-4" aria-hidden="true" />
                Promos
                {reviewCount > 0 ? (
                  <>
                    {" "}
                    <span className="num">({reviewCount})</span>
                  </>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="tools" className="min-h-14 flex-none gap-2 whitespace-nowrap px-3 text-[13px] font-semibold sm:px-5 sm:text-sm">
                <Wrench className="size-4" aria-hidden="true" />
                Tools
              </TabsTrigger>
            </TabsList>
          </div>

        <OddsStatusBar
          status={status}
          onRefreshed={bumpRecompute}
          showExtendedAge={activeTab === "arbitrage"}
        />
        <main id="main-content" className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 py-7 sm:gap-7 sm:px-6 sm:py-10">
          <CreditBanner status={status} />
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

          <TabsContent value="stats" keepMounted>
            <StatsScreen active={activeTab === "stats"} />
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
        </main>
      </Tabs>
    </>
  );
}
