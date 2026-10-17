---
phase: 07-dashboard
verified: 2026-10-17T21:05:00Z
status: passed
score: 5/5 roadmap success criteria verified (SC5 by Playwright phone check 2026-10-17, after gap plan 07-07)
overrides_applied: 0
human_verification:
  - test: "Open the live Dashboard at 360px width (phone or browser devtools). Check the totals card, then hide the graph, then show it again."
    expected: "Totals card is a 2 x 2 grid (Extracted all-time / Available since Oct 13 on top, Last 7 days / Last 30 days below) with one wrapping counts line, roughly 200px tall. With the graph hidden the first opportunity card is visible without scrolling; with it shown it is within about one scroll. Hiding the graph leaves the totals card visible."
    why_human: "Pixel layout and scroll position; the project has no browser/DOM test setup. 07-06 Task 2 was presented to the owner on 2026-10-16 but never explicitly approved."
  - test: "At 360px, look at the tab bar and tap each tab."
    expected: "Dashboard, Statistics, Arbitrage, Promos, Tools are all reachable (no clipped or hidden tab), and the Statistics tab still loads its hour/sport/weekday charts."
    why_human: "Tab-bar fit at phone width is visual."
  - test: "With real data on the live Dashboard, read the totals card."
    expected: "Extracted all-time matches the owner's current figure (was $33.09), promos done 10 (or current), avg $3.31, best $9.05 DraftKings with the promo name; all exact to the cent."
    why_human: "Live production data; unit tests only cover a fixture that mirrors these numbers."
---

# Phase 7: Dashboard Verification Report

**Phase Goal:** The Opportunities tab becomes the Dashboard: a member sees headline totals and simple counts above the profit graph, with the full ranked feed below, and the Promos tab no longer carries the profit summary.
**Verified:** 2026-10-17
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (roadmap success criteria, plus plan must-haves merged in)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Navigation reads Dashboard · Statistics · Arbitrage · Promos · Tools; Dashboard is the home tab and shows the Phase 6 graph and range picker above the full ranked feed (no separate stats page) | VERIFIED | `src/components/AppShell.tsx`: triggers in order `opportunities`→"Dashboard", `stats`→"Statistics", arbitrage, promos, tools; `useState<ActiveTab>("opportunities")`; `<StatsScreen active={activeTab === "stats"} />` from `src/components/stats/`; old `components/dashboard/` folder gone. The roadmap wording says "Stats"; the label is "Statistics" per owner decision D-15a (teammate already shipped it, owner said keep it). `OpportunitiesScreen.tsx` renders `<ProfitGraph>` above the "Opportunities" h2, SortSwitch and the feed sections. Guarded by `src/components/appShellTabs.test.ts` (6 tests). |
| 2 | Headline totals above the graph: extracted, available, last 7 days, last 30 days, exact to the cent | VERIFIED | `src/domain/promos/dashboardTotals.ts` sums with decimal.js only, emits 2dp strings; extracted from raw completions (all-time, includes pre-Oct-13, D-02/D-18), available from the member's own `profitSeries` days (D-01), windows via `periodStartDates` (today-6 / today-29). Wired in `src/app/actions/get-opportunities.ts` (`buildDashboardTotals({ series: profitSeries, completions: ctx.completions, doneRows: ctx.doneRows, now })`) and returned in every ok branch via `respond()`. `DashboardTotals.tsx` renders `buildTotalsView` cells with `formatUsd`; it sits before `<ProfitGraph` in `OpportunitiesScreen.tsx`. Labels: "Extracted all-time", "Available since <derived day>", "Last 7 days … of $X available", "Last 30 days …". |
| 3 | Promos completed, average per completed promo, best single promo | VERIFIED | `counts.promosDone = doneRows.length` (`toDoneRows` drops pair-marker rows, keeps $0 rows: D-10/D-19); average = all-time extracted ÷ done, ROUND_HALF_UP; best = highest >$0 done row with book + title, pairs as "<A> + <B> pair" (pair `bookName` is built as `A + B` in `doneSnapshot.ts`). Rendered as one counts line ("10 promos done · avg $3.31 each · best $9.05 · DraftKings · …", "No promos done yet" when empty). Owner fixture test: 10 done, 33.09, avg 3.31. |
| 4 | Promos tab no longer shows the profit summary | VERIFIED | `src/components/promos/ProfitSummary.tsx` deleted; no component references `ProfitSummary`; no promos component renders "Total profit extracted/available" (grep). Guarded by `src/components/promos/noProfitSummary.test.ts`. |
| 5 | On a phone the totals stay compact enough that the first opportunity is still visible without much scrolling | UNCERTAIN (human) | Code supports it: `grid-cols-2 … sm:grid-cols-4`, single wrapping counts line, totals card independent of the graph's hide toggle (`ProfitGraph` hide state only affects the graph). Actual fit at 360px is visual and the owner's 07-06 Task 2 check was not explicitly approved. |

Plan-level must-haves also checked: D-07 totals card always visible (rendered outside ProfitGraph, also when feed empty); D-13 heading "Dashboard" + exact subtitle; D-14 "Opportunities" h2 above Sort by; D-06 graph headline gets muted `sinceLabel` ("since Oct 13") for All time only (`profitGraphView.ts`, `ProfitGraph.tsx` line ~108); null-available renders "Not ready yet" and drops captions; `requireUser()` is still the first statement and no Odds API client is imported (D-17, test-guarded); group-wide `loadAvailableProfit` not used by `getOpportunities`.

**Score:** 4/5 verified in code; 1 needs human.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/domain/promos/dashboardTotals.ts` | VERIFIED | Substantive pure function, decimal.js only; imported by get-opportunities and types |
| `src/domain/promos/dashboardTotals.test.ts` | VERIFIED | Table-driven tests incl. owner fixture |
| `src/components/appShellTabs.test.ts` | VERIFIED | Tab order/labels/ids guard |
| `src/components/stats/StatsScreen.tsx` | VERIFIED | Teammate tab under id `stats`; copy says "Stats tab" |
| `src/domain/opportunities/types.ts` | VERIFIED | ok branch carries `dashboard: DashboardTotalsDTO` |
| `src/app/actions/get-opportunities.ts` | VERIFIED | Builds and returns `dashboard` in all ok branches |
| `src/components/opportunities/dashboardTotalsView.ts` (+ test) | VERIFIED | Copy view model, `formatUsd`, `formatTickDate` for since-day |
| `src/components/opportunities/profitGraphView.ts` | VERIFIED | `sinceLabel` for All time |
| `src/components/opportunities/DashboardTotals.tsx` | VERIFIED | Renders cells + counts; skeleton while loading |
| `src/components/opportunities/OpportunitiesScreen.tsx` | VERIFIED | Header → totals → graph → stale line → "Opportunities" → Sort → feed |
| `src/components/promos/noProfitSummary.test.ts`, `dashboardLayout.test.ts` | VERIFIED | Source guards pass |
| `.planning/phases/07-dashboard/07-VALIDATION.md` | VERIFIED | `nyquist_compliant: true`, manual 360px check listed as pending owner |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| get-opportunities.ts | dashboardTotals.ts | `buildDashboardTotals(` | WIRED |
| get-opportunities.ts | feedContext.ts | `loadProfitSeries` (no `loadAvailableProfit`) | WIRED |
| dashboardTotals.ts | profitTotals.ts | `periodStartDates`, `denverDate` | WIRED |
| OpportunitiesScreen.tsx | DashboardTotals.tsx | `<DashboardTotals loading={showSkeleton} dashboard={ok ? ok.dashboard : null} />` before `<ProfitGraph` | WIRED |
| DashboardTotals.tsx | dashboardTotalsView.ts | `buildTotalsView(dashboard)` | WIRED |
| ProfitGraph.tsx | profitGraphView.ts | `view.sinceLabel` | WIRED |
| AppShell.tsx | stats/StatsScreen.tsx | import + `TabsContent value="stats"` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| DashboardTotals | `ok.dashboard` | `getOpportunities` → `buildDashboardTotals` ← `getPromoCompletions(userId)` (session member) + `loadProfitSeries` (`member_profit_observations`) | Yes, DB queries scoped to the session user | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 7 tests | `npx vitest run` on the 7 phase test files | 7 files, 84 tests passed | PASS |
| Full suite (regression) | `npx vitest run` | 136 files, 1966 tests passed | PASS |
| Type check | `npx tsc --noEmit` | exit 1: one error, `.next/dev/types/validator.ts(98,39)` cannot find `src/app/api/cron/scrape/route.js` | see note |
| Type check, generated `.next` excluded | `tsc --noEmit -p` (temp config extending tsconfig, excluding `.next`) | exit 0, no errors | PASS |

Note on tsc: the single error is in the git-ignored, dev-server-generated `.next/dev/types/validator.ts`. It still references the Vercel cron route that the teammate removed in commit ddf4721 (D-17). It is not phase 7 source code. Running `next dev` or `next build` again, or deleting `.next`, regenerates the file and clears it. All project source type-checks cleanly.

### Probe Execution

No probes declared or applicable (UI/data phase). Skipped.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| STATS-07 | 07-02, 07-05, 07-06 | SATISFIED | Tab renamed Dashboard; graph, totals and counts above the feed; no separate page |
| STATS-08 | 07-01, 07-03, 07-04, 07-05 | SATISFIED | Four totals computed with decimal.js and rendered |
| STATS-09 | 07-01, 07-03, 07-04, 07-05 | SATISFIED | Promos done, average, best promo |
| STATS-10 | 07-05 | SATISFIED | ProfitSummary removed, guard test |

No orphaned requirements: REQUIREMENTS.md maps exactly STATS-07..10 to Phase 7. (Their checkboxes in REQUIREMENTS.md are still unticked and the traceability table says "Pending"; tracking update is left to the orchestrator.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase 7 source files) | - | No TBD/FIXME/XXX/TODO/placeholder markers | - | - |
| `src/app/actions/get-promos.ts` | 144-171 | Still calls `loadAvailableProfit` and returns `availableProfit`/`totalExtracted`, which no component reads any more | Info | Dead payload and an extra DB read on the Promos tab; nothing user-visible. CONTEXT left removal to Claude's discretion. |
| `src/components/AppShell.tsx` | 28, 33 | Doc comment still describes the tabs as "Opportunities \| Arbitrage \| Promos \| Tools" | Info | Stale comment only |

### Human Verification Required

1. **Phone-width totals and first opportunity (success criterion 5, D-07, D-08).** Open the live Dashboard at 360px. Expected: 2 x 2 totals grid plus one counts line, about 200px tall; first opportunity visible with the graph hidden, within about one scroll with it shown; hiding the graph keeps the totals card. Why human: pixel layout. 07-06 Task 2 was presented on 2026-10-16 and not explicitly approved.
2. **Tab bar at 360px.** All five tabs (Dashboard, Statistics, Arbitrage, Promos, Tools) reachable, and Statistics still loads. Why human: visual fit.
3. **Live numbers.** Totals card shows the owner's real figures (was $33.09 extracted, 10 done, avg $3.31, best $9.05 DraftKings). Why human: production data.

### Gaps Summary

No code gaps. Every roadmap criterion that can be checked in code holds: the tab is renamed and is home, totals and counts are computed exactly from the member's own data and rendered above the graph, the feed sits below, and the Promos profit summary is gone and guarded by a test. The only open item is the owner's phone-width check (success criterion 5), which has not been explicitly approved. The tab label "Statistics" differs from the roadmap's "Stats" by owner decision D-15a.

---

_Verified: 2026-10-17_
_Verifier: Claude (gsd-verifier)_

## Re-verification (2026-10-17, after 07-07)

Playwright at 360x780 against the deployed site, owner session:
- First pass found two failures: tab bar 418px wide (page scrolled sideways, Tools cut off) and the "Opportunities" heading at 888px with the graph hidden.
- Gap plan 07-07 fixed both plus review WR-01/WR-02. Recheck: page width 360, tab bar scrolls on its own, totals card 223px, heading bottom at 770px with the graph hidden, graph shown about one scroll down, "since Oct 13" on clamped 7d/30d ranges and in the aria label.
- Steps 2-6 and 8 of the owner check passed on the first pass (heading, totals, counts, graph label on All, hide graph keeps totals, Statistics loads, Promos has no summary).

Status: passed.
