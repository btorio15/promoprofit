"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUsd } from "@/lib/format";
import type { RunningTotal } from "@/domain/stats/runningTotal";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

function shortDate(date: string): string {
  return DAY_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

/**
 * Dark hero panel on the Statistics tab: running total of profit offered
 * across the site (each promo once, at its best). Strings carry the money;
 * Number() is used only to plot.
 */
export function ProfitOfferedHero({ running }: { running: RunningTotal }) {
  const data = running.points.map((p) => ({
    date: p.date,
    label: shortDate(p.date),
    total: Number(p.total),
    totalLabel: formatUsd(p.total),
    addedLabel: formatUsd(p.added),
  }));
  const hasData = running.points.length > 0 && running.since !== null;
  const since = running.since === null ? "" : shortDate(running.since);
  const caption = hasData
    ? `offered across the site since ${since} · ${running.promoCount} promo${running.promoCount === 1 ? "" : "s"}`
    : "No promos recorded in this range yet.";

  return (
    <section
      aria-label="Profit offered"
      className="sportsbook-hero relative isolate overflow-hidden px-6 py-8 text-white sm:px-10 sm:py-12"
    >
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#9dbdff]">Profit offered</p>
      <p className="text-5xl font-semibold tracking-tight sm:text-6xl">{formatUsd(running.total)}</p>
      <p className="mt-2 text-sm text-white/70">{caption}</p>
      {hasData ? (
        <>
          <div
            role="img"
            aria-label={`Running total of profit offered: ${formatUsd(running.total)} across ${running.promoCount} promos since ${since}`}
            className="mt-6 h-[200px] w-full sm:h-[260px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitOfferedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  width={48}
                />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,0.4)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="border border-white/20 bg-[#0d0d0d] px-3 py-2 text-xs text-white shadow-lg">
                        <div className="text-white/60">{p.label}</div>
                        <div className="text-base font-semibold">{p.totalLabel}</div>
                        <div className="text-white/70">+{p.addedLabel} added that day</div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey="total"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#profitOfferedFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--primary)", stroke: "#fff", strokeWidth: 1 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Running total of profit offered by day</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Running total</th>
              </tr>
            </thead>
            <tbody>
              {running.points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{formatUsd(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <div className="sportsbook-court" aria-hidden="true" />
    </section>
  );
}
