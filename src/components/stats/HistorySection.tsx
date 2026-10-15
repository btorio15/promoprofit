import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Decimal from "decimal.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import {
  SMALL_SAMPLE_THRESHOLD,
  UNKNOWN_SPORT,
  type DailyHistoryStats,
  type GroupTotal,
} from "@/domain/stats/dailyHistory";
import type { PromoFunnelStats } from "@/domain/stats/promoFunnel";
import { StatsCard } from "@/components/stats/StatsCard";

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

const TYPE_LABELS: Record<string, string> = {
  bonus_bet: "Bonus bet",
  profit_boost: "Profit boost",
  unknown: "Unknown type",
};

const BOOK_LABELS: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  ballybet: "BallyBet",
  betmgm: "BetMGM",
  espnbet: "theScore Bet",
  hardrockbet: "Hard Rock Bet",
  betrivers: "BetRivers",
};

function colorFor(sportKey: string): string {
  return SPORT_COLORS[sportKey] ?? FALLBACK_COLOR;
}

function sportName(sportKey: string | null): string {
  if (sportKey === null || sportKey === UNKNOWN_SPORT) return "Unknown sport";
  return getSportLabel(sportKey);
}

function typeName(type: string | null): string {
  return type === null ? TYPE_LABELS.unknown : (TYPE_LABELS[type] ?? type);
}

function bookName(bookKey: string | null): string {
  return bookKey === null ? "Unknown book" : (BOOK_LABELS[bookKey] ?? bookKey);
}

/** "2026-09-27" -> "Sep 27". Parsed as UTC noon so the Denver date never shifts. */
function dayLabel(date: string): string {
  return DAY_FORMATTER.format(new Date(`${date}T12:00:00Z`));
}

function pctLabel(pct: string | null): string {
  return pct === null ? "No data" : `${pct}%`;
}

/**
 * "Since Sep 27": the older daily promo profit (promo_profit_observations),
 * shown next to the scheduled snapshot figures. The headline figures stay
 * visible; the charts and tables open from their own dropdowns.
 */
export function HistorySection({
  history,
  funnel,
  label,
}: {
  history: DailyHistoryStats;
  funnel: PromoFunnelStats;
  /** Range name shown in the title, e.g. "7 days" or "All time". */
  label: string;
}) {
  if (history.promoCount === 0 || history.days.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardDescription>No older daily promo profit recorded in this range.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const first = history.days[0].date;
  const last = history.days[history.days.length - 1].date;
  const sportKeys = history.sports.map((sport) => sport.key ?? UNKNOWN_SPORT);
  const chartData = history.days.map((day) => ({
    day: dayLabel(day.date),
    ...day.bySport,
    total: Number(day.total),
    cumulative: Number(day.cumulative),
    totalLabel: formatUsd(day.total),
    cumulativeLabel: formatUsd(day.cumulative),
    zero: day.zero,
  }));
  const unknownSportPromos = history.sports.find((sport) => sport.key === UNKNOWN_SPORT)?.promos ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily promo profit: {label}</CardTitle>
        <CardDescription>
          Best profit per promo per day, from {dayLabel(first)} to {dayLabel(last)}. Days with no observations count as
          zero. Each day is one total, so this section has no time-of-day detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Since Sep 27 summary">
          <Figure label="Total profit" value={formatUsd(history.grandTotal)} />
          <Figure
            label="Avg profit per day"
            value={formatUsd(history.avgPerDay)}
            note={`over ${history.dayCount} days (${history.zeroDayCount} with no promos)`}
          />
          <Figure label="Avg profit per promo" value={formatUsd(history.avgPerPromo)} note={`${history.promoCount} records`} />
          <Figure
            label="Bonus conversion"
            value={pctLabel(history.bonusConversion.pct)}
            note={`${history.bonusConversion.records} bonus bets${history.bonusConversion.excluded ? `, ${history.bonusConversion.excluded} excluded` : ""}`}
          />
          <Figure
            label="Boost return on max stake"
            value={pctLabel(history.boostConversion.pct)}
            note={`${history.boostConversion.records} boosts`}
          />
        </section>

        {unknownSportPromos > 0 ? (
          <p className="text-xs text-muted-foreground">
            {unknownSportPromos} promo record{unknownSportPromos === 1 ? "" : "s"} have no sport because the promo was never
            matched to a game. They are counted in every total above and grouped as Unknown sport.
          </p>
        ) : null}

        <StatsCard title="Daily profit by sport" description="Stacked by sport, one bar per day" defaultOpen>
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
        </StatsCard>

        <StatsCard title="Cumulative profit" description="Running total from the first day">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={56} />
                <Tooltip formatter={(_value, _name, item) => [item.payload.cumulativeLabel, "Cumulative"]} />
                <Line type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </StatsCard>

        <StatsCard title="By sport" description="Profit per promo and total for each sport">
          <GroupTable groups={history.sports} nameOf={sportName} colorOf={(key) => colorFor(key ?? UNKNOWN_SPORT)} />
        </StatsCard>

        <StatsCard title="By promo type" description="Bonus bets and profit boosts">
          <GroupTable groups={history.types} nameOf={typeName} />
        </StatsCard>

        <StatsCard title="By book" description="Profit per promo and total for each sportsbook">
          <GroupTable groups={history.books} nameOf={bookName} />
        </StatsCard>

        <StatsCard title="Promo funnel" description="Available, marked done, expired, and per-book stake limits">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-5" aria-label="Promo funnel">
            <Figure label="Promos recorded" value={String(funnel.totals.total)} />
            <Figure label="Available now" value={String(funnel.totals.available)} />
            <Figure label="Marked done" value={String(funnel.totals.markedDone)} />
            <Figure label="Expired unused" value={String(funnel.totals.expiredUnused)} />
            <Figure label="Dismissed / pending" value={`${funnel.totals.dismissed} / ${funnel.totals.pendingReview}`} />
          </section>
          <p className="text-xs text-muted-foreground">
            &quot;Marked done&quot; means a member marked the promo done in the app. Claims at the sportsbook are not tracked yet.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead className="text-right">Promos</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Removed</TableHead>
                  <TableHead className="text-right">Avg max stake</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnel.books.map((book) => (
                  <TableRow key={book.bookKey}>
                    <TableCell className="font-medium">{bookName(book.bookKey)}</TableCell>
                    <TableCell className="text-right num">{book.promos}</TableCell>
                    <TableCell className="text-right num">{book.active}</TableCell>
                    <TableCell className="text-right num">{book.removed}</TableCell>
                    <TableCell className="text-right num">
                      {book.avgMaxStake === null ? "No data" : formatUsd(book.avgMaxStake)}
                      {book.maxStakeKnown > 0 && book.maxStakeKnown < SMALL_SAMPLE_THRESHOLD ? (
                        <span className="ml-1 text-xs text-muted-foreground">(small sample)</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </StatsCard>
      </CardContent>
    </Card>
  );
}

function GroupTable({
  groups,
  nameOf,
  colorOf,
}: {
  groups: GroupTotal[];
  nameOf: (key: string | null) => string;
  colorOf?: (key: string | null) => string;
}) {
  const promoCount = groups.reduce((sum, group) => sum + group.promos, 0);
  const grand = groups.reduce((sum, group) => sum.plus(group.total), new Decimal(0));
  const averagePerPromo = promoCount === 0 ? "0.00" : grand.dividedBy(promoCount).toDecimalPlaces(2).toFixed(2);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Promos</TableHead>
            <TableHead className="text-right">Profit per promo</TableHead>
            <TableHead className="text-right">Total profit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.key ?? "none"}>
              <TableCell className="font-medium">
                {colorOf ? (
                  <span
                    className="mr-2 inline-block size-2.5 rounded-sm align-middle"
                    style={{ backgroundColor: colorOf(group.key) }}
                    aria-hidden="true"
                  />
                ) : null}
                {nameOf(group.key)}
                {group.smallSample ? <span className="ml-2 text-xs text-muted-foreground">small sample</span> : null}
              </TableCell>
              <TableCell className="text-right num">{group.promos}</TableCell>
              <TableCell className="text-right num">{formatUsd(group.avgPerPromo)}</TableCell>
              <TableCell className="text-right num">{formatUsd(group.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">All</TableCell>
            <TableCell className="text-right num font-semibold">{promoCount}</TableCell>
            <TableCell className="text-right num font-semibold">{formatUsd(averagePerPromo)}</TableCell>
            <TableCell className="text-right num font-semibold">{formatUsd(grand.toFixed(2))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold num">{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}
