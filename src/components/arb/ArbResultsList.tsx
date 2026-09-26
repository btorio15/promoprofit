"use client";

import { useState } from "react";
import type { FindArbsResponse } from "@/domain/arb/types";
import { formatUsd } from "@/lib/format";
import { SPORTS } from "@/config/sports";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArbEmptyState } from "./ArbEmptyState";
import { ArbRow } from "./ArbRow";

interface ArbResultsListProps {
  response: Extract<FindArbsResponse, { status: "ok" }>;
}

const TAB_KEYS: readonly string[] = ["all", ...SPORTS.map((s) => s.key)];

function tabLabel(key: string): string {
  if (key === "all") return "All sports";
  return SPORTS.find((s) => s.key === key)?.label ?? key;
}

/**
 * Arb heading, caption, sport sub-tabs, and ranked rows (D-11, D-12). Sport
 * is a client-only view switch over one response's resultsBySport, kept as
 * local state (not lifted) so switching tabs never triggers a recompute.
 * Rows are rendered in the exact order the server sent them -- the server
 * already sorted each sport's list by return % -- no client-side re-sort.
 */
export function ArbResultsList({ response }: ArbResultsListProps) {
  const { resultsBySport, totalStake } = response;
  const [tab, setTab] = useState<string>("all");
  const totalArbs = (resultsBySport.all ?? []).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Arbitrage opportunities</h2>
        <p className="text-sm text-muted-foreground">
          <span className="num">{totalArbs}</span> arbs for a{" "}
          <span className="num">{formatUsd(totalStake)}</span> total stake · ranked by return %
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value: string) => setTab(value)}>
        <TabsList variant="line" aria-label="Filter arbs by sport" className="flex-wrap">
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
              {results.length === 0 ? (
                <ArbEmptyState
                  variant="no-arbs"
                  sportLabel={key === "all" ? undefined : tabLabel(key)}
                />
              ) : (
                <>
                  <div
                    className="hidden text-sm text-muted-foreground md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4 md:px-4"
                    aria-hidden="true"
                  >
                    <span>Game</span>
                    <span>Side A</span>
                    <span>Side B</span>
                    <span className="text-right">Guaranteed profit</span>
                    <span className="text-right">Return</span>
                    <span />
                  </div>

                  <div className="flex flex-col gap-2">
                    {results.map((result) => (
                      <ArbRow key={result.rowKey} result={result} />
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
