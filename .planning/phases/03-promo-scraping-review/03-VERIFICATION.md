---
phase: 03-promo-scraping-review
verified: 2026-09-29T19:00:00Z
status: human_needed
score: 5/5 code-level truths verified; criterion 3 "on a schedule" unproven in production (0 schedule-event runs)
overrides_applied: 0
human_verification:
  - test: "Confirm a GitHub schedule-event run exists"
    expected: "`gh api repos/btorio15/promoprofit/actions/runs?event=schedule` shows total_count >= 1 with a scrape_runs row written. Recorded evidence: total_count 0 as of 2026-09-29 18:56 UTC; slots 14:07 and 18:07 UTC passed with no run; tried timezone key, :07 minute, plain UTC cron, disable/re-enable. No run (not even skipped) is created, so this is GitHub scheduler registration, not job code. Next escalation: GitHub support or external workflow_dispatch trigger."
    why_human: "Depends on GitHub's scheduler; cannot be fixed or verified from code."
  - test: "Review queue walkthrough: Confirm, Correct, Enter cap details, Dismiss"
    expected: "On the next scrape that queues a promo, each action works and (Confirm/Correct) turns it active and it appears in the hedge feed."
    why_human: "Queue was empty at owner walkthrough (approved 'approved, queue steps later')."
  - test: "Review queue walkthrough: 'Needs a look' classify card and Auto-matched flag-back"
    expected: "Classify card and flag-back send a promo back to review and exclude it from hedge math."
    why_human: "Deferred, no data at walkthrough time."
  - test: "Phone check of the 260929-hht searchable game picker (team search, league + From/Through date range)"
    expected: "Usable on a phone; correction submits a valid scope."
    why_human: "Visual/mobile UX; recorded as pending."
---

# Phase 3: Promo Scraping & Review Verification Report

**Goal:** Profit-boost promos computed correctly with caps; promos discovered automatically from public CO book pages on a schedule; uncertain matches held for human confirmation.
**Status:** human_needed (no code gaps found; one real-world gap plus deferred walkthrough steps)
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Profit-boost hedges from boost % or published price: stakes, profit, ROI | VERIFIED | `src/domain/hedge/profitBoost.ts`: `effectiveBoostedDecimal` (published wins, D-03; derived fallback), `roiPct`, `priceSource`; known-answer fixtures in `profitBoost.test.ts` (published vs derived, worked example -0.65). Uses decimal.js. |
| 2 | Caps respected, optimal stake when cap binds | VERIFIED | `calculateProfitBoostHedgeUnfiltered` floors maxStake, computes winnings-cap kink stake for net_winnings / total_payout / boost_extra, reports `capBound`; RangeError guards and D-17 min-odds eligibility tested. |
| 3 | Scheduled GitHub Actions scrape of public pages, >= 1 CO book, adds promos automatically | PARTIAL: code VERIFIED, schedule UNPROVEN | `.github/workflows/scrape-promos.yml` has cron `7 14,18,23 * * *` plus `workflow_dispatch`; runs `npm run scrape:promos` (`scripts/scrape-promos.ts`) against ballybet/draftkings/fanduel scrapers (`src/ingestion/promos/books/`). Manual dispatch run 36605865367 wrote scrape_runs for all 3 books (per 03-11-SUMMARY; not re-queried, DB/GitHub not touched). Zero schedule-event runs ever. |
| 4 | Uncertain matches held in review, excluded from hedge math | VERIFIED | `getActivePromos` (`src/db/promos.ts`) selects only `status='active'`; `pending_review` never reaches hedge math; lifecycle rules (`lifecycle.ts`, CR-01..CR-05 fixes, flagged promos revert to pending_review) unit tested. |
| 5 | Confirm/correct turns queued promo active | VERIFIED (automated) | `confirm-promo-match.ts` and `correct-promo-match.ts` call `statusAfterMatch` and write the resulting status; `enter-promo-caps.ts` blocks activating a boost with null max stake. Live UI steps deferred (see human items). |

**Score:** 4 fully verified; criterion 3 code-verified, schedule element not observed.

## Classification of the schedule gap
This is a real-world operational gap in the "on a schedule" wording of SC3 and requirement PROMO-03, not a code defect: the workflow YAML is valid, the cron is present, and identical steps succeed under dispatch. It is not marked FAILED because nothing in the repo can make GitHub fire it, but PROMO-03 cannot be called fully satisfied until a schedule event run exists (or the owner accepts an external `workflow_dispatch` trigger as an override). Hence `human_needed`, not `passed`. Do not reshuffle the cron again (per handoff).

## Behavioral Spot-Checks
| Check | Command | Result |
|---|---|---|
| Full unit suite | `npx vitest run` | 69 files, 1059 tests passed |

Probes: none declared. Live DB/GitHub not queried by this verification.

## Requirements Coverage
| Req | Status | Evidence |
|---|---|---|
| CALC-02 | SATISFIED | profitBoost engine + tests |
| CALC-03 | SATISFIED | cap-aware stake solver + tests |
| PROMO-03 | PENDING | scraper works via dispatch; schedule never fired |
| PROMO-04 | SATISFIED (code); UI queue steps deferred | status gating + confirm/correct actions |

## Anti-Patterns
No TBD/FIXME/XXX markers in src, scripts, or .github. 03-REVIEW-FIX: 16/17 fixed, WR-11 accepted skip by owner.

## Gaps Summary
No code gaps. Open items: (1) obtain a schedule-event run or owner-accepted alternate trigger; (2) deferred review-queue walkthrough steps; (3) phone check of hht picker. Note roadmap header shows 14/15 plans because 03-11 is closed conditionally.

_Verifier: Claude (gsd-verifier)_
