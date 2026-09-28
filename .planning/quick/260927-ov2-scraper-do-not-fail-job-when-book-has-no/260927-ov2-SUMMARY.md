---
phase: quick-260927-ov2
plan: 01
subsystem: infra
tags: [github-actions, promo-scraper, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: runPromoScrape orchestrator, WR-03 zero-usable-promos handling, scrape_runs status model
provides:
  - LEGITIMATE_SKIP_REASONS constant distinguishing deliberate exclusions from parser regressions
  - scrapeExitCode(outcomes) helper shared by run.ts and scripts/scrape-promos.ts
  - scrape-promos.yml odds step that survives a failed scrape step (if: !cancelled())
  - scrape-promos.yml on actions/checkout@v7 + actions/setup-node@v7 (node24 runtime, verified via gh api)
affects: [promo-scraping-review, scheduled-jobs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SKIP_REASONS filtered into a legitimate-vs-regression ReadonlySet, reused by both the ok and failed branches of a shared skip-counting pass"
    - "Job exit code centralized in one exported pure function (scrapeExitCode) instead of duplicated inline anyFailed logic in the CLI entrypoint"

key-files:
  created: []
  modified:
    - src/ingestion/promos/run.ts
    - src/ingestion/promos/run.test.ts
    - scripts/scrape-promos.ts
    - .github/workflows/scrape-promos.yml

key-decisions:
  - "A book whose every found promo lands in LEGITIMATE_SKIP_REASONS (all SKIP_REASONS except unrecognized/schema_invalid) is now an ok/0-kept run; unrecognized/schema_invalid still fail loudly as a likely parser regression (owner-locked decision 1)"
  - "No schema/migration change and no UI copy change -- an ok/0-kept scrape_runs row already renders as '{Book} promos updated N min ago' via existing getScrapeStatus/describeScrapeStatus, and the 'no-active' empty-state copy is accurate for a book with zero usable promos (owner-locked decision 2, verified by reading the consumer chain, not by DB/UI testing)"
  - "actions/checkout and actions/setup-node bumped to @v7 (verified live via gh api: releases/latest tag_name v7.0.1 / v7.0.0, both confirmed using: node24 in their action.yml); node-version '22' and cache 'npm' inputs kept unchanged since both remain valid inputs per each action's current action.yml and neither release's changelog mentions removing/renaming them (owner-locked decision 4)"

requirements-completed: [QUICK-260927-ov2]

# Metrics
duration: 15min
completed: 2026-09-27
---

# Quick Task 260927-ov2: Scraper no-usable-promos fix Summary

**FanDuel-shape all-excluded scrape runs now record ok/0-kept instead of failing the job; the morning odds refresh survives a failed scrape step; GitHub Actions bumped to verified Node-24 majors (v7).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-27T18:00:00-06:00 (approx, first RED test run)
- **Completed:** 2026-09-27T18:02:22-06:00
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `LEGITIMATE_SKIP_REASONS` distinguishes deliberate exclusions (parlays, new-customer offers, unsupported sports, etc.) from `unrecognized`/`schema_invalid`, which still signal a real parser regression
- The WR-03 branch in `runPromoScrape` now splits: found>0 + zero candidates + every skip legitimate -> `ok`/0-kept, no commit, no `loadEvents` call, existing promos untouched; any regression-flavored skip (or zero skips) -> still `failed`
- `scrapeExitCode(outcomes)` is the single source of truth for the CLI's process exit code, used by both `scripts/scrape-promos.ts` and covered directly by tests
- The scheduled workflow's morning odds/profit-observation step now runs with `if: ${{ !cancelled() }}`, so a failed or all-excluded scrape step no longer blocks the once-daily moneyline refresh
- `actions/checkout@v4`/`actions/setup-node@v4` bumped to `@v7`/`@v7`, verified live against `gh api` (not guessed), both confirmed to run on the `node24` action runtime

## Task Commits

Each task was committed atomically (TDD RED -> GREEN for Task 1):

1. **Task 1 (RED): add failing tests for legitimate-skip ok runs and scrapeExitCode** - `6fa9a6d` (test)
2. **Task 1 (GREEN): treat all-legitimately-skipped books as ok, add scrapeExitCode** - `01ddb59` (feat)
3. **Task 2: run morning odds step after a failed scrape, bump Actions majors** - `be48e83` (fix)

_No plan-metadata commit was made per this execution's constraints (SUMMARY.md, STATE.md, PLAN.md intentionally left uncommitted)._

## Files Created/Modified
- `src/ingestion/promos/run.ts` - Added `LEGITIMATE_SKIP_REASONS` (SKIP_REASONS minus `unrecognized`/`schema_invalid`), split the WR-03 zero-candidates branch into ok-vs-failed based on skip reasons, exported `scrapeExitCode`
- `src/ingestion/promos/run.test.ts` - Renamed the existing WR-03 test to "parser-regression skips", added a FanDuel-shape ok test, a mixed legit+unrecognized failed test, `scrapeExitCode` assertions on the existing found===0 test, and new `LEGITIMATE_SKIP_REASONS`/`scrapeExitCode` describe blocks (21 tests total in this file, up from 15)
- `scripts/scrape-promos.ts` - Replaced the inline `anyFailed` exit-code check with `process.exit(scrapeExitCode(outcomes))`
- `.github/workflows/scrape-promos.yml` - `actions/checkout@v4` -> `@v7`, `actions/setup-node@v4` -> `@v7`, added `if: ${{ !cancelled() }}` to the `npm run odds:morning-observe` step with an explanatory comment

## Decisions Made
- Kept the two other candidate designs for "legitimate vs. regression" out of scope: no new `scrape_runs` column for skip-reason breakdowns (skip counts stay JSON-logged per book to the Actions log via `BookRunOutcome.skippedByReason`, per the plan's explicit "do NOT add a column/migration" instruction) and no UI copy change (verified the full consumer chain -- `getScrapeStatus` -> `get-promos.ts` -> `describeScrapeStatus` / `PromosEmptyState` -- already renders an ok/0-kept row correctly)
- `node-version: "22"` and `cache: "npm"` were left unchanged on the setup-node bump; both are still valid inputs in `setup-node@v7`'s `action.yml`, and the v7.0.0 release notes (ESM migration, cache-key outputs, bug fixes) mention nothing about removing or renaming either input

## Deviations from Plan

None - plan executed exactly as written, including the TDD RED/GREEN split for Task 1 and the `gh api`-verified (not guessed) Actions version bump for Task 2.

## Issues Encountered

The plan's own verification commands (`cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && ...`) point at the main repo root rather than this execution's worktree. Running them literally would have tested/linted the pre-existing main-repo files instead of this worktree's changes (silently "passing" against unmodified code). All verification in this execution was instead run with `cd` into the actual worktree directory (`.claude/worktrees/agent-a133a06ff121e93cf`), which is the correct target per the worktree isolation contract. No plan or code fix needed -- purely an execution-environment note for future quick-task runs from a worktree.

## User Setup Required

None - no external service configuration required. No DB migration, no Odds API call, and no workflow dispatch were performed in this execution per the task's constraints; `gh api` calls were read-only release/content lookups against `actions/checkout` and `actions/setup-node`.

## Next Phase Readiness

- The next real scheduled run of `.github/workflows/scrape-promos.yml` (or a manual `workflow_dispatch`, which this execution did not trigger) will exercise the actual behavior end-to-end against live promo pages -- worth a quick check of the Actions log after the next run to confirm a FanDuel-shape run now shows green with `promosKept: 0` instead of red.
- No blockers. The paused go-live items noted in STATE.md (public repo, `DATABASE_URL` secret not yet set) are unrelated to this fix and remain the owner's call.

---
*Phase: quick-260927-ov2*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: src/ingestion/promos/run.ts
- FOUND: src/ingestion/promos/run.test.ts
- FOUND: scripts/scrape-promos.ts
- FOUND: .github/workflows/scrape-promos.yml
- FOUND: 6fa9a6d (test commit)
- FOUND: 01ddb59 (feat commit)
- FOUND: be48e83 (fix commit)
