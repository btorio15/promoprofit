"use client";

import { useState } from "react";
import type { FindHedgesResponse } from "@/domain/finder/types";
import { formatUsd } from "@/lib/format";
import { SPORTS } from "@/config/sports";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "./EmptyState";
import { ResultRow } from "./ResultRow";

interface ResultsListProps {
  response: Extract<FindHedgesResponse, { status: "ok" }>;
}

const TAB_KEYS: readonly string[] = ["all", ...SPORTS.map((s) => s.key)];

function tabLabel(key: string): string {
  if (key === "all") return "All sports";
  return SPORTS.find((s) => s.key === key)?.label ?? key;
}

/**
 * Results heading, caption, sport tabs, and ranked rows (D-06). Sport is a
 * client-only view switch over one search's response.resultsBySport --
 * switching tabs never re-submits the search (owner-requested scope
 * change, 01-05). Tab state lives here (not lifted) so it naturally
 * survives a new search/refresh response as long as this component stays
 * mounted, satisfying the "persist across refresh" requirement for free.
 */
export function ResultsList({ response }: ResultsListProps) {
  const { resultsBySport, bonusAmount, bonusBookName, maxHedgeAmount, limitExcludedAll } = response;
  const [tab, setTab] = useState<string>("all");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Results</h2>
        <p className="text-sm text-muted-foreground">
          Top 10 for a <span className="num">{formatUsd(bonusAmount)}</span>{" "}
          {bonusBookName} bonus bet · ranked by guaranteed profit
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value: string) => setTab(value)}>
        <TabsList variant="line" aria-label="Filter results by sport" className="flex-wrap">
          {TAB_KEYS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {tabLabel(key)}{" "}
              <span className="num text-muted-foreground">
                ({(resultsBySport[key] ?? []).length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_KEYS.map((key) => {
          const results = resultsBySport[key] ?? [];
          return (
            <TabsContent key={key} value={key} className="flex flex-col gap-4 pt-2">
              {results.length === 0 && limitExcludedAll[key] ? (
                <EmptyState
                  variant="no-results-under-limit"
                  maxHedgeAmount={maxHedgeAmount ?? undefined}
                />
              ) : results.length === 0 ? (
                <EmptyState
                  variant="no-results"
                  sportLabel={key === "all" ? undefined : tabLabel(key)}
                />
              ) : (
                <>
                  <div
                    className="hidden text-sm text-muted-foreground md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4 md:px-4"
                    aria-hidden="true"
                  >
                    <span>Game</span>
                    <span>Bonus side</span>
                    <span>Hedge side</span>
                    <span className="text-right">Guaranteed profit</span>
                    <span className="text-right">Conversion</span>
                    <span />
                  </div>

                  <div className="flex flex-col gap-2">
                    {results.map((result) => (
                      <ResultRow key={result.eventId} result={result} />
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
