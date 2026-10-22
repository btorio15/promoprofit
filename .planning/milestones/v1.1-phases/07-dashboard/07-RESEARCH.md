# Phase 7: Dashboard - Research

**Researched:** 2026-10-14
**Domain:** In-repo refactor and UI composition (Next.js 16 App Router, Drizzle, decimal.js, Vitest). No new libraries.
**Confidence:** HIGH. Every finding comes from reading the repo at HEAD (cb30c2c, which includes teammate commit 456ea6e). Nothing here depends on external docs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** "Available" totals (all-time, last 7 days, last 30 days) come from the member's OWN record, `member_profit_observations`, the same source and rules as the graph's grey line (own books, "Your cap", private promos, pairs counted once, best value per promo, Denver days). NOT the old group-wide `promo_profit_observations` / `loadAvailableProfit` path. Consequence accepted: available only counts from the graph start day (Oct 13, 2026).
- **D-02:** "Extracted" headline is all-time: every `promo_completions.profit_extracted` for the member, including promos marked done before Oct 13 (owner currently $33.09).
- **D-03:** "Last 7 days" and "Last 30 days" each show extracted with available, e.g. "Last 7 days: $10.79 extracted of $2.56 available". Extracted placed on the Denver day of `completed_at` (same rule as the graph's green line, Phase 6 D-10); windows use the existing Denver-day helpers (today minus 6 / minus 29).
- **D-04:** Labels state the time basis: "Extracted all-time" and "Available since Oct 13" (graph start day, formatted short; derive it, don't hard-code).
- **D-05:** All money exact to the cent (decimal.js, `formatUsd`); nothing displayed is derived from float math.
- **D-06:** Option B, two cards: (1) totals card with the four totals and a counts line under them, (2) the existing graph card below it, unchanged, keeping its own range headline ("Extracted $X of $Y available") framed as "since Oct 13". Then the feed.
- **D-07:** "Hide graph" hides only the graph card; the totals card is always visible.
- **D-08:** Phone: totals card is a 2 x 2 grid (Extracted all-time / Available since Oct 13 on top; Last 7 days / Last 30 days below) with counts as one wrapping line under it. Must satisfy success criterion 5. Desktop shows the four totals in one row.
- **D-09:** Counts are all-time (do not follow the 7d / 30d / All picker).
- **D-10:** A pair counts as one promo: "promos done" excludes the pair's `0.00` member-marker completion row; average = total extracted / promos done. Owner check value today: 10 done, $33.09, avg $3.31 (12 raw rows).
- **D-11:** "Best promo" shows $ + book + promo name (name trimmed to fit).
- **D-12:** Tab trigger reads "Dashboard" (internal tab id may stay `opportunities`, Claude's discretion).
- **D-13:** Page heading "Dashboard" with subtitle "Your profit so far, and the best money available right now at your books."
- **D-14:** Feed gets a small "Opportunities" section heading above the "Sort by" row.
- **D-15:** The teammate's separate "Dashboard" tab (`DashboardScreen.tsx`, `get-dashboard-stats.ts`) is renamed "Stats" and kept as its own tab; its internal id becomes `stats`.
- **D-16:** Tab order: Dashboard, Stats, Arbitrage, Promos, Tools.
- **D-17:** Owner accepts the teammate's schedule change (3 scheduled runs/day also refresh moneyline odds + record profit; Vercel cron removed). Phase 7 must not add any further automatic Odds API spending.

### Claude's Discretion
- Best promo when it is a pair: label "<BookA> + <BookB> pair" with the pair's profit.
- Empty states: no completions -> counts line "No promos done yet", extracted $0.00; no member observations yet -> "Available since <start>" $0.00 (or the graph's not-ready wording if the table is unavailable).
- New component vs reshaping `ProfitSummary`; totals computed in `get-opportunities` / `feedContext` (preferred: same request) or a sibling loader.
- Removing now-unused code paths (`loadAvailableProfit` callers, unused fields on the Promos response) if nothing else needs them.

### Deferred Ideas (OUT OF SCOPE)
- No-sweat bets misread as bonus bets by the promo reader.
- Audit page follow-ups (CI checks, Odds API fetch timeouts, scrape-failure alerts, per-IP login limit, table retention).
- 2-bet pair solver 1c rounding todo.
- Out of scope per the phase boundary: new stats beyond those listed (by-book / by-type breakdowns, history tables), changing the graph's math or start day, the feed's ranking.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STATS-07 | Opportunities tab becomes Dashboard in nav; graph, totals and counts above the full feed | AppShell label change plus teammate-tab rename to `stats` (Pitfall 1); OpportunitiesScreen layout order (Architecture) |
| STATS-08 | Headline totals: extracted, available, last 7, last 30 | New pure module `dashboardTotals.ts` fed by `profitSeries.days` + raw completions (Pattern 1) |
| STATS-09 | Counts: promos completed, average per promo, best single promo | Derived from `toDoneRows(...)`, which already drops pair-marker rows (Pattern 2) |
| STATS-10 | Promos tab no longer shows the profit summary | Already true in UI: `PromosScreen.tsx` has no summary reference. The only `ProfitSummary` consumer is `OpportunitiesScreen`; delete the component and add a guard test (Pitfall 6) |
</phase_requirements>

## Summary

This phase is mostly wiring over data the server already loads. `getOpportunities` already has everything needed in one request: `ctx.completions` (raw completion rows incl. snapshot), `ctx.doneRows` (pair-marker rows already dropped, with `bookName`, `title`, `profitExtracted`, `kind`), `ctx.totalExtracted` (exact-cent sum), and `profitSeries` (per-day `available`/`extracted`, `graphStartDay`, `today`, built from `member_profit_observations`). No new DB query, no new Odds API usage, no new dependency. Totals and counts should be computed by one new pure module (Decimal-only) and attached to the existing `OpportunitiesResponse`, replacing the old `totals` block.

The two real traps. First, the teammate's commit already put a tab with id and label `dashboard` in `AppShell.tsx`, and `ActiveTab` includes it; renaming the home tab label to "Dashboard" before renaming theirs yields two tabs with the same label. Second, the Phase 6 series DROPS completions dated before `graphStartDay` (`buildDailyGains` skips `day < graphStartDay`), so summing `profitSeries.days[].extracted` would undercount "Extracted all-time" and 7/30-day extracted for the owner (who has pre-Oct 13 completions). Extracted figures MUST come from raw completions; only the available figures come from the series days.

**Primary recommendation:** add `src/domain/promos/dashboardTotals.ts` (pure, Decimal-only, table-tested) producing a `DashboardTotalsDTO`; compute it inside `getOpportunities` from `ctx.completions`, `ctx.doneRows`, and the already-built `profitSeries`; drop the `loadAvailableProfit` call there; render it with a new `DashboardTotals.tsx` whose display strings come from a pure `dashboardTotalsView.ts` (same pattern as `profitGraphView.ts`) so all copy is unit-testable in Vitest's node environment.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Totals / counts math (extracted, available, windows, avg, best) | API / Backend (server action, pure domain module) | none | Money correctness; CLAUDE.md requires exact decimal math; client must not recompute or accept client ranges (established pattern: `requireUser()` first, no client-supplied ranges) |
| Member scoping of completions and observations | Database / Storage (queries filter by session `userId`) | API | Already enforced by `getPromoCompletions(userId)` and `getMemberProfitHistory(userId)` |
| Formatting ("$33.09", "Oct 13", counts line copy) | Browser / Client (pure view-model helper) | none | Display only; `formatUsd` string handling, no arithmetic |
| Tab nav, tab ids, mounting | Browser / Client (`AppShell`) | none | State-only |
| Hide/show graph persistence | Browser / Client (localStorage via `usePersistentString`) | none | Existing; totals card ignores it |

## Standard Stack

No new packages. Everything is already installed. [VERIFIED: package.json grep, repo read]

### Core (already present, reuse)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| decimal.js | ^10.6.0 | All money math (sums, average) | CLAUDE.md mandates it; used by every domain module |
| vitest | ^5.0.2 | Unit tests (`vitest run`, node env, `src/**/*.test.ts` only) | Existing infra |
| zod | 4.x | Already validates action input (`z.strictObject`) | Keep unchanged |
| recharts | existing | Graph (unchanged) | Phase 6 |
| shadcn `skeleton`, `tabs`, `button` | existing | Skeleton + tab bar | UI-SPEC: no new blocks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Totals computed in `getOpportunities` | Separate `getDashboardTotals` action | Extra round trip, second `requireUser`, duplicated completions read. Rejected (CONTEXT prefers same request) |
| Summing series `extracted` for 7/30/all-time | Raw completions | Series is clipped at `graphStartDay`; wrong for D-02 (see Pitfall 2) |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed in this phase. Slopcheck not applicable.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser: OpportunitiesScreen (Dashboard tab)
   | getOpportunities({precision})   (Server Action, requireUser() first)
   v
getOpportunities
   |-- loadMemberFeedContext(userId) --> completions (raw), doneRows (markers dropped), totalExtracted
   |-- recordMemberProfitObservations(...)   (existing, writes today's grey-line data)
   |-- loadProfitSeries(userId, completions) --> ProfitSeriesDTO {ready: today, graphStartDay, days[]} | not-ready | error
   |-- buildDashboardTotals(series, completions, doneRows, totalExtracted, now)   <-- NEW pure, decimal.js
   v
OpportunitiesResponse { ..., dashboard: DashboardTotalsDTO, profitSeries, sources }
   v
Client render order:
  header (Dashboard + subtitle) -> DashboardTotals card (always visible) -> ProfitGraph (hide-able)
  -> stale-odds line -> "Opportunities" h2 -> SortSwitch -> sources (existing)
```

### Recommended Project Structure
```
src/domain/promos/dashboardTotals.ts        # pure: DTO type + buildDashboardTotals()
src/domain/promos/dashboardTotals.test.ts   # table-driven
src/components/opportunities/dashboardTotalsView.ts       # pure copy/format view model
src/components/opportunities/dashboardTotalsView.test.ts
src/components/opportunities/DashboardTotals.tsx          # thin presentational component
src/components/stats/StatsScreen.tsx        # git mv from components/dashboard/DashboardScreen.tsx
```
`src/components/promos/ProfitSummary.tsx` is deleted.

### Pattern 1: Totals from series days (available) + raw completions (extracted)
**What:** `available` for each window = Decimal sum of `series.days[].available` where `date >= windowStart` (windowStart = `addDays(today,-6)` / `addDays(today,-29)`; all-time = every day). The series is already clipped to `graphStartDay`, so no extra clamping is needed, and "each promo counts once on its first day at best profit" is inherited, so the totals cannot disagree with the graph's grey line. `extracted` for each window = Decimal sum of `completion.profitExtracted` where `denverDate(completedAt) >= windowStart && <= today`; all-time = `ctx.totalExtracted` (or recompute from all completions; marker rows are `0.00` so they never change the sum).
**When to use:** always for this phase.
**Example:**
```typescript
// Source: repo (src/domain/promos/profitSeries.ts, profitTotals.ts) - recommended shape
import Decimal from "decimal.js";
import { addDays, denverDate } from "./profitTotals";

export function sumWindow<T>(items: T[], day: (t: T) => string, amt: (t: T) => string, from: string, to: string) {
  return items
    .filter((t) => day(t) >= from && day(t) <= to)
    .reduce((s, t) => s.plus(new Decimal(amt(t))), new Decimal(0))
    .toFixed(2);
}
// windows: last7 from addDays(today,-6), last30 from addDays(today,-29), both through today (inclusive)
```

### Pattern 2: Counts from `doneRows`
**What:** `promosDone = doneRows.length` (`toDoneRows` already filters `isPairMemberSnapshot`, so a pair is one row; this gives 12 raw -> 10 for the owner). `average = totalExtracted / promosDone` via `new Decimal(total).div(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)`; `null` when `promosDone === 0`. Best = row with max `new Decimal(profitExtracted)`; tie-break deterministic (keep the first seen in `completedAt desc` order, i.e. the most recent, using strict `greaterThan`). Skip best entirely when the max is `0.00` (all legacy/no_hedge) and show no "best" segment. Label: `kind === "pair"` -> `"{legA.bookName} + {legB.bookName} pair"` (the pair DTO's `bookName` is already `"A + B"`, so `${bookName} pair`); otherwise `bookName` + `title`. Include the full untruncated name in the DTO; truncation is CSS only (`truncate`), full text in `title`/`aria-label` per UI-SPEC.
**Note:** `DonePromoDTO.title` for singles is the snapshot `promo.title` (e.g. "College Football 50% Profit Boost"); for legacy rows it is a derived title. [VERIFIED: doneSnapshot.ts]

### Pattern 3: View-model module for copy (testable without a DOM)
`vitest.config.ts` includes only `src/**/*.test.ts` in the `node` environment; there is no jsdom or Testing Library. Follow `profitGraphView.ts`: put all strings (labels, "Available since Oct 13", "10 promos done · avg $3.31 each · best $9.05 · ...", singular, empty, not-ready) in a pure function returning plain data; the `.tsx` component only maps it to markup. Reuse `formatTickDate` from `profitGraphView.ts` for "Oct 13". [VERIFIED: vitest.config.ts, profitGraphView.ts]

### Pattern 4: Response shape change
Replace `OpportunitiesTotals` (`totalProfit`, `totalExtracted`, `availableProfit`) with the dashboard DTO. Careful: `totals.totalProfit` is still asserted in `get-opportunities.test.ts` (lines ~186, 202, 251, 339) and `availableProfit` at ~254-265. Either keep `totals.totalProfit` temporarily or update those tests; recommended: delete `totals` and rewrite those assertions to the new DTO (no consumer remains after `ProfitSummary` is removed). `sumPortfolioProfit` call in `get-opportunities.ts` then becomes unused there (still used by `get-promos.ts`? verify with grep before removing).

### Anti-Patterns to Avoid
- **Summing `profitSeries.days[].extracted` for headline extracted:** drops pre-start completions (Pitfall 2).
- **Float math or `Number(...)` on money to compute windows/average:** CLAUDE.md prohibition. Only pixel plotting may use numbers.
- **Counting `snapshot` marker rows or using raw `completions.length`:** gives 12 not 10.
- **Client-side recompute or passing ranges from the client:** keep server-only.
- **Re-fetching on tab switch / adding odds refreshes:** violates D-17 and the "panels stay mounted" rule.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Denver day bucketing / window starts | New date math | `denverDate`, `addDays`, `periodStartDates` in `profitTotals.ts` | DST-safe; same rule as graph |
| Currency formatting | `toLocaleString`/`Number` | `formatUsd` (string-based) | No float conversion |
| Short date "Oct 13" | New formatter | `formatTickDate` in `profitGraphView.ts` | Already tested, UTC-safe |
| Pair vs single detection in done list | Parse snapshots again | `toDoneRows` + `DonePromoDTO.kind` | Marker filtering already centralized |
| Sum of extracted | Reduce with numbers | `sumProfitExtracted` (doneSnapshot.ts) / Decimal | Exact |
| Persisted graph hide state | New storage key | existing `STORAGE_KEYS.profitGraphHidden` | Totals card ignores it |

## Runtime State Inventory

This is not a data rename, but the tab-id rename touches persisted client state. Answers:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None. No DB column, key, or collection uses the tab names. | None |
| Live service config | None. | None |
| OS-registered state | None. | None |
| Secrets / env vars | None. | None |
| Build artifacts | None. Possible stale Turbopack CSS in local dev (noted in 06-07-SUMMARY) when checking new Tailwind classes. | Restart dev server if new classes don't appear |
| Client persisted UI state | `activeTab` is plain `useState` (not URL- or localStorage-synced) per AppShell docblock. No tab id is persisted. `profitGraphRange` / `profitGraphHidden` keys unchanged. | None |

## Common Pitfalls

### Pitfall 1: Two "Dashboard" tabs / id collision
**What goes wrong:** `AppShell.tsx` already has `ActiveTab = "opportunities" | "dashboard" | ...`, a `TabsTrigger value="dashboard"` labeled "Dashboard", and `TabsContent value="dashboard"` rendering `DashboardScreen`. Renaming only the "Opportunities" label produces two identical labels.
**How to avoid:** in one change: `ActiveTab` -> `"opportunities" | "stats" | ...`; trigger/content value `stats`, label "Stats"; `<StatsScreen active={activeTab === "stats"} />`; home trigger label "Dashboard" (keep id `opportunities` per D-12 discretion; lowest risk because `onNavigate`, docblock and `useState("opportunities")` stay). Order in `TabsList`: Dashboard, Stats, Arbitrage, Promos, Tools (already the teammate's slot). Rename `components/dashboard/DashboardScreen.tsx` -> `components/stats/StatsScreen.tsx` (git mv), export `StatsScreen`; fix user-facing copy there: "Couldn't load the dashboard..." (line ~48) and "The dashboard fills in after the first scheduled run..." (line ~73) must say "stats". Optionally rename comments in `profitStats.ts`, `get-dashboard-stats.ts`, `schema.ts`, workflow comment; the action name `getDashboardStats` can stay (server-side, no UI exposure) to avoid churn, but is confusing, so rename to `getStatsData` only if cheap. Update the AppShell docblock ("Opportunities | Arbitrage..." text).
**Warning signs:** `grep -rn '"dashboard"' src/components/AppShell.tsx` returns anything after the change.

### Pitfall 2: Series clips pre-start completions
**What goes wrong:** `buildDailyGains` skips `day < graphStartDay` for completions (documented: "drops pre-start completions"). Using series `extracted` makes Extracted all-time lower than $33.09 and may understate 7/30-day extracted.
**How to avoid:** extracted from raw `ctx.completions` (and `ctx.totalExtracted` for all-time). Note this means the totals card's 30-day extracted can exceed the graph's "30d" headline extracted when pre-Oct 13 completions fall in the window; that is expected and consistent with D-02/D-04's time-basis labels. Test it explicitly. See Open Question 1.

### Pitfall 3: Series not ready / error
**What goes wrong:** `loadProfitSeries` returns `{status:"not-ready"}` or `{status:"error"}` (never throws). Code that assumes `days` crashes or shows wrong $0.00.
**How to avoid:** DTO has `available: { allTime, last7, last30 } | null` plus `availableSince: string | null`. `null` -> UI shows "Not ready yet" for the Available cells and drops the `of $X available` captions (UI-SPEC); extracted figures and counts still render. When `ready` but no rows yet, `days` still has one entry (graphStartDay == today) with "0.00", giving $0.00 as UI-SPEC wants.

### Pitfall 4: Pair rows and "best promo"
**What goes wrong:** Choosing best from raw `completions` can select the `0.00` marker or double-count; or labeling a pair with only the primary leg's book.
**How to avoid:** use `doneRows` (markers dropped) and branch on `kind === "pair"` for the label. The pair's `profitExtracted` is already the pair profit on the primary row.

### Pitfall 5: Rounding of the average
**What goes wrong:** `Decimal#toFixed(2)` uses the configured rounding (default ROUND_HALF_UP; no global `Decimal.set` exists in the app, only a local clone in `pairMath.ts`, [VERIFIED: grep]), so it works, but make it explicit so a future config change cannot alter it. 33.09 / 10 = 3.309 -> "3.31" (matches owner check).
**How to avoid:** `toDecimalPlaces(2, Decimal.ROUND_HALF_UP)`; test with a half-cent case (e.g. 10.01 / 2 = 5.005 -> "5.01").

### Pitfall 6: STATS-10 is "already done" in UI, don't invent work, but guard it
**What's true:** `PromosScreen.tsx` contains no profit summary reference; the only importer of `ProfitSummary` is `OpportunitiesScreen.tsx`. [VERIFIED: grep]. The Promos response still carries `totalProfit` / `totalExtracted` / `availableProfit` (`dto.ts` lines ~216-233; `get-promos.ts` calls `loadAvailableProfit`), but no UI reads them. Removing them is optional (CONTEXT discretion) and touches the large `get-promos.test.ts` (assertions at ~1301-1332); recommend leaving the Promos response alone this phase (risk > benefit), delete only `ProfitSummary.tsx`, and add a source-level guard test (the repo already uses `readFileSync` source-inspection in `get-opportunities.test.ts`) asserting no `ProfitSummary` import remains under `src/components`.

### Pitfall 7: Stale doc text and removed query
**What goes wrong:** `get-opportunities.ts` still calls `loadAvailableProfit(...)` (an extra DB read of group-wide observations) which no longer feeds anything after D-01. Leaving it wastes a query and keeps the old source alive; `get-opportunities.test.ts` mocks `getProfitObservationsSince` for it.
**How to avoid:** remove that call and the `availableProfit` field there. KEEP `recordCurrentProfitObservations(...)` (it writes the group `promo_profit_observations` that `getPromos` and other readers still use; its removal is out of scope and could starve those readers). Update the mocks in `get-opportunities.test.ts` accordingly (leave `mockGetProfitObservationsSince` harmlessly or remove it).

### Pitfall 8: Phone height (success criterion 5)
**What goes wrong:** `text-3xl` values and the footnote from `ProfitSummary` push the first opportunity off-screen.
**How to avoid:** follow UI-SPEC (text-lg values, 2x2 grid, no footnote, ~200px max card height). Manual check at 360px with graph hidden and shown. Remember the page already has `py-12`, `gap-8`, header, tab bar, status bar, so use `gap-4` inside the card and don't add extra wrappers.

### Pitfall 9: Graph headline framing touches graph code
The graph's "since Oct 13" suffix (D-06, UI-SPEC copy row) needs `graphStartDay` in the view. `buildGraphView` returns `headline` only; add `sinceLabel: string | null` (formatted via `formatTickDate(series.graphStartDay)` when `series.status === "ready"` and `range === "all"`), keep `ariaLabel` format unchanged, and render a muted suffix in `ProfitGraph.tsx`. Extend `profitGraphView.test.ts` for it. Do not change graph math.

## Code Examples

### Recommended DTO
```typescript
// Source: recommended design; types follow src/domain/promos/profitSeries.ts conventions
export interface DashboardTotalsDTO {
  extractedAllTime: string;                 // 2dp
  extractedLast7: string;
  extractedLast30: string;
  /** null when the member observation table/series is unavailable. */
  available: { sinceDay: string; allTime: string; last7: string; last30: string } | null;
  counts: {
    promosDone: number;                     // pairs count once
    averageExtracted: string | null;        // null when promosDone === 0
    best: { profit: string; bookLabel: string; name: string; isPair: boolean } | null;
  };
}
```

### Server wiring (inside getOpportunities, after profitSeries is built)
```typescript
const dashboard = buildDashboardTotals({
  series: profitSeries,                 // ProfitSeriesDTO
  completions: ctx.completions,         // raw rows: completedAt + profitExtracted
  doneRows: ctx.doneRows,               // markers already dropped
  totalExtracted: ctx.totalExtracted,
  now,
});
// respond(...) puts `dashboard` where `totals` used to be; every branch (incl. "no-odds") already goes through respond().
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Group-wide `promo_profit_observations` via `loadAvailableProfit` for summary | Member-own `member_profit_observations` via `profitSeries` | Phase 6 / D-01 | Totals must match the graph's grey line |
| `ProfitSummary` big two-number card | Compact 4-total card + counts line | Phase 7 | Phone fit |

**Deprecated/outdated after this phase:** `ProfitSummary.tsx`, the `totals` block on `OpportunitiesResponse`, the `loadAvailableProfit` call in `getOpportunities` (still used by `getPromos`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Promos done" should include `no_hedge` ($0.00) and legacy ($0.00) done rows (D-10 only excludes pair markers), so average is total / all non-marker rows. Owner's 10 / $3.31 check value presumably matches this. | Pattern 2 | If owner expects $0 rows excluded, average and count differ; confirm against owner's real data after build (10 done) |
| A2 | Last-7/30 extracted should use raw completions (unclipped by graph start), while available is clipped. Not explicitly decided; inferred from D-02/D-03/D-04. | Pitfall 2 | If owner expects 7/30 extracted to match graph range headline exactly, they will differ for windows overlapping pre-Oct 13 |
| A3 | Best-promo tie-break = most recent completion; hide best when max is $0.00. | Pattern 2 | Cosmetic |
| A4 | Keeping `recordCurrentProfitObservations` in `getOpportunities` is correct because other screens read the group table. | Pitfall 7 | Low; verify readers with grep before deleting |
| A5 | Leaving the Promos response's unused summary fields is acceptable (CONTEXT lists removal as discretionary). | Pitfall 6 | None functionally |

## Open Questions

1. **Should 7/30-day "extracted" include completions before the graph start day?**
   - Known: D-02 says all-time includes them; D-03 says windows place extracted on the Denver day of `completed_at`; UI-SPEC example "$10.79 extracted of $2.56 available" has extracted far above available, suggesting unclipped.
   - Unclear: whether the owner would be surprised that the 30-day totals-card extracted can exceed the graph's 30d headline.
   - Recommendation: use raw completions (unclipped). The "Available since Oct 13" label already explains the asymmetry; mention it in the plan's verification notes.
2. **Rename `getDashboardStats` / `DashboardStatsDTO`?** Recommendation: leave server names, rename only the component and user-facing copy; cheap and avoids touching teammate files unnecessarily (teammate pushes directly to main: run `git fetch` and rebase before planning and again before executing, per project memory).

## Environment Availability

Step 2.6: SKIPPED for new tooling. The phase needs only the existing Node/npm toolchain (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`), which the repo already uses. No DB migration, no new service. DB-backed behavior is exercised through the existing mocked action tests, so no live Neon connection is needed for automated checks; the manual 360px check needs `npm run dev` and the owner's data.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.2, `environment: "node"` |
| Config file | `/Users/bentorio/Desktop/Personal Projects/promoprofit/vitest.config.ts` (`include: src/**/*.test.ts`, alias `@` -> `src`) |
| Quick run command | `npx vitest run src/domain/promos/dashboardTotals.test.ts src/components/opportunities/dashboardTotalsView.test.ts src/components/opportunities/profitGraphView.test.ts` |
| Full suite command | `npm test` (`vitest run`) plus `npx tsc --noEmit` and `npm run lint` |

No component/DOM testing exists (no jsdom, no Testing Library, and the include glob excludes `.tsx`). Do NOT add a DOM test stack for this phase (no new dependencies per UI-SPEC); push logic into pure `.ts` modules and keep `.tsx` thin.

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STATS-08 | extracted all-time = sum of all completions incl. pre-start day, markers contribute 0 | unit | `npx vitest run src/domain/promos/dashboardTotals.test.ts -t "extracted all-time"` | Wave 0 |
| STATS-08 | 7d window = today-6 inclusive, 30d = today-29, Denver-day bucketing across a UTC midnight and DST end | unit | `... -t "windows"` | Wave 0 |
| STATS-08 | available all-time/7d/30d from series days equals graph sums; clipped at graph start; `null` when series not-ready/error; `$0.00` when ready and empty | unit | `... -t "available"` | Wave 0 |
| STATS-08 | cent-exact: values like 0.10 + 0.20 sum to "0.30", no float artifacts | unit | `... -t "exact"` | Wave 0 |
| STATS-09 | promosDone excludes pair marker rows (12 raw -> 10), average 33.09/10 = "3.31", half-cent rounding, zero done -> null avg | unit | `... -t "counts"` | Wave 0 |
| STATS-09 | best promo: single (book + title), pair ("A + B pair"), tie-break, all-$0 -> null | unit | `... -t "best"` | Wave 0 |
| STATS-08/09 | view model strings: labels, "Available since Oct 13" derived from `graphStartDay` (not hard-coded: test with a different day), singular "1 promo done", "No promos done yet", "Not ready yet", captions | unit | `npx vitest run src/components/opportunities/dashboardTotalsView.test.ts` | Wave 0 |
| STATS-06/D-06 | graph view suffix "since <day>" only for All range; `ariaLabel` format unchanged | unit | `npx vitest run src/components/opportunities/profitGraphView.test.ts` | extend existing |
| STATS-08/09 | `getOpportunities` returns `dashboard` in every "ok" branch (incl. no-odds, none-scraped, empty feed); no `loadAvailableProfit`/`getProfitObservationsSince` read; still calls `requireUser` first; invalid input -> `{status:"invalid"}` | unit (mocked) | `npx vitest run src/app/actions/get-opportunities.test.ts` | extend existing (update `totals` assertions at ~186/202/251/254-265/339) |
| STATS-07 | AppShell: tab labels in order Dashboard, Stats, Arbitrage, Promos, Tools; no `value="dashboard"`; `stats` id mapped to StatsScreen; Opportunities heading/subtitle copy (D-13/D-14) | source-inspection unit (readFileSync, as `get-opportunities.test.ts` already does) | `npx vitest run src/components/appShellTabs.test.ts` | Wave 0 |
| STATS-10 | no `ProfitSummary` import under `src/components` and `PromosScreen` has no summary | source-inspection unit | `npx vitest run src/components/promos/noProfitSummary.test.ts` | Wave 0 |
| Success 5 | first opportunity visible on a phone without much scrolling | manual | `npm run dev`, 360px width, graph hidden then shown; card height ~<= 200px | manual-only (no browser test infra; justification: layout/pixels) |

### Sampling Rate
- **Per task commit:** the quick run command above (< 30 s).
- **Per wave merge:** `npm test` + `npx tsc --noEmit`.
- **Phase gate:** full suite green, `npm run lint` clean, manual 360px check, then `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/domain/promos/dashboardTotals.test.ts` - STATS-08/09 math
- [ ] `src/components/opportunities/dashboardTotalsView.test.ts` - copy/view model
- [ ] `src/components/appShellTabs.test.ts` - tab order/labels/ids (source inspection)
- [ ] `src/components/promos/noProfitSummary.test.ts` - STATS-10 guard
- [ ] Framework install: none (Vitest present)

Fixtures should mirror the owner check values: 12 raw completions (2 markers with `0.00`), total 33.09, 10 done, avg "3.31", best 9.05 DraftKings "College Football 50% Profit Boost".

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so it applies. The change is read-only aggregation on an existing authenticated action.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherits) | `requireUser()` is the first statement of `getOpportunities` (keep; existing test asserts it) |
| V3 Session Management | no change | iron-session, untouched |
| V4 Access Control | yes | All reads scoped by session `userId` (`getPromoCompletions(userId)`, `getMemberProfitHistory(userId)`); never accept a user id or date range from the client; input stays `z.strictObject({precision})` |
| V5 Input Validation | yes | Existing zod schema unchanged; add no new client inputs |
| V6 Cryptography | no | n/a |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reading another member's totals (IDOR) | Information disclosure | No client-supplied identifiers; session `userId` only |
| Float drift showing wrong money | Tampering (integrity of displayed result) | decimal.js only; strings across the wire; `formatUsd` string formatting |
| Untrusted text in best-promo name (scraped/added promo titles) | XSS | React text rendering (no `dangerouslySetInnerHTML`); `title`/`aria-label` attribute values are escaped by React |
| Extra Odds API spend | Denial of wallet | Phase adds zero Odds API calls (D-17); verify `get-opportunities.ts` imports no odds client (existing source-inspection test pattern) |

## Sources

### Primary (HIGH confidence, repository at HEAD cb30c2c)
- `src/components/AppShell.tsx`, `src/components/opportunities/OpportunitiesScreen.tsx`, `ProfitGraph.tsx`, `profitGraphView.ts`
- `src/app/actions/get-opportunities.ts`, `src/db/feedContext.ts`, `src/domain/opportunities/types.ts`
- `src/domain/promos/profitSeries.ts`, `profitTotals.ts`, `doneSnapshot.ts`, `pairSnapshot.ts`
- `src/db/schema.ts` (`promo_completions`), `src/db/promoTracking.ts` (`getPromoCompletions`)
- `src/components/dashboard/DashboardScreen.tsx`, `src/domain/stats/profitStats.ts` (teammate commit 456ea6e)
- `07-CONTEXT.md`, `07-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/config.json`, `vitest.config.ts`, `package.json`

### Secondary / Tertiary
- None. No external sources were needed; no web or Context7 lookups made.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages, all verified in repo.
- Architecture: HIGH, data already in `ctx`; module boundaries mirror existing Phase 6 patterns.
- Pitfalls: HIGH for 1, 2, 3, 4, 6, 7 (read directly from code); MEDIUM for 8 (phone height needs manual check) and A1/A2 (owner intent inferred).

**Research date:** 2026-10-14
**Valid until:** until teammate (dico1108) next pushes to `main` touching AppShell/feedContext/get-opportunities; re-check with `git fetch` before planning.
