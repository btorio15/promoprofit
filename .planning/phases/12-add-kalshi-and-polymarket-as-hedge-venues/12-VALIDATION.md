---
phase: 12
slug: add-kalshi-and-polymarket-as-hedge-venues
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-02
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.0.2 |
| **Config file** | `vitest.config.ts` (`src/**/*.test.ts`; `*.oracle.ts` helpers not matched) |
| **Quick run command** | `npx vitest run src/domain/market` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/domain/market` plus the touched file's test
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| MKT-01 | Venue entries off by default, grouped; saveBooks accepts venue keys; promo/bonus dropdown excludes them | unit | `npx vitest run src/domain/books src/config` | ❌ W0 | ⬜ pending |
| MKT-02 | `refreshBookmakerKeys().length <= 10`; credit estimate unchanged with venues | unit | `npx vitest run src/ingestion/odds` | extend | ⬜ pending |
| MKT-03 | Odds API venue h2h parses; american ↔ cents round-trip | unit | `npx vitest run src/domain/market/marketLeg.test.ts` | ❌ W0 | ⬜ pending |
| MKT-04 | Fee tables: Kalshi ceil, Polymarket half-even, pinned coefficients | table-driven | `npx vitest run src/domain/market/fees.test.ts` | ❌ W0 | ⬜ pending |
| MKT-05 | Solver == brute-force oracle (mulberry32 grids) for bonus, promo, arb, pair top-up | property/oracle | `npx vitest run src/domain/market/solveMarketHedge.test.ts` | ❌ W0 | ⬜ pending |
| MKT-06 | Rankers pick market only when after-fee profit is higher; members without a venue never see one | unit | `npx vitest run src/domain/hedge src/domain/promos` | extend | ⬜ pending |
| MKT-07 | DTO carries contracts/price/fee/american; settlement / price-may-move / thin badges | unit + component | `npx vitest run src/domain/market/settlement.test.ts` | ❌ W0 | ⬜ pending |
| MKT-08 | Done snapshots round-trip contracts/price/fee; recorded profit equals solver profit | unit | `npx vitest run src/domain/promos` | extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/market/{fees,marketLeg,solveMarketHedge,settlement}.test.ts` and `solveMarketHedge.oracle.ts`
- [ ] Guard test for bookmaker bucket size (≤ 10 keys)
- [ ] Live probe of Odds API `us_ex` keys (human-gated, 1-2 credits)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free Odds API key returns `kalshi` / `polymarket_us` h2h; price is the ask | MKT-10 | Spends credits, needs live key | Run the probe script, compare against Kalshi public orderbook |
| PROJECT.md / REQUIREMENTS.md updated for scope reversal | MKT-09 | Docs | Review diff |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
