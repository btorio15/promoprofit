"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getStats, type StatsDTO } from "@/app/actions/get-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import { ANY_SPORT_KEY, WEEKDAYS, type SportWeekdayRow } from "@/domain/stats/profitStats";
import { HistorySection } from "@/components/stats/HistorySection";
import { StatsCard } from "@/components/stats/StatsCard";
import { STATS_RANGES, STATS_RANGE_LABELS, type StatsRange } from "@/domain/stats/statsRange";

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** Statistics is group-wide; say so, so it is not read as the member's own numbers. */
const SCOPE_NOTE = (
  <p className="text-sm text-muted-foreground">
    Group-wide: every member&apos;s promos and Mark done results. Available profit is each promo at its own max stake
    against every hedge book, so it will not match the Dashboard, which uses your books and your caps.
  </p>
);

function formatWhen(iso: string | null): string {
  return iso === null ? "None yet" : `${TIME_FORMATTER.format(new Date(iso))} MT`;
}

/**
 * Stats tab: long-term theoretical profit from the scheduled odds runs.
 * Money stays as decimal strings (formatUsd); numbers are used only to plot
 * bar heights. Times are Denver time, matching the rest of the app.
 */
export function StatsScreen({ active }: { active: boolean }) {
  const [range, setRange] = useState<StatsRange>("all");
  const [loaded, setLoaded] = useState<StatsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || loaded?.range === range) return;
    let cancelled = false;
    getStats(range)
      .then((dto) => {
        if (!cancelled) {
          setLoaded(dto);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the Stats tab. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [active, range, loaded?.range]);

  // Only show figures for the range that is selected; while it loads, show a skeleton.
  const stats = loaded?.range === range ? loaded : null;
  const picker = <RangePicker value={range} onChange={setRange} />;

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {picker}
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (stats === null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {picker}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (stats.runs === 0) {
    return (
      <div className="flex flex-col gap-8">
        {picker}
        {SCOPE_NOTE}
        <Card>
          <CardHeader>
            <CardTitle>No scrape runs in this range</CardTitle>
            <CardDescription>
              Scheduled runs (three times a day) record profit from the first run onward. Older daily data is below.
            </CardDescription>
          </CardHeader>
        </Card>
        <HistorySection history={stats.history} funnel={stats.funnel} label={STATS_RANGE_LABELS[range]} />
      </div>
    );
  }

  const chartData = stats.timeOfDay.map((bucket) => ({
    hour: hourLabel(bucket.hour),
    avg: Number(bucket.avgProfit),
    avgLabel: formatUsd(bucket.avgProfit),
    runs: bucket.runs,
  }));
  const bestHour = stats.timeOfDay.reduce<(typeof stats.timeOfDay)[number] | null>(
    (best, bucket) => (best === null || Number(bucket.avgProfit) > Number(best.avgProfit) ? bucket : best),
    null,
  );

  return (
    <div className="flex flex-col gap-8">
      {picker}
      {SCOPE_NOTE}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Summary">
        <Stat label="Scrape runs" value={String(stats.runs)} />
        <Stat label="First run" value={formatWhen(stats.firstRunAt)} small />
        <Stat label="Latest run" value={formatWhen(stats.lastRunAt)} small />
        <Stat label="Most profitable hour" value={bestHour ? hourLabel(bestHour.hour) : "None"} />
      </section>

      <StatsCard
        title="Profit by time of day"
        description="Average profit available per scrape run, by Denver hour. Runs that found nothing profitable count as $0."
      >
        <div className="flex flex-col gap-4">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={56} />
                <Tooltip
                  formatter={(_value, _name, item) => [
                    item.payload.avgLabel,
                    `Avg over ${item.payload.runs} run${item.payload.runs === 1 ? "" : "s"}`,
                  ]}
                />
                <Bar dataKey="avg" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hour (Denver)</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Avg profit per run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.timeOfDay.map((bucket) => (
                <TableRow key={bucket.hour}>
                  <TableCell>{hourLabel(bucket.hour)}</TableCell>
                  <TableCell className="text-right num">{bucket.runs}</TableCell>
                  <TableCell className="text-right num">{formatUsd(bucket.avgProfit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </StatsCard>

      <StatsCard
        title="Profit by sport and game day"
        description="Profit by weekday its game starts (Denver time); strongest day highlighted. Each promo counts once, at its best. A promo covering several days sits on its first day."
      >
        <div className="flex flex-col gap-3">
          {stats.sportWeekday.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled-game profit recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sport</TableHead>
                    {WEEKDAYS.map((day) => (
                      <TableHead key={day} className="text-right">
                        {day}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.sportWeekday.rows.map((row) => (
                    <SportRow key={row.sportKey} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {stats.sportWeekday.unscheduledPromos > 0 ? (
            <p className="text-xs text-muted-foreground">
              {stats.sportWeekday.unscheduledPromos} promo{stats.sportWeekday.unscheduledPromos === 1 ? "" : "s"} had no game
              time and are not in this table.
            </p>
          ) : null}
        </div>
      </StatsCard>

      <HistorySection history={stats.history} funnel={stats.funnel} label={STATS_RANGE_LABELS[range]} />
    </div>
  );
}

function RangePicker({ value, onChange }: { value: StatsRange; onChange: (range: StatsRange) => void }) {
  return (
    <div role="group" aria-label="Time range" className="flex flex-wrap gap-2">
      {STATS_RANGES.map((range) => {
        const selected = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range)}
            className={`min-h-11 rounded-md border px-4 text-sm font-medium transition-colors ${
              selected ? "border-foreground bg-foreground text-background" : "border-border bg-secondary hover:bg-muted"
            }`}
          >
            {STATS_RANGE_LABELS[range]}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={small ? "text-sm font-medium" : "text-2xl font-semibold num"}>{value}</span>
      </CardContent>
    </Card>
  );
}

function SportRow({ row }: { row: SportWeekdayRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.sportKey === ANY_SPORT_KEY ? "Any sport" : getSportLabel(row.sportKey)}</TableCell>
      {WEEKDAYS.map((day) => {
        const isBest = row.bestDay === day;
        const value = row.byDay[day];
        return (
          <TableCell
            key={day}
            className={`text-right num ${isBest ? "font-semibold text-emerald-500" : ""}`}
          >
            {value === "0.00" ? "—" : formatUsd(value)}
          </TableCell>
        );
      })}
      <TableCell className="text-right num font-semibold">{formatUsd(row.total)}</TableCell>
    </TableRow>
  );
}
