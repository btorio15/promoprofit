---
phase: 3
slug: promo-scraping-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `vitest.config.ts` (existing, no changes needed) |
| **Quick run command** | `npx vitest run <changed-file>.test.ts` |
| **Full suite command** | `npm run test && npm run typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.ts`
- **After every plan wave:** Run `npm run test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green, plus the PROMO-03 live-scrape checkpoint
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Filled in by the planner / executor as task IDs are assigned. Requirement → test mapping from RESEARCH.md:*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CALC-02 | — | N/A | unit (known-answer fixtures) | `npx vitest run src/domain/hedge/profitBoost.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CALC-03 | — | N/A | unit (cap-binding fixtures) | `npx vitest run src/domain/hedge/profitBoost.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-04 | T-3-spoof | Uncertain match never reaches hedge math | unit (one fixture per failing signal + all-pass) | `npx vitest run src/domain/promos/matcher.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-04 | T-3-authz | Queue actions require `requireUser()` + Zod | unit/integration | `npm run test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-03 | T-3-dos | Per-book try/catch isolates failures | manual checkpoint | live scraper run + DB row inspection | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/hedge/profitBoost.test.ts` — stubs for CALC-02, CALC-03
- [ ] `src/domain/promos/matcher.test.ts` — stubs for PROMO-04
- [ ] Manual reconnaissance — locate the real single-game-boost page on Bally Bet / BetRivers before selectors are written
- [ ] `.github/workflows/scrape-promos.yml` — first workflow in repo; first real run is the PROMO-03 checkpoint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scraper writes a real promo row from a live page | PROMO-03 | Requires live network access to a real sportsbook page | Run the scraper script against the chosen book; inspect the resulting `promos` / review-queue row and `scrape_runs` status |
| Scheduled GH Actions run succeeds | PROMO-03 | Runs on GitHub infrastructure | Trigger `workflow_dispatch`; confirm green run and DB write |
| Review screen confirm/correct flow | PROMO-04 | Visual/interaction check per UI-SPEC | Confirm a queued promo; verify it appears as active and is used in hedge calculations |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
