"use client";

import { useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  GRAPH_RANGE_LABELS,
  parseGraphRange,
  type GraphRange,
  type ProfitSeriesDTO,
} from "@/domain/promos/profitSeries";
import { formatUsd } from "@/lib/format";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import {
  buildGraphView,
  formatTickDate,
  formatTooltipDate,
  tooltipGainLine,
  type ChartPoint,
} from "./profitGraphView";

const SHELL = "flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4";
const RANGES: GraphRange[] = ["7d", "30d", "all"];

/**
 * Phase 6 STATS-01..06 profit graph, reused by the Phase 7 Dashboard.
 * All displayed figures are server decimal strings formatted with formatUsd;
 * numbers are used only for pixel plotting.
 */
export function ProfitGraph({ series, loading }: { series: ProfitSeriesDTO | null; loading: boolean }) {
  const chartId = useId();
  const [rangeStored, setRange] = usePersistentString(STORAGE_KEYS.profitGraphRange, "30d");
  const range = parseGraphRange(rangeStored);
  const [hiddenStored, setHidden] = usePersistentString(STORAGE_KEYS.profitGraphHidden, "0");
  const hidden = hiddenStored === "1";

  if (series === null) {
    if (!loading) return null;
    return (
      <div className={SHELL} aria-busy="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-9 w-full sm:w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const view = buildGraphView(series, range);

  if (hidden) {
    return (
      <section aria-label="Profit graph" className={SHELL}>
        <div className="flex min-h-11 items-center">
          <span className="text-sm font-semibold">Profit graph</span>
          <Button
            variant="ghost"
            className="ml-auto min-h-11 font-normal"
            aria-expanded={false}
            onClick={() => setHidden("0")}
          >
            Show graph
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </section>
    );
  }

  const hideButton = (
    <Button
      variant="ghost"
      className="ml-auto min-h-11 font-normal"
      aria-expanded={true}
      aria-controls={chartId}
      onClick={() => setHidden("1")}
    >
      Hide graph
      <ChevronUp className="size-4" />
    </Button>
  );

  if (view.state === "not-ready" || view.state === "error") {
    return (
      <section aria-label="Profit graph" className={SHELL}>
        <div className="flex items-start">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{view.heading}</span>
            <span className="text-sm text-muted-foreground">{view.body}</span>
          </div>
          {hideButton}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Profit graph" className={SHELL}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <p className="text-lg" aria-label={view.ariaLabel}>
            Extracted <span className="num font-semibold text-primary">{formatUsd(view.headline.extracted)}</span> of{" "}
            <span className="num font-semibold text-muted-foreground">{formatUsd(view.headline.available)}</span>{" "}
            available
          </p>
          {hideButton}
        </div>
        <ToggleGroup
          aria-label="Graph range"
          className="w-full sm:w-auto"
          value={[range]}
          onValueChange={(values) => {
            const next = values[0];
            // Ignore deselect: one range is always active.
            if (next === "7d" || next === "30d" || next === "all") setRange(next);
          }}
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r} value={r} className="min-h-11 min-w-11 px-4 text-sm">
              {GRAPH_RANGE_LABELS[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {view.state === "empty" ? (
        <div id={chartId} className="flex h-40 flex-col items-center justify-center gap-2 text-center">
          <span className="text-sm font-semibold">{view.heading}</span>
          <span className="text-sm text-muted-foreground">{view.body}</span>
        </div>
      ) : (
        <>
          <div
            id={chartId}
            style={{ height: 160, touchAction: "pan-y" }}
            role="img"
            aria-label={view.ariaLabel}
          >
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={view.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                  minTickGap={48}
                  tickFormatter={(value: string, index: number) =>
                    view.points[index]?.anchor ? "" : formatTickDate(value)
                  }
                />
                <YAxis hide domain={[0, "auto"]} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  isAnimationActive={false}
                  content={<GraphTooltip />}
                />
                <Line
                  type="stepAfter"
                  dataKey="availableY"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "var(--muted-foreground)", stroke: "var(--secondary)", strokeWidth: 2 }}
                />
                <Line
                  type="stepAfter"
                  dataKey="extractedY"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--secondary)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">
            Each promo counts once, on the day it first showed up, at the best profit it reached.
          </p>
        </>
      )}
    </section>
  );
}

function GraphTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.anchor) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-2 text-sm shadow">
      <span className="text-xs text-muted-foreground">{formatTooltipDate(point.date)}</span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-full bg-muted-foreground" aria-hidden="true" />
        Available so far <span className="num font-semibold">{formatUsd(point.availableTotal)}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        Extracted so far <span className="num font-semibold">{formatUsd(point.extractedTotal)}</span>
      </span>
      <span className="text-xs text-muted-foreground">{tooltipGainLine(point)}</span>
    </div>
  );
}
