import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import { UNKNOWN_SPORT, type DailyHistoryStats } from "@/domain/stats/dailyHistory";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** One color per sport, so each day's stacked bar shows where its profit came from. */
const SPORT_COLORS: Record<string, string> = {
  americanfootball_nfl: "#2563eb",
  americanfootball_ncaaf: "#16a34a",
  basketball_nba: "#f97316",
  basketball_ncaab: "#9333ea",
  baseball_mlb: "#dc2626",
  icehockey_nhl: "#0891b2",
  [UNKNOWN_SPORT]: "#9ca3af",
};
const FALLBACK_COLOR = "#64748b";

function colorFor(sportKey: string): string {
  return SPORT_COLORS[sportKey] ?? FALLBACK_COLOR;
}

function sportName(sportKey: string | null): string {
  if (sportKey === null || sportKey === UNKNOWN_SPORT) return "Unknown sport";
  return getSportLabel(sportKey);
}

/** "2026-09-27" -> "Sep 27". Parsed as UTC noon so the Denver date never shifts. */
function dayLabel(date: string): string {
  return DAY_FORMATTER.format(new Date(`${date}T12:00:00Z`));
}

/**
 * "Since Sep 27": the older daily promo profit (promo_profit_observations),
 * shown next to the scheduled snapshot figures. Each day is one total, so
 * there is no time-of-day detail here.
 */
export function HistorySection({ history }: { history: DailyHistoryStats }) {
  if (history.dayCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Since Sep 27</CardTitle>
          <CardDescription>No older daily profit data yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const first = history.days[0].date;
  const last = history.days[history.days.length - 1].date;
  const sportKeys = history.sports.map((sport) => sport.sportKey ?? UNKNOWN_SPORT);
  const chartData = history.days.map((day) => ({
    day: dayLabel(day.date),
    ...day.bySport,
    totalLabel: formatUsd(day.total),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Since Sep 27</CardTitle>
        <CardDescription>
          Best profit per promo per day, from before scheduled snapshots began ({dayLabel(first)} to {dayLabel(last)}).
          Each day is one total, so this section has no time-of-day detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Since Sep 27 summary">
          <Figure label="Total profit" value={formatUsd(history.grandTotal)} />
          <Figure label="Avg profit per day" value={formatUsd(history.avgPerDay)} />
          <Figure label="Avg profit per promo" value={formatUsd(history.avgPerPromo)} />
          <Figure label="Days / promo records" value={`${history.dayCount} / ${history.promoCount}`} />
        </section>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={56} />
              <Tooltip
                formatter={(value, name) => [formatUsd(Number(value).toFixed(2)), sportName(String(name))]}
                labelFormatter={(label, payload) => `${label}: ${payload?.[0]?.payload?.totalLabel ?? ""} total`}
              />
              <Legend formatter={(value) => sportName(String(value))} />
              {sportKeys.map((sportKey) => (
                <Bar key={sportKey} dataKey={sportKey} stackId="profit" fill={colorFor(sportKey)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sport</TableHead>
                <TableHead className="text-right">Promos</TableHead>
                <TableHead className="text-right">Profit per promo</TableHead>
                <TableHead className="text-right">Avg per day</TableHead>
                <TableHead className="text-right">Total profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.sports.map((sport) => (
                <TableRow key={sport.sportKey ?? UNKNOWN_SPORT}>
                  <TableCell className="font-medium">
                    <span
                      className="mr-2 inline-block size-2.5 rounded-sm align-middle"
                      style={{ backgroundColor: colorFor(sport.sportKey ?? UNKNOWN_SPORT) }}
                      aria-hidden="true"
                    />
                    {sportName(sport.sportKey)}
                  </TableCell>
                  <TableCell className="text-right num">{sport.promos}</TableCell>
                  <TableCell className="text-right num">{formatUsd(sport.avgPerPromo)}</TableCell>
                  <TableCell className="text-right num">{formatUsd(sport.avgPerDay)}</TableCell>
                  <TableCell className="text-right num">{formatUsd(sport.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">All sports</TableCell>
                <TableCell className="text-right num font-semibold">{history.promoCount}</TableCell>
                <TableCell className="text-right num font-semibold">{formatUsd(history.avgPerPromo)}</TableCell>
                <TableCell className="text-right num font-semibold">{formatUsd(history.avgPerDay)}</TableCell>
                <TableCell className="text-right num font-semibold">{formatUsd(history.grandTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold num">{value}</span>
    </div>
  );
}
