# Phase 7: Dashboard - Pattern Map

**Mapped:** 2026-10-14
**Files analyzed:** 14 (7 new, 7 modified/renamed/deleted)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domain/promos/dashboardTotals.ts` (new) | utility (pure domain) | transform | `src/domain/promos/profitSeries.ts` | exact |
| `src/domain/promos/dashboardTotals.test.ts` (new) | test | transform | `src/domain/promos/profitSeries.test.ts` | exact |
| `src/components/opportunities/dashboardTotalsView.ts` (new) | utility (view model) | transform | `src/components/opportunities/profitGraphView.ts` | exact |
| `src/components/opportunities/dashboardTotalsView.test.ts` (new) | test | transform | `src/components/opportunities/profitGraphView.test.ts` | exact |
| `src/components/opportunities/DashboardTotals.tsx` (new) | component | request-response (props only) | `src/components/promos/ProfitSummary.tsx` (card) + `ProfitGraph.tsx` (SHELL, skeleton) | exact |
| `src/app/actions/get-opportunities.ts` (mod) | server action | request-response | itself | exact |
| `src/domain/opportunities/types.ts` (mod) | model (types) | request-response | itself (`OpportunitiesTotals`, line 36) | exact |
| `src/app/actions/get-opportunities.test.ts` (mod) | test | request-response | itself (readFileSync guard at ~455) | exact |
| `src/components/opportunities/OpportunitiesScreen.tsx` (mod) | component | request-response | itself | exact |
| `src/components/opportunities/ProfitGraph.tsx` + `profitGraphView.ts` (mod, "since Oct 13" suffix) | component / view model | transform | themselves | exact |
| `src/components/AppShell.tsx` (mod) | component (shell) | event-driven (tab state) | itself | exact |
| `src/components/stats/StatsScreen.tsx` (git mv from `components/dashboard/DashboardScreen.tsx`) | component | request-response | itself | exact |
| `src/components/promos/ProfitSummary.tsx` (delete) | component | n/a | n/a | n/a |
| `src/components/appShellTabs.test.ts`, `src/components/promos/noProfitSummary.test.ts` (new) | test (source-inspection) | n/a | `get-opportunities.test.ts` lines 455-460 | role-match |

## Pattern Assignments

### `src/domain/promos/dashboardTotals.ts` (utility, transform)

**Analog:** `src/domain/promos/profitSeries.ts`

**Imports and header convention** (lines 1-10):
```typescript
/**
 * Pure series math for the profit graph (Phase 6).
 * ... All money is 2dp strings; arithmetic is decimal.js only.
 */
import Decimal from "decimal.js";
import { addDays, denverDate } from "./profitTotals";
```
Also import `ProfitSeriesDTO` from `./profitSeries`, `DonePromoDTO` and `sumProfitExtracted` from `./doneSnapshot`.

**Per-day Decimal accumulation pattern** (profitSeries.ts lines 83-88) - copy for extracted windows from RAW completions (do NOT clip at graphStartDay; that clip is the Pitfall 2 trap):
```typescript
for (const c of completions) {
  const day = denverDate(c.completedAt);
  if (day < graphStartDay || day > today) continue;   // <-- do NOT copy this line; Phase 7 extracted is unclipped (D-18)
  extractedByDay.set(day, (extractedByDay.get(day) ?? new Decimal(0)).plus(new Decimal(c.profitExtracted)));
}
```
For Phase 7 filter only `day >= from && day <= today` with `from = addDays(today, -6)` / `addDays(today, -29)` (same as `rangeStartDate`, profitSeries.ts line 106; `periodStartDates(now)` in profitTotals.ts lines 96-103 returns `{today, weekStart, monthStart}` and is the simplest source).

**Available from series days** - `cumulate`-style Decimal sum (profitSeries.ts lines 110-128). Available windows = `series.days.filter(d => d.date >= from).reduce(plus Decimal(d.available))`. Return `available: null` when `series.status !== "ready"` (DTO shape in RESEARCH "Recommended DTO").

**Exact-cent sum** (doneSnapshot.ts lines 330-332): `rows.reduce((sum, r) => sum.plus(r.profitExtracted), new Decimal(0)).toFixed(2)`. All-time extracted = `ctx.totalExtracted` (already this sum over `doneRows`).

**Counts**: `promosDone = doneRows.length` (`toDoneRows`, doneSnapshot.ts lines 325-327, already drops pair-marker rows). Average: `new Decimal(total).div(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)`, `null` when n = 0. Best: strict `greaterThan` over `doneRows` (ordered completedAt desc, so ties keep most recent); null when max is 0.00. Pair label: `kind === "pair"` -> `` `${bookName} pair` `` (DonePromoDTO fields at doneSnapshot.ts lines 189-209: `kind`, `bookName`, `title`, `profitExtracted`).

**Error handling:** none; pure, never throws. Series `not-ready`/`error` are values, not exceptions.

---

### `src/domain/promos/dashboardTotals.test.ts` (test)

**Analog:** `src/domain/promos/profitSeries.test.ts`

**Structure** (lines 1-30, 43-60): `import { describe, expect, it } from "vitest"`, a tiny row helper (`const row = (promoId, denverDate, profit) => ({...})`), `describe` blocks named by decision id (e.g. "buildDailyGains extracted (D-10, D-04)"), DST/MDT bucket cases using explicit UTC `new Date("2026-10-05T05:30:00Z")` and `new Date("2026-11-02T06:30:00Z")`. Reuse those exact instants for the "windows" tests. Fixtures per RESEARCH: 12 raw rows (2 markers 0.00), total 33.09, 10 done, avg "3.31", best 9.05 DraftKings "College Football 50% Profit Boost"; half-cent case 10.01/2 -> "5.01"; 0.10+0.20 -> "0.30".

---

### `src/components/opportunities/dashboardTotalsView.ts` (view model, transform)

**Analog:** `src/components/opportunities/profitGraphView.ts`

**Imports + header** (lines 1-17):
```typescript
/**
 * Pure view model for the ProfitGraph (Phase 6 ...). No React, no recharts. All displayed money stays a server decimal string run through formatUsd.
 */
import { formatUsd } from "@/lib/format";
```
Import `formatTickDate` from `./profitGraphView` for "Oct 13" (lines 47-50: `` `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` ``) - derive "Available since <graphStartDay>", never hard-code.

**State-enum return pattern** (profitGraphView.ts lines 69-90): function takes DTO, returns plain data with copy strings; `not-ready` branch returns fixed heading/body and zero values. Mirror for `available === null` -> "Not ready yet" cells and no "of $X available" captions.

---

### `src/components/opportunities/dashboardTotalsView.test.ts` (test)

**Analog:** `profitGraphView.test.ts` lines 1-49: `ready(...)` fixture helper, `expect(v.heading).toBe("...")` exact-copy assertions. Test "Available since" with a day other than Oct 13, singular "1 promo done", "No promos done yet".

---

### `src/components/opportunities/DashboardTotals.tsx` (component)

**Analog:** `src/components/promos/ProfitSummary.tsx` (card styling) and `ProfitGraph.tsx` (skeleton/shell).

**Card shell** (ProfitSummary.tsx line 26; same constant in ProfitGraph.tsx line 26):
```tsx
<div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4">
```
**Label/value cell** (ProfitSummary.tsx lines 28-31 and 38-41):
```tsx
<div className="flex flex-col gap-1">
  <span className="text-sm text-muted-foreground">Total profit extracted</span>
  <span className="num text-3xl font-semibold text-primary">{formatUsd(totalExtracted)}</span>
</div>
```
Use `text-lg` per UI-SPEC/Pitfall 8 (not `text-3xl`), a `grid grid-cols-2 sm:grid-cols-4` layout, no footnote. Extracted green = `text-primary`, available = `text-muted-foreground` (as in ProfitGraph.tsx lines 104-108).

**Loading skeleton** (ProfitGraph.tsx lines 41-50):
```tsx
<div className={SHELL} aria-busy="true">
  <Skeleton className="h-5 w-3/4" />
  ...
</div>
```
`"use client"` at top; imports `formatUsd` from `@/lib/format`, `Skeleton` from `@/components/ui/skeleton`. Truncated best-promo name: CSS `truncate` plus full text in `title`/`aria-label`. Keep `.tsx` thin; strings come from `dashboardTotalsView.ts`. Always visible regardless of `STORAGE_KEYS.profitGraphHidden`.

---

### `src/app/actions/get-opportunities.ts` (server action, modify)

**Analog:** itself.

- Keep `requireUser()` first (line 43) and the zod strict input (lines 32-34).
- Remove `loadAvailableProfit` import (line 7) and call (line 56); KEEP `recordCurrentProfitObservations` (line 55) per Pitfall 7.
- `sumPortfolioProfit` (line 16, used at lines 152-156) feeds only the old `totals.totalProfit`; grep `get-promos.ts` before removing import, remove here if `dashboard` replaces `totals`.
- Replace the `respond` helper (lines 94-106). Current:
```typescript
const respond = (emptyVariant, totalProfit: string, sources): OpportunitiesResponse => ({
  status: "ok", emptyVariant, oddsFetchedAt, extendedOddsFetchedAt,
  totals: { totalProfit, totalExtracted: ctx.totalExtracted, availableProfit },
  profitSeries, sources,
});
```
New: build `const dashboard = buildDashboardTotals({ series: profitSeries, completions: ctx.completions, doneRows: ctx.doneRows, totalExtracted: ctx.totalExtracted, now })` right after `profitSeries` (line 92) and put `dashboard` where `totals` was. Every branch already funnels through `respond`, so the `totalProfit` parameter and the `sumPortfolioProfit` block can be dropped.
- Do not import any odds client (guard test at get-opportunities.test.ts line 455-460 bans `ingestion/odds/client`, `fetchSportOdds`, `listSports`).

### `src/domain/opportunities/types.ts` (modify)

Replace `OpportunitiesTotals` (line 36-40) and the `totals: OpportunitiesTotals;` field (line 49) with `dashboard: DashboardTotalsDTO`. The `AvailableProfit` import may become unused; remove if so.

### `src/app/actions/get-opportunities.test.ts` (modify)

Update `totals.*` assertions (~186, 202, 251, 254-265, 339) to `dashboard.*`; drop or leave the `mockGetProfitObservationsSince` mock. Add assertion that `dashboard` exists in no-odds / none-scraped / empty-feed branches. Source-inspection pattern to copy (lines 455-460):
```typescript
const src = readFileSync(join(__dirname, "get-opportunities.ts"), "utf8");
for (const banned of ["ingestion/odds/client", "fetchSportOdds", "listSports"]) {
  expect(src).not.toContain(banned);
}
```
Add `loadAvailableProfit` to that banned list.

---

### `src/components/opportunities/OpportunitiesScreen.tsx` (modify)

**Analog:** itself.

- Remove `ProfitSummary` import (line 21) and block (lines 178-184).
- Header (lines 155-158) -> h1 "Dashboard", subtitle "Your profit so far, and the best money available right now at your books."
- Insert `<DashboardTotals ... />` before `<ProfitGraph>` (line 160). Pass loading and data using the same null/loading logic the graph uses at lines 160-169 (`showSkeleton`, `ok`, `loadFailed`).
- Add an `<h2>` "Opportunities" immediately before `<SortSwitch>` (line 186).
- Update the docblock (lines 82-87) "Opportunities tab" -> Dashboard.

### `src/components/opportunities/ProfitGraph.tsx` and `profitGraphView.ts` (modify, Pitfall 9)

Add `sinceLabel: string | null` to `GraphView` (profitGraphView.ts lines 30-37) set to `formatTickDate(series.graphStartDay)` for the ready/chart path (only for `range === "all"` per RESEARCH). Keep `ariaFor` (lines 65-67) unchanged. Render a muted suffix after the headline paragraph at ProfitGraph.tsx lines 104-108. Extend `profitGraphView.test.ts`. Do not touch graph math.

---

### `src/components/AppShell.tsx` (modify)

**Analog:** itself. Edits (all in one change, Pitfall 1):
- Line 15 import -> `import { StatsScreen } from "@/components/stats/StatsScreen";`
- Line 24: `type ActiveTab = "opportunities" | "stats" | "arbitrage" | "promos" | "tools";`
- Lines 66-71: first trigger label "Opportunities" -> "Dashboard" (keep `value="opportunities"`); second trigger `value="stats"` label "Stats":
```tsx
<TabsTrigger value="stats" className="min-h-11 whitespace-nowrap">Stats</TabsTrigger>
```
- Lines 106-108: `<TabsContent value="stats" keepMounted><StatsScreen active={activeTab === "stats"} /></TabsContent>`
- Update docblock (lines 26-37) tab list text.
- `onNavigate` typing at OpportunitiesScreen line 38 (`"promos" | "arbitrage"`) is unaffected.

### `src/components/stats/StatsScreen.tsx` (git mv from `src/components/dashboard/DashboardScreen.tsx`)

Rename export `DashboardScreen` -> `StatsScreen` (line ~38) and docblock "Dashboard tab" -> "Stats tab". Fix user-facing copy: line ~48 "Couldn't load the dashboard. Try again in a moment." and line ~73 "The dashboard fills in after the first scheduled run..." must say "stats". `getDashboardStats` / `DashboardStatsDTO` server names may stay (Open Question 2).

---

### Source-inspection guard tests (new)

**Analog:** `get-opportunities.test.ts` lines 455-460 (`readFileSync(join(__dirname, ...), "utf8")` then `expect(src).not.toContain(...)`). Also `src/ingestion/promos/boundary.test.ts` lines 1-90 for walking a directory (`readdirSync`/`statSync`, REPO_ROOT join) - copy for the "no `ProfitSummary` import anywhere under `src/components`" check.
- `src/components/appShellTabs.test.ts`: read `AppShell.tsx`, assert trigger labels appear in order Dashboard, Stats, Arbitrage, Promos, Tools; `not.toContain('value="dashboard"')`; contains `value="stats"`.
- `src/components/promos/noProfitSummary.test.ts`: no file under `src/components` contains `ProfitSummary`; `PromosScreen.tsx` has no summary reference.
- Vitest is node env, `include: src/**/*.test.ts`; no jsdom; do not add DOM tests.

## Shared Patterns

### Exact money (decimal.js, strings across the wire)
**Source:** `src/domain/promos/profitSeries.ts` (lines 77-98), `doneSnapshot.ts` lines 330-332.
**Apply to:** `dashboardTotals.ts`. No `Number(...)` on money (only pixel plotting does that in `profitGraphView.ts` lines 98-99). Display via `formatUsd` from `@/lib/format` only.

### Denver-day bucketing
**Source:** `src/domain/promos/profitTotals.ts` `denverDate` (line 75), `addDays` (line 108), `periodStartDates` (line 96; week = today-6, month = today-29, both inclusive of today).
**Apply to:** window math. Never use local Date methods.

### Auth and member scoping
**Source:** `get-opportunities.ts` lines 43-52: `requireUser()` first; input `z.strictObject({ precision })` with no userId or ranges from the client; all reads use `user.userId`.
**Apply to:** any change in the action. Add no new client inputs.

### Pure-logic-plus-thin-component
**Source:** `profitGraphView.ts` + `ProfitGraph.tsx`. All copy and state in a `.ts` view model unit-tested in Vitest node env; `.tsx` only maps to markup.
**Apply to:** `DashboardTotals.tsx`.

### Card styling and phone ergonomics
**Source:** `ProfitGraph.tsx` line 26 `SHELL`; `min-h-11` touch targets; plain-English copy, no emoji.
**Apply to:** `DashboardTotals.tsx`, "Opportunities" heading.

## No Analog Found

None. Every file has an in-repo analog. The only novel logic (window sums from raw completions plus best-promo selection) composes existing helpers (`denverDate`, `addDays`, `periodStartDates`, `toDoneRows`, `sumProfitExtracted`).

## Metadata

**Analog search scope:** `src/domain/promos`, `src/domain/opportunities`, `src/components/{opportunities,promos,dashboard}`, `src/components/AppShell.tsx`, `src/app/actions`, `src/ingestion/promos/boundary.test.ts`
**Files scanned:** ~15 read in full or in targeted ranges
**Pattern extraction date:** 2026-10-14
**Note:** Teammate (dico1108) pushes to main; `git fetch` before planning and executing since AppShell/feedContext/get-opportunities may change.
