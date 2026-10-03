---
phase: 04-opportunities-feed
plan: 04
subsystem: ui
tags: [nextjs, tabs, react]

requires:
  - phase: 04-opportunities-feed
    provides: promosVersion, SortSwitch, sortByMeasure, countLabel (plan 01)
provides:
  - Tabs Opportunities | Arbitrage | Promos | Tools
  - ToolsScreen (Bonus bets / Sign-up offers, keepMounted)
  - Promos Active | Done | Review sub-tabs with Review (N) and Promos (N)
  - ReviewPanel (scrape status, review queue, empty state)
affects: [04-opportunities-feed]

key-files:
  created:
    - src/components/tools/ToolsScreen.tsx
    - src/components/promos/ReviewPanel.tsx
  modified:
    - src/components/AppShell.tsx
    - src/components/promos/PromosScreen.tsx

key-decisions:
  - "Promos sub-tab view is lifted to AppShell so See all promos always lands on Active"
  - "Promos rows sorted by the shared Profit/ROI preference; other-book rows stay dimmed and last"

requirements-completed: [DASH-01]
duration: 15min
completed: 2026-09-29
---

# Phase 4 Plan 04: Tabs Restructure Summary

**Four top-level tabs (Opportunities, Arbitrage, Promos, Tools) with Tools wrapping the finder and sign-up offers, and Promos split into Active/Done/Review with visible review counts and the shared Profit/ROI sort.**

## Task Commits
1. Task 1 (Tools tab, tab set): 80ef1ab
2. Task 2 (Promos sub-tabs, sort, review count, shared refresh): 4973140

## Deviations from Plan
- [Rule 3] The worktree started on a different base and was reset to 5420355 per the branch check. `npx next typegen` was run to clear the `LayoutProps` tsc error (generated files are gitignored).
- The Promos trigger renders "Promos" plus a `.num` count span; `countLabel("Promos", n)` is used as its aria-label so the count stays plain text with the number in mono.

## Verification
- `npx tsc --noEmit`: clean. `npm run lint`: clean.
- Targeted vitest (src/lib, src/domain/opportunities, get-promos): 100 pass. Full `npx vitest run` passes.
- `next build` not run (disk).

## Known Stubs
None.

## Self-Check: PASSED
