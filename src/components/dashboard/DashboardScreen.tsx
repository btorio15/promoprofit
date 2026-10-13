"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardStats, type DashboardStatsDTO } from "@/app/actions/get-dashboard-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import { WEEKDAYS, type SportWeekdayRow } from "@/domain/stats/profitStats";

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

function formatWhen(iso: string | null): string {
  return iso === null ? "None yet" : `${TIME_FORMATTER.format(new Date(iso))} MT`;
}

/**
 * Dashboard tab: long-term theoretical profit from the scheduled odds runs.
 * Money stays as decimal strings (formatUsd); numbers are used only to plot
 * bar heights. Times are Denver time, matching the rest of the app.
 */
export function DashboardScreen({ active }: { active: boolean }) {
  const [stats, setStats] = useState<DashboardStatsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || stats !== null) return;
    let cancelled = false;
    getDashboardStats()
      .then((dto) => {
        if (!cancelled) setStats(dto);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the dashboard. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [active, stats]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (stats === null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (stats.snapshotRuns === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No snapshots yet</CardTitle>
          <CardDescription>
            The dashboard fills in after the first scheduled run (three times a day) records profit.
          </CardDescription>
        </CardHeader>
      </Card>
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
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Summary">
        <Stat label="Scheduled runs" value={String(stats.snapshotRuns)} />
        <Stat label="First run" value={formatWhen(stats.firstCapturedAt)} small />
        <Stat label="Latest run" value={formatWhen(stats.lastCapturedAt)} small />
        <Stat label="Most profitable hour" value={bestHour ? hourLabel(bestHour.hour) : "None"} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Profit by time of day</CardTitle>
          <CardDescription>
            Average profit available in a scheduled run, by the Denver hour it ran. Each run totals every promo that was
            profitable at that moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit by sport and game day</CardTitle>
          <CardDescription>
            Each promo counts once, at its best profit seen, on the weekday its game starts (Denver time). The strongest
            day for each sport is highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
        </CardContent>
      </Card>
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
      <TableCell className="font-medium">{getSportLabel(row.sportKey)}</TableCell>
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
