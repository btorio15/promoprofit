---
phase: 7
slug: dashboard
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-14
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (`environment: "node"`, no DOM/Testing Library) |
| **Config file** | `vitest.config.ts` (`include: src/**/*.test.ts`) |
| **Quick run command** | `npx vitest run src/domain/promos/dashboardTotals.test.ts src/components/opportunities/dashboardTotalsView.test.ts src/components/opportunities/profitGraphView.test.ts` |
| **Full suite command** | `npm test && npx tsc --noEmit && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run `npm test && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green, plus manual 360px check
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Filled in by the planner/executor once task IDs exist. Requirement → test mapping:*

| Task | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|----------|-----------|-------------------|-------------|--------|
| 07-01 T1/T2 | STATS-08 | extracted all-time / 7d / 30d from raw completions (Denver days), markers = 0, cent-exact | unit | `npx vitest run src/domain/promos/dashboardTotals.test.ts` | ✅ | ✅ green |
| 07-01 T1/T2 | STATS-08 | available all-time / 7d / 30d from series days; `null` when not-ready/error | unit | `npx vitest run src/domain/promos/dashboardTotals.test.ts -t "available"` | ✅ | ✅ green |
| 07-01 T1/T2 | STATS-09 | promos done (markers excluded), average (ROUND_HALF_UP), best single/pair | unit | `npx vitest run src/domain/promos/dashboardTotals.test.ts -t "counts\|best"` | ✅ | ✅ green |
| 07-04 T1 | STATS-08/09 | view-model copy: labels, derived "Available since <day>", singular/empty/"Not ready yet" | unit | `npx vitest run src/components/opportunities/dashboardTotalsView.test.ts` | ✅ | ✅ green |
| 07-04 T2 | STATS-06/D-06 | graph "since <day>" suffix only for All range | unit | `npx vitest run src/components/opportunities/profitGraphView.test.ts` | ✅ | ✅ green |
| 07-03 T2 | STATS-08/09 | `getOpportunities` returns dashboard DTO in every ok branch; auth first; no `loadAvailableProfit` | unit (mocked) | `npx vitest run src/app/actions/get-opportunities.test.ts` | ✅ | ✅ green |
| 07-02 T1 | STATS-07 | tab order Dashboard · Statistics · Arbitrage · Promos · Tools; `stats` id; no `value="dashboard"` | source-inspection | `npx vitest run src/components/appShellTabs.test.ts` | ✅ | ✅ green |
| 07-05 T2 | STATS-10 | no `ProfitSummary` usage; Promos tab has no summary | source-inspection | `npx vitest run src/components/promos/noProfitSummary.test.ts` | ✅ | ✅ green |
| 07-05 T2 | STATS-07 | Dashboard heading/subtitle, card order, "Opportunities" heading, totals stay when graph hidden (D-07, D-13, D-14) | source-inspection | `npx vitest run src/components/opportunities/dashboardLayout.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/domain/promos/dashboardTotals.test.ts` — STATS-08/09 math (fixtures: 12 raw completions incl. 2 $0 markers, total 33.09, 10 done, avg 3.31, best 9.05 DraftKings)
- [x] `src/components/opportunities/dashboardTotalsView.test.ts` — copy/view model
- [x] `src/components/appShellTabs.test.ts` — tab order/labels/ids
- [x] `src/components/promos/noProfitSummary.test.ts` — STATS-10 guard

*Framework install: none (Vitest present).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First opportunity visible on a phone without much scrolling | Success criterion 5 | Layout/pixels; no browser test infra | `npm run dev`, 360px width, graph hidden then shown; totals card ≈ ≤200px tall, first feed card visible |
| Tab bar fits at 360px | STATS-07 | Layout/pixels | Same viewport; all 5 tabs visible without overflow |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated gates green 2026-10-16; 360px check done with Playwright 2026-10-17 (passed after gap plan 07-07)
