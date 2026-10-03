---
phase: 4
slug: opportunities-feed
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-29
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (node environment, no jsdom) |
| **Config file** | `vitest.config.ts` (`include: ["src/**/*.test.ts"]`) |
| **Quick run command** | `npx vitest run src/domain` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

UI logic must live in pure `.ts` modules to be testable (no component tests exist).

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/domain` (plus the task's own test file)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green, `npx tsc --noEmit` exit 0, `npm run lint` exit 0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner; the requirement → test mapping below is the contract.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| CALC-07 | Boost+boost known-answer vectors (cents + whole, each cap kind, no-arb → null, min-odds gate, published vs derived price) | unit | `npx vitest run src/domain/hedge/pairMath.test.ts` | ✅ | ✅ green |
| CALC-07 | Boost+bonus known-answer vectors | unit | same | ✅ | ✅ green |
| CALC-07 | Seeded property test vs whole-dollar brute-force oracle (≥500 cases; profit equality + invariants, not exact stake pairs) | unit | same | ✅ | ✅ green |
| DASH-05 | D-08 gate; market-key normalization (spread line sign, totals over/under); different books; opposite sides; pinned vs unpinned | unit | `npx vitest run src/domain/promos/pairPromos.test.ts` | ✅ | ✅ green |
| DASH-05 | D-10 exact max-weight matching (greedy counterexample AB=10, BC=9, AD=9 → 18), deterministic ties | unit | same | ✅ | ✅ green |
| DASH-05 | Pair DTO: both stakes, "separately" amounts, delta, cap notes, bonus note | unit | `npx vitest run src/domain/promos/pairRowDto.test.ts` | ✅ | ✅ green |
| DASH-01 | `pickTop` by profit/ROI (Decimal), ties, n=5, mixed conversion/ROI (D-06b) | unit | `npx vitest run src/domain/opportunities/pick.test.ts` | ✅ | ✅ green |
| DASH-01 | `getOpportunities`: requireUser first, invalid input, empty variants, all three sources, no Odds API import, arbs at fixed $100 (D-21) | unit (mock db) | `npx vitest run src/app/actions/get-opportunities.test.ts` | ✅ | ✅ green |
| DASH-03 | Non-member promo book excluded; hedge only at member books; pair/arb need both books member | unit | `get-opportunities.test.ts` + `pairPromos.test.ts` | ✅ | ✅ green |
| DASH-05 (D-12) | `sumPortfolioProfit` counts pair once, excludes done, equals singles when no pairs | unit | `npx vitest run src/domain/promos/profitTotals.test.ts` | ✅ | ✅ green |
| D-11 | Pair snapshot round-trip; `pair_member` hidden; legacy fallback; extracted total counts pair once | unit | `npx vitest run src/domain/promos/pairSnapshot.test.ts src/domain/promos/doneSnapshot.test.ts` | ✅ | ✅ green |
| D-11 / D-23 | `markPairDoneAction`: auth first, strict input, not-active/already-done, odds-changed (profit + both stakes) writes nothing, success = 2 rows in one statement, Undo from either id removes both, parity with feed | unit (mock db) | `npx vitest run src/app/actions/mark-pair-done.test.ts` | ✅ | ✅ green |
| D-13..D-15 | Sort preference parse/fallback; `Promos (N)` label helper | unit | `npx vitest run src/lib/sortPreference.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/domain/hedge/pairMath.test.ts` (+ seeded PRNG helper and brute-force oracle) — CALC-07
- [x] `src/domain/promos/pairPromos.test.ts` — DASH-05, D-08, D-10
- [x] `src/domain/promos/pairRowDto.test.ts`, `pairSnapshot.test.ts`
- [x] `src/domain/opportunities/pick.test.ts` — DASH-01
- [x] `src/app/actions/get-opportunities.test.ts`, `mark-pair-done.test.ts` (mock scaffolding from `get-promos.test.ts` / `mark-promo-used.test.ts`)
- [x] `src/lib/sortPreference.test.ts`

No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tabs: Opportunities | Arbitrage | Promos (Active/Done/Review) | Tools (Bonus bets/Sign-up offers); app opens on Opportunities | D-01, D-06 | No jsdom/component tests | Open app, confirm landing tab and tab set on a phone width |
| keepMounted: Finder results survive switching Tools sub-tabs and top tabs | D-01 | UI state | Run a bonus-bet search, switch away and back |
| "See all" switches to Promos (Active) / Arbitrage | D-06a | UI navigation | Tap each link |
| `Promos (N)` / `Review (N)` count visible when queue non-empty | D-06 | UI | With a queued promo, check both labels |
| Pair card + Mark pair done moves both promos to Done; totals update once | D-07, D-11, D-12 | End-to-end with live cached odds | Mark a pair done, check Done tab and Total profit extracted, then Undo |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-29 (80 files / 1214 tests, tsc + lint clean)
