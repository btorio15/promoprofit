---
phase: 07-dashboard
plan: 07
subsystem: ui
tags: [dashboard, phone-fit, gap-closure]
requires: [07-06]
provides:
  - Tab bar that scrolls inside itself on phones
  - Shorter totals card and tighter Dashboard stack
  - Graph "since" label on any range clamped to the start day, also for screen readers
affects: []
key-files:
  created: []
  modified:
    - src/components/AppShell.tsx
    - src/components/opportunities/DashboardTotals.tsx
    - src/components/opportunities/OpportunitiesScreen.tsx
    - src/components/opportunities/ProfitGraph.tsx
    - src/components/opportunities/profitGraphView.ts
    - src/components/opportunities/profitGraphView.test.ts
requirements-completed: [STATS-07, STATS-08]
duration: 15min
completed: 2026-10-17
---

# Phase 7 Plan 07: Phone-fit Gap Closure Summary

Closed the two failures from the Playwright phone check (360x780, deployed site) plus review warnings WR-01/WR-02.

## Tasks
1. Graph since-label follows the start-day clamp; aria label includes it - f385d2c
2. Tab bar scroll container, smaller phone tab text, shorter totals card, gap-6 stack, slimmer collapsed graph bar - 31c4cf1
3. Stale-odds warning moved under the "Opportunities" heading; Tabs gap-6 on phone; card p-3 on phone - 29fbe91
4. Active-tab underline no longer clipped by the scroll container (TabsList h-auto, pb-2) - 02614d8

## Deviations from Plan
- Added the stale-warning move (Task 3) after the first recheck showed the "Opportunities" heading still at 802px.
- Added the underline fix (Task 4) after the recheck showed the scroll box clipping it.

## Verification (Playwright, betmargin.vercel.app, 360x780, owner session)
- Page width 360 (no sideways scroll); the tab bar scrolls on its own (383px content), Tools partly visible as a scroll hint.
- Totals card 275px -> 223px; all four labels on one line.
- Graph hidden: "Opportunities" heading fully on the first screen (bottom 770px of 780). Graph shown: about one scroll down.
- 7d headline: "Extracted $6.70 of $39.81 available since Oct 13"; aria label includes "since Oct 13".
- npm test 1967 passed; lint clean; tsc clean except the stale generated .next/dev/types file.
