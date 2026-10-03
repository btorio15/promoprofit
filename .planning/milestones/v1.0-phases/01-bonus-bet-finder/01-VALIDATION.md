---
phase: 1
slug: bonus-bet-finder
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.2 |
| **Config file** | none — Wave 0 installs `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/domain/hedge` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/domain/hedge`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green; ODDS-05 live smoke test run at least once
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| CALC-01 | Bonus-bet hedge stake/profit/conversion correct | unit | `npx vitest run src/domain/hedge/bonusBet.test.ts -t "reference fixture"` | ❌ W0 | ⬜ pending |
| CALC-04 | Guaranteed profit = min of both outcomes, cent-exact | unit | `npx vitest run src/domain/hedge/bonusBet.test.ts -t "rounding edge case"` | ❌ W0 | ⬜ pending |
| CALC-05 | Only 2-way no-push markets; NFL tie disclosure | unit | `npx vitest run src/domain/hedge/marketFilter.test.ts` | ❌ W0 | ⬜ pending |
| ODDS-01 | Odds fetched + cached; no auto-poll | integration | `npx vitest run src/ingestion/odds/client.test.ts` | ❌ W0 | ⬜ pending |
| ODDS-02 | Credit warn (<100) / block (<20) thresholds | unit | `npx vitest run src/ingestion/odds/quota.test.ts` | ❌ W0 | ⬜ pending |
| ODDS-03 | Odds-age display / amber at 2h | unit | `npx vitest run src/components/finder/oddsAge.test.ts` | ❌ W0 | ⬜ pending |
| ODDS-04 | Refresh re-fetches, updates timestamp, recomputes | integration | `npx vitest run src/app/actions/refresh-odds.test.ts` | ❌ W0 | ⬜ pending |
| ODDS-05 | Book config matches live bookmaker keys | manual | live smoke-test script (checkpoint) | ❌ W0 | ⬜ pending |
| BONUS-01 | Form input → ranked top-10 list | integration | `npx vitest run src/app/actions/find-hedges.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

(Task IDs are filled in by the planner/executor; see PLAN.md `<verify>` blocks.)

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `npm install -D vitest`
- [ ] `src/domain/hedge/bonusBet.test.ts` — CALC-01, CALC-04
- [ ] `src/domain/hedge/marketFilter.test.ts` — CALC-05
- [ ] `src/ingestion/odds/client.test.ts`, `src/ingestion/odds/quota.test.ts` — ODDS-01, ODDS-02 (mocked fetch)
- [ ] `src/components/finder/oddsAge.test.ts` — ODDS-03
- [ ] `src/app/actions/refresh-odds.test.ts`, `src/app/actions/find-hedges.test.ts` — ODDS-04, BONUS-01
- [ ] Standalone live smoke-test script for ODDS-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Book config keys present in live API response | ODDS-05 | Needs real API key and spends credits | Run smoke-test script with `ODDS_API_KEY` set; confirm every configured key appears (or is flagged) |
| No scheduled/auto polling anywhere | ODDS-01 | Absence check | `grep -rn "setInterval\|cron" src/` returns no odds-fetch usage |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
