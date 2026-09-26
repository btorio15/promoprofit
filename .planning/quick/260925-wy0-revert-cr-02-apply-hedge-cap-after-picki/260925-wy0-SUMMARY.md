---
phase: quick-260925-wy0
plan: 01
subsystem: hedge-engine
tags: [decimal.js, vitest, hedge-cap, tdd]

# Dependency graph
requires:
  - phase: 01.1-arbitrage-tab
    provides: rankBonusBetHedges cap logic (D-18) and the CR-02 fix being reverted
provides:
  - Restored pre-CR-02 hedge-cap semantics in rankBonusBetHedges (owner-approved via UAT 01.1 Test 5)
  - Updated unit and action tests pinning the dropped/kept outcomes for a capped game
affects: [01.1-arbitrage-tab, bonus-bet-finder]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/domain/hedge/rankBonusBetHedges.ts
    - src/domain/hedge/rankBonusBetHedges.test.ts
    - src/app/actions/find-hedges.test.ts

key-decisions:
  - "Reverted CR-02 (commit 26e3e40) per owner UAT decision: a game's best orientation is chosen from UNCAPPED candidates first; if that orientation exceeds maxHedgeStake the game is dropped entirely, never replaced by a cheaper, worse orientation."
  - "find-hedges.ts required no code change -- its limitExcludedAll logic (capped empty && uncapped non-empty) already matched the restored semantics."

patterns-established: []

requirements-completed: [UAT-01.1-T5]

# Metrics
duration: 10min
completed: 2026-09-26
---

# Quick Task 260925-wy0: Revert CR-02 -- apply hedge cap after picking each game's best orientation Summary

**Reverted the CR-02 in-loop hedge-cap check back to a post-selection filter, so a game whose best (highest-profit) orientation exceeds the cap is dropped rather than falling back to its cheaper, worse orientation -- per the owner's UAT 01.1 Test 5 decision.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-25T23:40:00-06:00 (approx, after prior UAT commit)
- **Completed:** 2026-09-25T23:47:42-06:00
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- Restored the pre-CR-02 `rankBonusBetHedges` cap order: pick each game's best orientation from all (uncapped) candidates, then filter `withinCap` before sort/slice
- Replaced the CR-02 unit test with a live Dodgers @ Giants fixture proving the game is present uncapped (hedgeStake 201.11, profit 61.88), present at a cap exactly equal to that hedge stake (201.11, lte semantics), and absent at a $150 cap -- never falling back to the $7.88/$22.06 Dodgers orientation
- Updated the two `find-hedges.test.ts` action tests that CR-02 had changed: the $50-cap test now expects all three fixture games dropped, and a new $250-cap test confirms nfl-packers-panthers (needs a $306.92 hedge) is dropped while nba-nuggets-jazz and mlb-dodgers-rockies (220.00/217.50) survive unchanged
- Confirmed `find-hedges.ts` needed no code change and the finder UI's "No hedges fit under your limit" empty state (`src/components/finder/EmptyState.tsx`) already reads `limitExcludedAll` correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Restore post-selection cap in rankBonusBetHedges and replace the CR-02 unit test** - `19ab874` (fix, tdd)
2. **Task 2: Revisit the find-hedges action tests that CR-02 changed, then run the full gates** - `5aef9e1` (test)

_Note: Task 1 followed RED/GREEN: the new test was verified to FAIL against the CR-02 code (via `git stash` of the implementation file) before the fix was reapplied and reverified GREEN, though both steps landed in a single commit since the test and the revert are two sides of one atomic change per the plan's `files_modified`._

## Files Created/Modified
- `src/domain/hedge/rankBonusBetHedges.ts` - Removed the in-loop `maxHedgeStake` continue; restored the post-loop `withinCap` filter (`hedgeStake.lte(opts.maxHedgeStake)`) applied to each game's already-selected best orientation, before sort/slice. Updated the `RankOptions.maxHedgeStake` JSDoc and the D-18 code comment to state the owner's rule explicitly.
- `src/domain/hedge/rankBonusBetHedges.test.ts` - Deleted "keeps a game whose lower-profit orientation fits under the cap (CR-02)"; added "drops a game whose best orientation exceeds the cap instead of falling back to its cheaper orientation (UAT 01.1 Test 5)" using a Dodgers @ Giants fixture (draftkings bonus, fanduel hedge), asserting uncapped (201.11/61.88), capped-at-exactly-201.11 (still present), and capped-at-150 (absent, length 0).
- `src/app/actions/find-hedges.test.ts` - Rewrote the D-18 cap test to use `maxHedgeAmount: "50"` (below every fixture game's best-orientation hedge) with a comment explaining the owner's no-fallback rule; replaced "keeps games whose favorite-side orientation fits under the cap (CR-02)" with "drops only games whose best orientation exceeds the cap (UAT 01.1 Test 5)" using `maxHedgeAmount: "250"`, asserting the nfl game (needs 306.92) is dropped, the nba/mlb games survive with numbers identical to their uncapped rows, and `limitExcludedAll.americanfootball_nfl` is true while `limitExcludedAll.all` is false.

## Decisions Made
- Confirmed via hand-computation (american-odds -> decimal -> `calculateBonusBetHedge`) that the Dodgers @ Giants fixture's best orientation (bonus on Giants +263, hedge Dodgers -325 at fanduel) produces hedgeStake 201.11 / guaranteedProfit 61.88, and the alternate orientation (bonus on Dodgers -334, hedge Giants +280) produces hedgeStake 7.88 / guaranteedProfit 22.06 -- matching the plan's interface-block figures exactly, so no fixture adjustment was needed.
- `find-hedges.ts` left unchanged as directed; its `limitExcludedAll` computation already implements "capped empty && uncapped non-empty" and needed no modification for the restored ranker semantics.

## Deviations from Plan

None - plan executed exactly as written. `git diff --stat` against the pre-task HEAD touches exactly the 3 files listed in `files_modified`.

## Verification Results

- `npx vitest run src/domain/hedge/rankBonusBetHedges.test.ts` — 11/11 passed (new test verified RED against unmodified CR-02 code, then GREEN after the fix)
- `npx vitest run` (full suite) — 207/207 passed
- `npm run typecheck` — clean
- `npm run lint` — clean
- `grep -n "maxHedgeStake" src/domain/hedge/rankBonusBetHedges.ts` — cap appears only in `RankOptions` and the post-loop `withinCap` filter; no in-loop check
- `grep -c "CR-02" src/domain/hedge/rankBonusBetHedges.test.ts src/app/actions/find-hedges.test.ts` — 0 in both files
- `grep -rn "No hedges fit under your limit" src/components/finder` — confirmed in `EmptyState.tsx`, reads `limitExcludedAll` (via `ResultsList.tsx`), no change needed

## Self-Check: PASSED

- FOUND: src/domain/hedge/rankBonusBetHedges.ts (modified, cap restored)
- FOUND: src/domain/hedge/rankBonusBetHedges.test.ts (modified, CR-02 test replaced)
- FOUND: src/app/actions/find-hedges.test.ts (modified, CR-02 test replaced)
- FOUND: commit 19ab874 (Task 1)
- FOUND: commit 5aef9e1 (Task 2)
