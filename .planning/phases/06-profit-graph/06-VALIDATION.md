---
phase: 6
slug: profit-graph
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-03
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.x |
| **Config file** | `vitest.config.ts` (tests colocated `*.test.ts`) |
| **Quick run command** | `npx vitest run <touched test file>` (e.g. `src/domain/promos/profitSeries.test.ts`) |
| **Full suite command** | `npm test && npm run typecheck && npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched test file
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green, typecheck and lint clean, manual phone check done
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

One row per plan task, taken from each task's `<verify><automated>` command. "❌ W0" means the test file does not exist yet and is created by that task (RED first where the plan says so).

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------|-------------------|-------------|--------|
| 06-01-1 | 06-01 | 1 | STATS-02/03/04 | T-06-02 | unit (RED: series tests fail, totals pass) | `npx vitest run src/domain/promos/profitTotals.test.ts` passes and `npx vitest run src/domain/promos/profitSeries.test.ts` fails (module missing) | ✅ profitTotals / ❌ W0 profitSeries (created here) | ⬜ pending |
| 06-01-2 | 06-01 | 1 | STATS-02/03/04 | T-06-01, T-06-02, T-06-03 | unit (table-driven, GREEN) | `npx vitest run src/domain/promos/profitSeries.test.ts src/domain/promos/profitTotals.test.ts && npm run typecheck` | ❌ W0 (from 06-01-1) | ⬜ pending |
| 06-02-1 | 06-02 | 1 | STATS-02 | T-06-05, T-06-06 | unit | `npx vitest run src/domain/promos/memberFeed.test.ts` | ❌ W0 (created here) | ⬜ pending |
| 06-02-2 | 06-02 | 1 | STATS-02 | T-06-04 | unit (exact pair-share sum) | `npx vitest run src/domain/promos/memberObservationEntries.test.ts && npm run typecheck` | ❌ W0 (created here) | ⬜ pending |
| 06-03-1 | 06-03 | 1 | STATS-02 | T-06-09 | schema/migration file check | `npm run typecheck && test -f drizzle/0012_member_profit_observations.sql && grep -c "CREATE TABLE \"member_profit_observations\"" drizzle/0012_member_profit_observations.sql` | n/a (generated) | ⬜ pending |
| 06-03-2 | 06-03 | 1 | STATS-02 | T-06-07, T-06-08, T-06-10, T-06-11 | unit (mock db, toSQL) | `npx vitest run src/db/memberObservations.test.ts src/db/promoCaps.test.ts && npm run typecheck` | ❌ W0 memberObservations (created here) / ✅ promoCaps | ⬜ pending |
| 06-04-1 | 06-04 | 2 | STATS-01/02/03 | T-06-13, T-06-14 | unit | `npx vitest run src/db` | ✅ (06-03 tests) | ⬜ pending |
| 06-04-2 | 06-04 | 2 | STATS-01/02/03 | T-06-12, T-06-13, T-06-14, T-06-15 | unit (action, mocked DB) | `npx vitest run src/app/actions/get-opportunities.test.ts && npm run typecheck && npm run lint` | ✅ (updated here) | ⬜ pending |
| 06-05-1 | 06-05 | 2 | STATS-05/06 | T-06-SC | registry check + blocking owner gate | `npm view recharts@3.10.1 version` | n/a | ⬜ pending |
| 06-05-2 | 06-05 | 2 | STATS-04/05/06 | T-06-16, T-06-18 | unit (view model, exact cents and copy) | `npx vitest run src/components/opportunities/profitGraphView.test.ts src/lib/persistentState.test.ts && npm run typecheck` | ❌ W0 profitGraphView (created here) / ✅ persistentState | ⬜ pending |
| 06-05-3 | 06-05 | 2 | STATS-05/06 | T-06-17, T-06-18 | typecheck + lint + component-folder tests + grep gates | `npm run typecheck && npm run lint && npx vitest run src/components/opportunities src/ingestion/promos/boundary.test.ts` | ✅ (from 06-05-2) | ⬜ pending |
| 06-06-1 | 06-06 | 2 | STATS-02 | T-06-19, T-06-20, T-06-21, T-06-22 | unit | `npx vitest run src/ingestion/odds/morningObserve.test.ts src/ingestion/promos/boundary.test.ts && npm run typecheck` | ✅ (updated here) | ⬜ pending |
| 06-06-2 | 06-06 | 2 | STATS-02 | T-06-21 | typecheck + boundary | `npm run typecheck && npx vitest run src/ingestion/promos/boundary.test.ts` | ✅ | ⬜ pending |
| 06-07-1 | 06-07 | 3 | STATS-01/04/05/06 | T-06-26 | full suite | `npm test && npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 06-07-2 | 06-07 | 3 | STATS-02 | T-06-23, T-06-25 | blocking owner checkpoint + read-only query | read-only `select count(*) from member_profit_observations` succeeds after owner OK | n/a | ⬜ pending |
| 06-07-3 | 06-07 | 3 | STATS-02/05/06 | T-06-24 | manual phone check + read-only query | read-only query of today's owner rows in `member_profit_observations` (see Manual-Only below) | n/a | ⬜ pending |

Requirement coverage (from RESEARCH.md): STATS-02 → 06-01, 06-02, 06-03, 06-04, 06-06; STATS-03 → 06-01, 06-04; STATS-04 → 06-01, 06-05; STATS-01/05/06 → 06-04, 06-05, 06-07.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/promos/profitSeries.test.ts` — series math for STATS-02/03/04 (created RED in 06-01-1)
- [ ] `src/domain/promos/memberFeed.test.ts` — shared member feed helper (06-02-1)
- [ ] `src/domain/promos/memberObservationEntries.test.ts` — exact pair shares (06-02-2)
- [ ] `src/db/memberObservations.test.ts` — recorder/read for STATS-02 (06-03-2)
- [ ] `src/components/opportunities/profitGraphView.test.ts` — graph view model, exact cents and copy (06-05-2)
- [ ] `src/app/actions/get-opportunities.test.ts` — update mocks for new DB calls + response field (06-04-2)

Framework install: none (Vitest present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Touch tooltip at the finger on a real phone | STATS-05 | Touch behavior not reproducible in jsdom; Recharts touch support undocumented | On phone, open Opportunities, tap/drag across graph; readout shows date, both totals, day's gain |
| Compact 160px layout, hide/show remembered, dark mode | STATS-06 | Visual/device behavior | Check phone portrait in light and dark; hide graph, reload, still hidden |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
