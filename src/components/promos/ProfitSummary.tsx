"use client";

import type { AvailableProfit } from "@/domain/promos/profitTotals";
import { formatUsd } from "@/lib/format";

interface ProfitSummaryProps {
  totalProfit: string;
  availableProfit: AvailableProfit;
}

/**
 * quick-260927-n12: always-visible headline ("Total profit possible") plus
 * a compact today/week/month "profit available" row, shown in EVERY "ok"
 * state (including every empty-state variant) so the numbers never
 * disappear just because the live feed is momentarily empty. Plain div +
 * Tailwind, matching ScrapeStatusPanel.tsx's card treatment -- no new UI
 * dependency.
 */
export function ProfitSummary({ totalProfit, availableProfit }: ProfitSummaryProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Total profit possible</span>
        <span className="num text-3xl font-semibold text-primary">{formatUsd(totalProfit)}</span>
        <span className="text-sm text-muted-foreground">
          At your books, not counting promos you&apos;ve marked used
        </span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">Available today</span>
          <span className="num text-lg font-medium">{formatUsd(availableProfit.today)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">This week</span>
          <span className="num text-lg font-medium">{formatUsd(availableProfit.week)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">This month</span>
          <span className="num text-lg font-medium">{formatUsd(availableProfit.month)}</span>
        </div>
      </div>
      <span className="text-sm text-muted-foreground">
        Best guaranteed profit seen per promo, at your books (Mountain Time; weeks start Monday)
      </span>
    </div>
  );
}
