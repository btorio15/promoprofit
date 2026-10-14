import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import type { DailyHistoryStats } from "@/domain/stats/dailyHistory";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

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
  const chartData = history.days.map((day) => ({
    day: dayLabel(day.date),
    total: Number(day.total),
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
        <section className="grid grid-cols-3 gap-4" aria-label="Since Sep 27 summary">
          <Figure label="Total profit" value={formatUsd(history.grandTotal)} />
          <Figure label="Days recorded" value={String(history.dayCount)} />
          <Figure label="Promo records" value={String(history.promoCount)} />
        </section>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={56} />
              <Tooltip formatter={(_value, _name, item) => [item.payload.totalLabel, "Daily total"]} />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sport</TableHead>
                <TableHead className="text-right">Promo records</TableHead>
                <TableHead className="text-right">Total profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.sports.map((sport) => (
                <TableRow key={sport.sportKey ?? "unknown"}>
                  <TableCell className="font-medium">
                    {sport.sportKey === null ? "Unknown sport" : getSportLabel(sport.sportKey)}
                  </TableCell>
                  <TableCell className="text-right num">{sport.promos}</TableCell>
                  <TableCell className="text-right num">{formatUsd(sport.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
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
