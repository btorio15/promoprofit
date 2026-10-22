---
phase: 8
slug: no-sweat-bet-math
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-22
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, node environment) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/domain/hedge/noSweat.test.ts src/domain/promos/rankNoSweat.test.ts src/domain/hedge/conversionRate.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green, plus `npx tsc --noEmit` and lint
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor once task IDs exist. Requirement → test mapping:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| NSB-01 | Fixtures A, A-w, B, B-w, C, HR, HR-w: stakes, win/lose/worst to the cent; profit from rounded stake | unit (table-driven) | `npx vitest run src/domain/hedge/noSweat.test.ts` | ❌ W0 | ⬜ pending |
| NSB-02 | Rate = finder top-1 profit at R over My Books ∪ refund book; no odds → `cant_price`; pure, 0 credits | unit | `npx vitest run src/domain/hedge/conversionRate.test.ts` | ❌ W0 | ⬜ pending |
| NSB-03 | Min-odds hard filter; highest estimated profit across moneyline/spread/total; sport limit; tie-break; hedge only at member's books | unit | `npx vitest run src/domain/promos/rankNoSweat.test.ts` | ❌ W0 | ⬜ pending |
| NSB-04 | Solver profit == brute-force oracle over whole-dollar and cent grids (fixtures + seeded random sweep) | oracle/property | `npx vitest run src/domain/hedge/noSweat.test.ts -t oracle` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/hedge/noSweat.test.ts` (NSB-01, NSB-04)
- [ ] `src/domain/hedge/noSweat.oracle.ts` (test helper; reuses `mulberry32`/`randInt`/`pick` from `pairMath.oracle.ts`)
- [ ] `src/domain/hedge/conversionRate.test.ts` (NSB-02)
- [ ] `src/domain/promos/rankNoSweat.test.ts` (NSB-03)
- [ ] `OddsEvent` builder following existing rank-test helpers

---

## Manual-Only Verifications

All phase behaviors have automated verification (pure domain code, no UI).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
