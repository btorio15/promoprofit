---
phase: 3
slug: promo-scraping-review
status: draft
nyquist_compliant: true
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | PROMO-03 | T-03-01-03 | Logged-out probes only, no login/cookies | doc check | `test -f .planning/phases/03-promo-scraping-review/03-RECON.md && grep -c "## Scraper Contract\|## Observed Promos\|## Bluesky Findings\|## Per-Book Anti-Bot Posture" .planning/phases/03-promo-scraping-review/03-RECON.md` | n/a | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | PROMO-03 | T-03-01-01 | Fixture captured logged-out; owner D-09 call (checkpoint:human-action) | manual + file check | `ls src/test/fixtures/promos/ \| grep -E "^(ballybet\|betrivers)-promos\.(html\|json)$"` | ❌ W0 | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | PROMO-03 | T-03-01-04 | Scraper Contract has no TBD; RESEARCH Open Questions marked RESOLVED | doc check | `grep -A20 "## Scraper Contract" .planning/phases/03-promo-scraping-review/03-RECON.md \| grep -c TBD \| grep -qx 0 && grep -q "^## Open Questions (RESOLVED)" .planning/phases/03-promo-scraping-review/03-RESEARCH.md` | n/a | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | CALC-02, CALC-03 | T-03-02-02 | decimal.js only, known-answer to the cent, cap-binding fixtures | unit (TDD) | `npx vitest run src/domain/hedge/profitBoost.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | CALC-02 | T-03-02-01 | Finder output unchanged | unit (regression) | `npx vitest run src/domain/hedge/bonusBet.test.ts src/domain/hedge/rankBonusBetHedges.test.ts src/app/actions/find-hedges.test.ts && npm run typecheck` | ✅ | ⬜ pending |
| 03-03-T1 | 03-03 | 1 | PROMO-03, PROMO-04 | T-03-03-03 | Migration only CREATEs; applied live [BLOCKING] | typecheck + SQL grep + migrate | `npm run typecheck && grep -c "CREATE TABLE" drizzle/0004_promos_scrape_runs.sql && npm run db:migrate` | ❌ W0 | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | PROMO-03 | T-03-03-01, T-03-03-02, T-03-03-05 | requireUser() first + Zod; no DATABASE_URL printed | unit (TDD) + live smoke | `npx vitest run src/app/actions/get-promos.test.ts src/components/promos/scrapeAge.test.ts && npm run typecheck && npm run promos:check` | ❌ W0 | ⬜ pending |
| 03-03-T3 | 03-03 | 1 | PROMO-03 | — | N/A (UI) | build | `npm run typecheck && npm run lint && npm run build` | n/a | ⬜ pending |
| 03-04-T1 | 03-04 | 2 | CALC-02, CALC-03 | T-03-04-01 | Only active, matched promos reach hedge math | unit (TDD) | `npx vitest run src/domain/promos/selection.test.ts src/domain/promos/rankPromoHedges.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-04-T2 | 03-04 | 2 | CALC-02 | T-03-04-03, T-03-04-04 | Hedges scoped to member's books; requireUser first | unit (TDD) | `npx vitest run src/app/actions/get-promos.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-04-T3 | 03-04 | 2 | CALC-02, CALC-03 | — | N/A (UI) | build | `npm run typecheck && npm run lint && npm run build` | n/a | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | PROMO-03, PROMO-04 | T-03-05-02 | Linear regexes; unparsed caps never guessed (D-18) | unit (TDD) | `npx vitest run src/ingestion/promos/finePrint.test.ts src/domain/promos/dedupe.test.ts src/domain/promos/lifecycle.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | PROMO-03 | T-03-05-01, T-03-05-04, T-03-SC | Zod-validated candidates; no credentials; no browser deps in root package.json | unit (fixture) | `npx vitest run src/ingestion/promos && npm run typecheck && npm run lint` | ❌ W0 | ⬜ pending |
| 03-06-T1 | 03-06 | 3 | PROMO-03 | T-3-dos (T-03-06-01), T-03-SC | Per-book try/catch isolates failures; failed run expires nothing; browser deps only in isolated scrapers/browser | unit (TDD) | `npx vitest run src/ingestion/promos/run.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-06-T2 | 03-06 | 3 | PROMO-03 | T-03-06-03 | Only DATABASE_URL secret; import boundary + root package.json has no playwright/puppeteer | unit + YAML check | `npx vitest run src/ingestion/promos/boundary.test.ts && npm run typecheck` + node YAML assertion (see plan) | ❌ W0 | ⬜ pending |
| 03-06-T3 | 03-06 | 3 | PROMO-03 | T-03-06-05 | Live logged-out scrape writes scrape_runs row | live smoke | `npm run promos:check` | n/a | ⬜ pending |
| 03-07-T1 | 03-07 | 3 | PROMO-04 | T-3-authz (T-03-07-01, T-03-07-03) | Queue actions require requireUser() + Zod; race-safe writes | unit (TDD) | `npx vitest run src/app/actions/promo-review.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-07-T2 | 03-07 | 3 | PROMO-04 | T-03-07-06 | Queue text rendered as plain text | unit (TDD) | `npx vitest run src/domain/promos/describe.test.ts src/app/actions/get-promos.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-07-T3 | 03-07 | 3 | PROMO-04 | — | N/A (UI) | build | `npm run typecheck && npm run lint && npm run build` | n/a | ⬜ pending |
| 03-08-T1 | 03-08 | 4 | PROMO-04 | T-3-spoof (T-03-08-01) | Uncertain match never reaches hedge math (one fixture per failing signal + all-pass) | unit (TDD) | `npx vitest run src/domain/promos/aliases.test.ts src/domain/promos/matcher.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-08-T2 | 03-08 | 4 | PROMO-04, PROMO-03 | T-03-08-02 | Flagged promos never auto-reactivated | unit (TDD) | `npx vitest run src/domain/promos/lifecycle.test.ts src/ingestion/promos/run.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-08-T3 | 03-08 | 4 | PROMO-04 | T-03-08-03 | Tuning on real samples, no extra credit burn | unit + live smoke | `npx vitest run src/domain/promos && npm run promos:check && grep -q "## Matcher Tuning (D-10)" .planning/phases/03-promo-scraping-review/03-RECON.md` | n/a | ⬜ pending |
| 03-09-T1 | 03-09 | 4 | PROMO-04, CALC-03 | T-03-09-01, T-03-09-03 | requireUser() + Zod; cap entry validated | unit (TDD) | `npx vitest run src/domain/promos/correctionOptions.test.ts src/app/actions/promo-review.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-09-T2 | 03-09 | 4 | PROMO-04 | — | N/A (UI) | unit + build | `npx vitest run src/app/actions/get-promos.test.ts && npm run typecheck && npm run lint && npm run build` | n/a | ⬜ pending |
| 03-10-T1 | 03-10 | 5 | PROMO-04 | T-03-10-01, T-03-10-02 | Flag requires requireUser(); blocks auto re-activation | unit (TDD) | `npx vitest run src/app/actions/promo-review.test.ts src/domain/promos/lifecycle.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 03-10-T2 | 03-10 | 5 | PROMO-04 | — | N/A (UI) | build | `npm run typecheck && npm run lint && npm run build` | n/a | ⬜ pending |
| 03-11-T1 | 03-11 | 6 | PROMO-03 | T-03-11-01 | Owner approves secret + push (checkpoint:decision) | manual + CLI | `gh repo view --json visibility,defaultBranchRef` | n/a | ⬜ pending |
| 03-11-T2 | 03-11 | 6 | PROMO-03 | T-03-11-02, T-03-11-04 | CI-written scrape_runs row via workflow_dispatch | live CI smoke | `gh secret list \| grep -c "^DATABASE_URL" && npm run promos:check` | n/a | ⬜ pending |
| 03-11-T3 | 03-11 | 6 | PROMO-03, PROMO-04, CALC-02, CALC-03 | — | Owner end-to-end walkthrough (checkpoint:human-verify) | manual + smoke | `npm run promos:check` | n/a | ⬜ pending |

*File Exists: ❌ W0 = test/fixture file is created by that task itself (TDD RED step or recon capture); ✅ = already in repo; n/a = verify is build/doc/live-smoke only.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/hedge/profitBoost.test.ts` — CALC-02, CALC-03 (created RED-first by 03-02 Task 1)
- [ ] `src/domain/promos/matcher.test.ts` — PROMO-04 (created RED-first by 03-08 Task 1)
- [ ] Manual reconnaissance — locate the real single-game-boost page on Bally Bet / BetRivers before selectors are written (03-01, all tasks; fixture consumed by 03-05 Task 2)
- [ ] `.github/workflows/scrape-promos.yml` — first workflow in repo (03-06 Task 2); first real CI run is the PROMO-03 checkpoint (03-11 Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scraper writes a real promo row from a live page | PROMO-03 | Requires live network access to a real sportsbook page | Run the scraper script against the chosen book; inspect the resulting `promos` / review-queue row and `scrape_runs` status |
| Scheduled GH Actions run succeeds | PROMO-03 | Runs on GitHub infrastructure | Trigger `workflow_dispatch`; confirm green run and DB write |
| Review screen confirm/correct flow | PROMO-04 | Visual/interaction check per UI-SPEC | Confirm a queued promo; verify it appears as active and is used in hedge calculations |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (29/29 tasks carry an `<automated>` command)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (no plan uses a `MISSING` automated placeholder; every test file is created in-task, RED first)
- [x] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < 30s (per-task unit commands meet it; `npm run build` and live-smoke tasks exceed it by nature — confirm at execution)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
