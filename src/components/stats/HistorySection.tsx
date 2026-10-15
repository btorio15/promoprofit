import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

/**
 * One color per sport, from the Okabe-Ito palette, which stays distinguishable
 * for the common types of color blindness.
 */
const SPORT_COLORS: Record<string, string> = {
  americanfootball_nfl: "#0072B2",
  americanfootball_ncaaf: "#E69F00",
  basketball_nba: "#009E73",
  basketball_ncaab: "#CC79A7",
  baseball_mlb: "#D55E00",
  icehockey_nhl: "#56B4E9",
  [UNKNOWN_SPORT]: "#5E3C99",
};
const FALLBACK_COLOR = "#999999";

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
  const [showNotExtracted, setShowNotExtracted] = useState(true);
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
  // One stacked segment per promo record, so a day's bar shows each bet as a separate block.
  const maxSegments = Math.max(0, ...history.days.map((day) => day.segments.length));
  const segmentKeys = Array.from({ length: maxSegments }, (_, index) => `seg${index}`);
  const chartData = history.days.map((day) => {
    const sportTotals = Object.entries(day.bySport)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .map(([sportKey, total]) => ({ sport: sportName(sportKey), total: formatUsd(total) }));
    const row: Record<string, string | number | unknown> = {
      day: dayLabel(day.date),
      totalLabel: formatUsd(day.total),
      sportTotals,
    };
    day.segments.forEach((segment, index) => {
      row[`seg${index}`] = Number(segment.profit);
      row[`seg${index}Sport`] = segment.sportKey;
      row[`seg${index}Done`] = segment.done;
    });
    return row;
  });
  const sportsInRange = history.sports.map((sport) => sport.key ?? UNKNOWN_SPORT);
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
          <Figure label="Available profit" value={formatUsd(history.grandTotal)} note="best profit each promo showed" />
          <Figure label="Extracted profit" value={formatUsd(history.extractedTotal)} note="recorded when marked done" />
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

        <StatsCard
          title="Daily profit by sport"
          description="One block per promo; color = extracted (by sport), white = not extracted; gaps separate each bet"
          defaultOpen
        >
          <SportLegend
            sportKeys={sportsInRange}
            showNotExtracted={showNotExtracted}
            onToggleNotExtracted={() => setShowNotExtracted((shown) => !shown)}
          />
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={56} />
                <Tooltip content={(props) => <DayTotalsTooltip {...props} />} />
                {segmentKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="profit"
                    shape={(props: SegmentShapeProps) => segmentShape(props, showNotExtracted)}
                  />
                ))}
              </BarChart>
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

/** Fill for promo blocks that are available but not marked done. */
const NOT_DONE_COLOR = "#ffffff";

/** Pixels of background left between stacked promo blocks, so each bet reads as its own block. */
const SEGMENT_GAP = 2;

type SegmentShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  dataKey?: unknown;
  payload?: unknown;
};

/** Draws one promo block inside a day's stacked bar, colored by its sport, with a gap above and below. */
function segmentShape(props: SegmentShapeProps, showNotExtracted: boolean) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  if (height <= 0 || width <= 0) return <g />;
  const key = String(props.dataKey);
  const payload = (props.payload ?? {}) as Record<string, unknown>;
  const sport = String(payload[`${key}Sport`] ?? UNKNOWN_SPORT);
  const done = payload[`${key}Done`] === true;
  // Blocks not yet extracted are white; the key can hide them.
  if (!done && !showNotExtracted) return <g />;
  const fill = done ? colorFor(sport) : NOT_DONE_COLOR;
  const blockHeight = Math.max(height - SEGMENT_GAP, 1);
  return <rect x={x} y={y + (height - blockHeight) / 2} width={width} height={blockHeight} rx={2} fill={fill} />;
}

/** Hover text for a day's bar: the day's total, then each sport's total for that day. */
function DayTotalsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const totals = (row.sportTotals as { sport: string; total: string }[] | undefined) ?? [];
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold">
        {String(label)}: {String(row.totalLabel)} total
      </div>
      {totals.map((entry) => (
        <div key={entry.sport} className="flex justify-between gap-4">
          <span>{entry.sport}</span>
          <span className="num">{entry.total}</span>
        </div>
      ))}
    </div>
  );
}

function SportLegend({
  sportKeys,
  showNotExtracted,
  onToggleNotExtracted,
}: {
  sportKeys: string[];
  showNotExtracted: boolean;
  onToggleNotExtracted: () => void;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Key">
      {sportKeys.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: colorFor(key) }} aria-hidden="true" />
          {sportName(key)}
        </li>
      ))}
      <li>
        <button
          type="button"
          aria-pressed={showNotExtracted}
          onClick={onToggleNotExtracted}
          className={`flex min-h-8 items-center gap-1.5 rounded-md px-2 ${showNotExtracted ? "" : "opacity-50"}`}
        >
          <span className="inline-block size-2.5 rounded-sm border border-border bg-white" aria-hidden="true" />
          Not extracted
          <span className="text-muted-foreground">({showNotExtracted ? "shown" : "hidden"})</span>
        </button>
      </li>
    </ul>
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
  const grandExtracted = groups.reduce((sum, group) => sum.plus(group.extracted), new Decimal(0));
  const averagePerPromo = promoCount === 0 ? "0.00" : grand.dividedBy(promoCount).toDecimalPlaces(2).toFixed(2);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Promos</TableHead>
            <TableHead className="text-right">Profit per promo</TableHead>
            <TableHead className="text-right">Available profit</TableHead>
            <TableHead className="text-right">Extracted profit</TableHead>
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
              <TableCell className="text-right num">{formatUsd(group.extracted)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">All</TableCell>
            <TableCell className="text-right num font-semibold">{promoCount}</TableCell>
            <TableCell className="text-right num font-semibold">{formatUsd(averagePerPromo)}</TableCell>
            <TableCell className="text-right num font-semibold">{formatUsd(grand.toFixed(2))}</TableCell>
            <TableCell className="text-right num font-semibold">{formatUsd(grandExtracted.toFixed(2))}</TableCell>
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
