---
phase: quick-260928-i3r
plan: 01
subsystem: ingestion
tags: [draftkings, fanduel, promo-parsing, regex, github-actions-cron, vitest]

# Dependency graph
requires:
  - phase: 03 (promo ingestion/matching)
    provides: classifyExclusion, sportFromText/sportFromTags, draftkingsScraper, fanduelScraper, matchPromo
provides:
  - Widened PROP_RE (case-insensitive "home runs?"/"batter\s*>") plus a new case-sensitive PROP_HR_RE (\bHRs?\b) so DraftKings' "MLB HR Bet and Get" (real fixture 1127668) classifies as "prop" instead of failing ScrapedPromoSchema
  - DraftKings pre-buildCandidate guard: any entry with no parseable "Profit Boost: N%" is skipped as "unrecognized" (flagged for review) instead of building a candidate guaranteed to fail schema validation
  - scrape-promos.yml cron moved from minute :00 to :07 (GitHub's most-delayed/most-dropped minute), both the live America/Denver schedule and the documented UTC fallback
  - LIVE_ONLY_RE negative lookbehind so "pre-live wager"/"pre live wager" no longer false-positive as live_only (real FanDuel fixture LONFLMNFRE0928, "NFL Reward Escalator")
  - fanduel.ts GAME_SCOPE_RE/parseGameScope + withInferredYear -- a single-game team-pair scope fallback (mirroring DraftKings' GAME_SCOPE_RE) for FanDuel promos that name two teams with no year in the date, fixing a garbage-team-name bug that the old splitTeams-on-raw-text fallback would have produced once live_only stopped excluding this promo
  - Table-driven regression tests pinning the full keep/skip maps for the 2026-09-28 DraftKings fixture (23 found, 0 candidates, zero unrecognized/schema_invalid) and the 2026-09-28 FanDuel fixture (LONFLMNFRE0928 now a kept profit_boost candidate)
affects: [ingestion/promos, .github/workflows/scrape-promos.yml, any future book parser needing single-game team-pair scope parsing without a year in the date text]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Case-sensitive exclusion sub-regex (PROP_HR_RE) OR'd alongside a case-insensitive main regex (PROP_RE) when a short all-caps abbreviation (HR/HRs) collides with unrelated lowercase boilerplate wording (24 hr window, 48 hrs) that must stay case-sensitive to avoid false positives"
    - "Negative lookbehind on an exclusion regex ((?<!pre[- ])\\blive...) to exclude a semantically-opposite prefixed variant (pre-live = pre-game) that would otherwise satisfy the same word-boundary match"
    - "Missing-required-field guard placed immediately before buildCandidate (not relying on schema rejection) so a genuinely new promo shape surfaces as 'unrecognized' for review instead of reading as a scraper schema bug"
    - "Single-game team-pair scope regex (a book-specific GAME_SCOPE_RE) as a fallback when the book's own sport-wide scope phrase doesn't match, with an explicit year-inference helper (withInferredYear) borrowing the promo's own expiry year when the source text's date has no year"

key-files:
  created:
    - src/test/fixtures/promos/fanduel-promos-2026-09-28.json
  modified:
    - src/ingestion/promos/exclusions.ts
    - src/ingestion/promos/exclusions.test.ts
    - src/ingestion/promos/books/draftkings.ts
    - src/ingestion/promos/books/draftkings.test.ts
    - src/ingestion/promos/books/fanduel.ts
    - src/ingestion/promos/books/fanduel.test.ts
    - .github/workflows/scrape-promos.yml

key-decisions:
  - "HR/HRs kept as its own case-sensitive regex rather than folded into the case-insensitive PROP_RE, since real DK/Bally/FanDuel boilerplate uses lowercase 'hr'/'hrs' purely as a time-duration abbreviation that has nothing to do with home runs."
  - "The missing-boost-% guard in draftkings.ts checks BOOST_PERCENT_RE.test(text) directly (no /g flag, so .test is stateless) rather than reusing buildCandidate's already-computed boostMatch, keeping the guard a simple pre-check with no risk of consuming buildCandidate's own regex state."
  - "FanDuel's GAME_SCOPE_RE infers the missing year from the promo's own combinedEndDate/expiresAt rather than from 'now' -- the promo's expiry is always close to the named game in every observed fixture, while 'now' could be wrong across a Dec 31/Jan 1 scrape-run boundary."
  - "SCOPE_PHRASE_RE (FanDuel's sport-wide phrase, which already carries a year) always wins over the new single-game GAME_SCOPE_RE when both are present -- GAME_SCOPE_RE is only tried as a fallback, matching the same precedence pattern DraftKings already established."

patterns-established:
  - "Coordinator mid-execution findings for the same quick task get their own dedicated task/commit after the originally-planned tasks complete, verified against the full existing test suite before committing, exactly like a planned task."

requirements-completed: [QUICK-260928-i3r]

# Metrics
duration: 13min
completed: 2026-09-28
---

# Quick Task 260928-i3r: DraftKings HR Prop Skip, Cron Minute, and FanDuel Pre-Live Fix Summary

**DraftKings HR/batter promos now classify as "prop" instead of crashing the scrape job; the scrape cron moved off GitHub's most-delayed minute; and a coordinator-reported FanDuel "pre-live wager" false positive is fixed with a real team-pair scope parser, not just a regex tweak**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-28T19:04:36Z
- **Completed:** 2026-09-28T19:16:57Z
- **Tasks:** 3 (2 planned + 1 coordinator mid-execution finding)
- **Files modified:** 8 (1 created)

## Accomplishments

- DraftKings promo 1127668 ("MLB HR Bet and Get") now skips as `"prop"` instead of failing `ScrapedPromoSchema` and exiting the scrape job with code 1 -- the 2026-09-28 DraftKings capture now produces zero `schema_invalid`/`unrecognized` skips (found 23, 0 candidates, the honest kept set)
- Any future DraftKings entry with no parseable `"Profit Boost: N%"` now skips as `"unrecognized"` (flagged for review) before a doomed candidate is ever built, rather than failing schema validation with a `console.warn`
- The `scrape-promos.yml` cron moved from minute `:00` to `:07` on all three daily runs (8:07/12:07/17:07 America/Denver) -- avoids GitHub's most heavily loaded, most-delayed, most-often-dropped top-of-the-hour scheduling slot; the 8:07 run still falls inside `isMorningObservationWindow` (Denver hour < 10) with ~1h52m of delay tolerance
- Coordinator finding (mid-execution): real FanDuel promo LONFLMNFRE0928 ("NFL Reward Escalator") was misclassified `live_only` because its own copy says "...to use on any **pre-live** wager..." -- "pre-live" means pre-game, the opposite of live. Fixed with a negative lookbehind, and it is now a correctly-parsed, event-scoped `profit_boost` candidate (30% boost, Eagles @ Bears, not the escalator's "100% PBT" ceiling)
- Every existing fixture (Bally, FanDuel original, DraftKings original/2026-09-27) keeps exactly its current candidates and skip reasons -- no pre-existing test expectations changed

## Task Commits

1. **Task 1: Classify HR/batter promos as prop, and add the DraftKings missing-boost-% "unrecognized" guard** - `d9fc081` (fix)
2. **Task 2: Move the scrape-promos cron to minute :07** - `3be1550` (chore)
3. **Task 3 (coordinator mid-execution finding): FanDuel "pre-live wager" no longer false-positives as live_only** - `3f429c2` (fix)

_Note: per constraints, this SUMMARY.md is intentionally NOT committed, and STATE.md/PLAN.md/ROADMAP.md were left untouched._

## Files Created/Modified

- `src/ingestion/promos/exclusions.ts` - Widened `PROP_RE` with `\bhome runs?\b`/`\bbatter\s*>`; added case-sensitive `PROP_HR_RE` (`\bHRs?\b`) OR'd into the prop check; added negative lookbehind to `LIVE_ONLY_RE` for "pre-live"/"pre live"
- `src/ingestion/promos/exclusions.test.ts` - Table-driven positive/negative cases for HR/home-run/batter-prop wording, lowercase hr/run-boundary boilerplate collisions, and pre-live-wager non-matches
- `src/ingestion/promos/books/draftkings.ts` - New pre-`buildCandidate` guard: `!BOOST_PERCENT_RE.test(text)` skips as `"unrecognized"`; header doc comment updated to describe the full skip-order including this guard
- `src/ingestion/promos/books/draftkings.test.ts` - New `FIXTURE_PATH_20260928`/`parseFixture20260928` helper; new describe block pinning the full 23-entry skip map (1127668 now `"prop"`); rewrote the old forced-invalid test as an "unrecognized, no warn" test; added a spied genuine-`schema_invalid` test (`vi.spyOn(ScrapedPromoSchema, "safeParse")`)
- `src/ingestion/promos/books/fanduel.ts` - New `GAME_SCOPE_RE`/`parseGameScope` (single-game team-pair fallback scope) and `withInferredYear` (borrows the promo's expiry year for a date text with no year); `buildCandidate` now tries `extractScope` → `parseGameScope` → raw-`entry.name` fallback in that order
- `src/ingestion/promos/books/fanduel.test.ts` - New describe block loading the 2026-09-28 fixture: pins the full keep/skip map and every field of the newly-kept LONFLMNFRE0928 candidate
- `.github/workflows/scrape-promos.yml` - Cron `"0 8,12,17 * * *"` → `"7 8,12,17 * * *"`; UTC fallback comment `"0 14,18,23 * * *"` → `"7 14,18,23 * * *"`; explanatory comments updated to 8:07/12:07/17:07 wording
- `src/test/fixtures/promos/fanduel-promos-2026-09-28.json` (new) - Live FanDuel promo capture from 2026-09-28 containing LONFLMNFRE0928, copied from the coordinator-provided scratchpad capture

## Decisions Made

See `key-decisions` in frontmatter for full rationale on each regex-boundary and precedence choice. Summary:
- HR/HRs kept case-sensitive and separate from the main case-insensitive `PROP_RE` to avoid colliding with lowercase "hr"/"hrs" time-duration boilerplate.
- The missing-boost-% guard is a simple stateless pre-check (`BOOST_PERCENT_RE.test`), not a refactor of `buildCandidate`.
- FanDuel's inferred year for a year-less single-game date comes from the promo's own expiry, never from "now".
- FanDuel's sport-wide `SCOPE_PHRASE_RE` still wins over the new single-game `GAME_SCOPE_RE` when both match, matching DraftKings' established precedence pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Coordinator-reported, addressed as an in-scope finding] FanDuel "pre-live wager" false-positived as live_only**
- **Found during:** mid-execution message from the coordinator (owner), after Task 1 and Task 2 were already committed
- **Issue:** `LIVE_ONLY_RE` (`/\blive[- ]wagers?\b|\blive[- ]only\b/i`) matched "live wager" inside "pre-live wager" in real FanDuel promo LONFLMNFRE0928's own copy, even though "pre-live" means pre-game (the opposite of live). This silently dropped a real, hedgeable 30% profit-boost promo from the feed.
- **Fix:** Added a negative lookbehind, `(?<!pre[- ])`, to both `LIVE_ONLY_RE` alternatives, rejecting a "live wager(s)"/"live only" match immediately preceded by "pre-" or "pre ". Also fixed a second, deeper bug this exposed: once `live_only` stopped excluding LONFLMNFRE0928, `buildCandidate`'s only team-name fallback (`splitTeams` run directly on the raw marketing sentence, since no scope phrase matched) would have split on the promo's own embedded " @ " and produced garbage team names (a long prefix ending in "...for the Eagles" / a long suffix starting with "Bears NFL Game on..."). Root-caused and fixed in `fanduel.ts` by adding `GAME_SCOPE_RE`/`parseGameScope`, a proper single-game team-pair scope parser (mirroring DraftKings' existing `GAME_SCOPE_RE` pattern), tried before the raw-text fallback.
- **Files modified:** `src/ingestion/promos/exclusions.ts`, `src/ingestion/promos/exclusions.test.ts`, `src/ingestion/promos/books/fanduel.ts`, `src/ingestion/promos/books/fanduel.test.ts`, `src/test/fixtures/promos/fanduel-promos-2026-09-28.json` (new)
- **Verification:** Full keep/skip map pinned for the new fixture; LONFLMNFRE0928's every field verified (`boostPercent` "30.00" -- confirmed the escalator's "UP TO a 100% PBT(s)" wording does not win; `teamsText` `["Eagles", "Bears"]`; `expiresAt` "2026-09-29T00:15:00.000Z"; `maxStake` null with `unparsedCapFields` `["maxStake", "minOdds"]`, the normal list-only cap-review path, nothing invented). Existing Bally/FanDuel/DraftKings fixture maps unchanged.
- **Committed in:** `3f429c2`

---

**Total deviations:** 1 (coordinator-reported finding, treated as an additional in-scope task per explicit mid-execution instruction)
**Impact on plan:** No scope creep -- this was an explicit, separately-dispatched instruction from the coordinator to fix a second real classification bug discovered in the same promo-exclusion code this task was already touching. All three commits are independently atomic and each pass the full test suite on their own.

## Issues Encountered

None beyond the coordinator-reported FanDuel finding documented above. The `PROP_RE`/`PROP_HR_RE` and `LIVE_ONLY_RE` wording-collision risks were checked directly against every fixture file under `src/test/fixtures/promos/` (via the full `npx vitest run` pass after each change) before committing, so no pre-existing fixture expectations were at risk.

## User Setup Required

None - no external service configuration required. The GitHub Actions cron change takes effect automatically once merged to the branch GitHub Actions watches; no secrets or dispatch changes were made.

## Verification Results

- `npx vitest run` (whole suite, from this worktree): **775/775 passed** (56 test files)
- `npx vitest run src/ingestion/promos` (targeted): **152/152 passed**
- `npx tsc --noEmit`: 1 pre-existing error, `src/app/layout.tsx(21,50): error TS2304: Cannot find name 'LayoutProps'` -- the known worktree artifact called out in the dispatch constraints, unrelated to any file this task touched
- `npx eslint` on all seven touched source/test files: clean, no output
- Task 2's automated verify command (cron string grep + UTC fallback grep + no-minute-`:00` grep + `python3 -c "yaml.safe_load(...)"`): all passed
- `git log --oneline -4`: shows all three atomic commits (`d9fc081`, `3be1550`, `3f429c2`) on top of the pre-dispatch plan commit (`9278fea`)
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` after each commit: no unexpected file deletions

## Next Phase Readiness

- No blockers. The DraftKings HR-prop classification, the missing-boost-% guard, the cron minute change, and the FanDuel pre-live fix are all covered by regression tests and ready for the next scheduled scrape run to pick up automatically.
- The scrape job should no longer exit 1 on the 2026-09-28 DraftKings capture, and LONFLMNFRE0928 (or any future FanDuel "pre-live wager" promo) will now correctly surface in the opportunities feed instead of being silently dropped.

## Self-Check: PASSED

- FOUND: src/ingestion/promos/exclusions.ts
- FOUND: src/ingestion/promos/exclusions.test.ts
- FOUND: src/ingestion/promos/books/draftkings.ts
- FOUND: src/ingestion/promos/books/draftkings.test.ts
- FOUND: src/ingestion/promos/books/fanduel.ts
- FOUND: src/ingestion/promos/books/fanduel.test.ts
- FOUND: .github/workflows/scrape-promos.yml
- FOUND: src/test/fixtures/promos/fanduel-promos-2026-09-28.json
- FOUND: commit d9fc081
- FOUND: commit 3be1550
- FOUND: commit 3f429c2

---
*Quick task: 260928-i3r-draftkings-bet-and-get-prop-skip-and-sch*
*Completed: 2026-09-28*
