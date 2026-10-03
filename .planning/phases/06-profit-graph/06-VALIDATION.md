---
phase: 6
slug: profit-graph
status: draft
nyquist_compliant: false
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

Filled by the planner per task. Requirement → test mapping from RESEARCH.md:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| STATS-02 | each promo once at best value on first-seen Denver day; member rows beat group rows; fallback filtered to own books; pair shares sum exactly | unit (table-driven) | `npx vitest run src/domain/promos/profitSeries.test.ts` | ❌ W0 | ⬜ pending |
| STATS-02 | member recorder writes singles + pair shares, positive only, never throws | unit (mock db) | `npx vitest run src/db/memberObservations.test.ts` | ❌ W0 | ⬜ pending |
| STATS-03 | completions bucketed by Denver day incl. DST edges, legacy "0.00" | unit | `npx vitest run src/domain/promos/profitSeries.test.ts` | ❌ W0 | ⬜ pending |
| STATS-04 | 7d/30d/all slices start at $0; All time clamped to 2026-09-27; rolling Denver days | unit | `npx vitest run src/domain/promos/profitSeries.test.ts` | ❌ W0 | ⬜ pending |
| STATS-01/05/06 | response carries series in every ok branch; empty series → empty state; readout strings exact to the cent | unit/component | `npx vitest run src/app/actions/get-opportunities.test.ts` | ✅ (needs update) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/promos/profitSeries.test.ts` — series math stubs for STATS-02/03/04
- [ ] `src/db/memberObservations.test.ts` — recorder stubs for STATS-02
- [ ] `src/app/actions/get-opportunities.test.ts` — update mocks for new DB calls + response field

Framework install: none (Vitest present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Touch tooltip at the finger on a real phone | STATS-05 | Touch behavior not reproducible in jsdom; Recharts touch support undocumented | On phone, open Opportunities, tap/drag across graph; readout shows date, both totals, day's gain |
| Compact 160px layout, hide/show remembered, dark mode | STATS-06 | Visual/device behavior | Check phone portrait in light and dark; hide graph, reload, still hidden |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
