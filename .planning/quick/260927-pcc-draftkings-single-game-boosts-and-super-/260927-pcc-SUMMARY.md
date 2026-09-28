---
phase: quick-260927-pcc
plan: 01
subsystem: ingestion
tags: [draftkings, promo-parsing, regex, sport-inference, vitest]

# Dependency graph
requires:
  - phase: 03 (promo ingestion/matching)
    provides: classifyExclusion, sportFromText/sportFromTags, draftkingsScraper, matchPromo, TEAM_ALIASES/resolveTeam
provides:
  - Widened PROP_RE that classifies DK "Super Boost" player-stat wording (receiving/rushing/passing yards, receptions, strikeouts, rebounds, assists, guarded "to record/have N+") as "prop" instead of "unrecognized"
  - sportFromTeamPair(teamA, teamB) in sportHints.ts -- infers a supported sport from a resolved team-name pair when promo text never names a sport
  - GAME_SCOPE_RE + parseGameScope in draftkings.ts -- parses DK's "for the A @ B game on <date>[ at HH:MM PM ET]" single-game phrase into an event-scoped candidate (teamsText, scopeText, slateWindow)
  - Table-driven regression tests pinning the full keep/skip map for the 2026-09-27 DK fixture (23 found, 3 candidates, 20 skipped, zero unrecognized)
affects: [ingestion/promos, domain/promos/matcher, any future book parser needing team-name-only sport inference]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Team-name-only sport inference via resolveTeam against TEAM_ALIASES per sport, requiring exactly one sport to have both team names resolve unambiguously (never guesses; college matchups intentionally fall through to unknown since there are no ncaaf/ncaab alias tables)"
    - "Single-game scope regexes use negated-character-class lazy quantifiers ([^\\n@!]+?) with no nested quantifiers to avoid catastrophic backtracking on multi-KB promo terms, and require a literal anchor phrase ('for the') to avoid colliding with unrelated boilerplate wording"

key-files:
  created: []
  modified:
    - src/ingestion/promos/exclusions.ts
    - src/ingestion/promos/exclusions.test.ts
    - src/ingestion/promos/sportHints.ts
    - src/ingestion/promos/books/draftkings.ts
    - src/ingestion/promos/books/draftkings.test.ts

key-decisions:
  - "No bare 'points' alternative added to PROP_RE -- spread/total copy ('Broncos -3.5 points', 'Over 45.5 total points') also says 'points', so a bare match would false-positive ordinary game lines."
  - "The 'to record/have' PROP_RE alternative requires a trailing 'N+' -- bare 'record' appears in generic legal boilerplate ('keep a record of your bets'), and Bally/FanDuel copy isn't boilerplate-stripped the way DK's is."
  - "GAME_SCOPE_RE requires the literal 'for the' prefix so DK's own boilerplate ('end of the final NFL game on 9/27/2026') can never match -- confirmed via a wording-collision scan across all Bally/FanDuel/DK fixtures before implementation."
  - "SCOPE_RE (sport-wide 'for all <sport> games on <date>') always wins over GAME_SCOPE_RE when both phrases are present in the same promo -- GAME_SCOPE_RE is only tried when SCOPE_RE doesn't match."
  - "A parsed kickoff time that falls outside the slateWindow computed from the game-scope date is discarded (not trusted) -- the window falls back to the entry's own startDate/expiresAt instead."

patterns-established:
  - "Pure helper functions (parseGameScope) that return null-or-structured-data, called both from the parse-loop's skip decision and independently from buildCandidate -- avoids threading extra state through the loop."

requirements-completed: [QUICK-260927-pcc]

# Metrics
duration: 7min
completed: 2026-09-27
---

# Quick Task 260927-pcc: DraftKings Single-Game Boosts and Prop Label Summary

**Widened DK prop-classification regex and added team-name-only sport inference so a live single-game profit boost and a player-stat Super Boost no longer misclassify as "unrecognized"**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-27T18:20:38-06:00
- **Completed:** 2026-09-27T18:27:07-06:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- DraftKings promo 1126403 ("LA Rams @ DEN Broncos 50% Profit Boost") now parses as a kept, event-scoped `profit_boost` candidate (teams, window, all money fields correct) instead of being dropped as "unrecognized"
- DraftKings promo 1127153 ("Sunday Night Football Super Boost", a Waddle/Adams receiving-yards prop) now skips with reason `"prop"` instead of `"unrecognized"`
- Zero "unrecognized" skips remain for the 2026-09-27 DK capture (found 23, 3 candidates, 20 skipped) -- the fixture no longer counts as a parser regression
- Every other entry in the new fixture and every entry in the pre-existing DK/Bally/FanDuel fixtures classifies exactly as before (no expectation edits to any pre-existing test)

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs):

1. **Task 1: Classify player-stat Super Boosts as "prop"**
   - `363f158` test(quick-260927-pcc): add failing test for player-stat prop classification
   - `117aaf0` feat(quick-260927-pcc): classify player-stat Super Boosts as prop
2. **Task 2: Parse DK single-game "for the A @ B game on <date>" boosts**
   - `810370e` test(quick-260927-pcc): add failing tests for DK single-game scope parsing
   - `fcc35c1` feat(quick-260927-pcc): parse DK single-game "for the A @ B game on" boosts

_Note: the fixture `src/test/fixtures/promos/draftkings-promos-2026-09-27.json` was already committed at the base (`d75e807`, prior session) -- per the dispatch instructions, this execution skipped re-committing it and started directly with Task 1's RED test._

## Files Created/Modified
- `src/ingestion/promos/exclusions.ts` - Widened `PROP_RE` with receiving/rushing/passing-yards, receptions, strikeouts, rebounds, assists, and a guarded "to record/have N+" alternative
- `src/ingestion/promos/exclusions.test.ts` - Table-driven positive/negative cases pinning the new `PROP_RE` behavior and non-collision with spread/total/legal-boilerplate wording
- `src/ingestion/promos/sportHints.ts` - New exported `sportFromTeamPair(teamA, teamB)` that infers a supported sport from a resolved team-name pair via `TEAM_ALIASES`/`resolveTeam`
- `src/ingestion/promos/books/draftkings.ts` - New `GAME_SCOPE_RE` + `parseGameScope` helper; parse-loop and `buildCandidate` now fall through to an event-scoped candidate when the sport-wide `SCOPE_RE` phrase is absent but the single-game phrase is present; header doc comment updated
- `src/ingestion/promos/books/draftkings.test.ts` - New describe block loading the 2026-09-27 fixture: pins found/candidates/full skip map, all of 1126403's fields, a `matchPromo` round-trip against a synthetic Rams/Broncos event (with and without a sport hint), and four synthetic regression-guard cases

## Decisions Made
- No bare "points" alternative in `PROP_RE` (would false-positive spread/total lines) -- see key-decisions above for full rationale on each regex-boundary choice.
- `sportFromTeamPair` never guesses: it returns `unknown` unless exactly one sport has both team names resolve to exactly one team each. College matchups (no ncaaf/ncaab `TEAM_ALIASES` tables) always return `unknown` from this function -- acceptable because `matchPromo`'s `matchGameNamed` path resolves `teamsText` against cached events independently of this hint, using `sportKeyHint: null` to search all sports.
- A parsed kickoff time outside the computed `slateWindow` is discarded rather than trusted, falling back to the entry's own `startDate`/`expiresAt` -- keeps behavior conservative (matches the plan's action spec exactly).

## Deviations from Plan

None - plan executed exactly as written. All `must_haves.truths`, `artifacts`, and `key_links` from the PLAN.md frontmatter are satisfied; see verification below.

## Issues Encountered

None. The wording-collision scan noted in the plan's `<current_behavior>` section (checked directly against all fixture files under `src/test/fixtures/promos/`) confirmed the new regex vocabulary ("yards", "receptions", "strikeouts", "rebounds", "assists", "to record", "to each have") appears only in the new 2026-09-27 DK fixture, so no pre-existing fixture expectations were at risk.

## User Setup Required

None - no external service configuration required.

## Verification Results

- `npx vitest run` (whole suite, from this worktree): **754/754 passed** (56 test files)
- `npx vitest run src/ingestion/promos src/domain/promos`: **316/316 passed**
- `npx tsc --noEmit`: 1 pre-existing error, `src/app/layout.tsx(21,50): error TS2304: Cannot find name 'LayoutProps'` -- this is the known worktree artifact called out in the dispatch constraints (confirmed via `git log -1 -- src/app/layout.tsx`, last touched by an unrelated prior commit `cec7bd1`, not by this task). No other tsc errors.
- `npx eslint` on all five touched files (`--max-warnings=0`): **clean, no output**
- `git log --oneline`: shows the RED/GREEN commit pairs in order for both tasks, on top of the pre-existing fixture commit (`d75e807`) and plan commit (`c368010`)

## Next Phase Readiness
- No blockers. The DraftKings parser's single-game-scope path and the widened prop classifier are both covered by regression tests and ready for the next scheduled scrape run to pick up automatically.
- Merging near-duplicate promos (1123723/1126385, the two "NFL 50% Profit Boost" entries) remains explicitly out of scope per the plan's objective -- still two separate candidates, deferred by the owner.

## Self-Check: PASSED

- FOUND: src/ingestion/promos/exclusions.ts
- FOUND: src/ingestion/promos/exclusions.test.ts
- FOUND: src/ingestion/promos/sportHints.ts
- FOUND: src/ingestion/promos/books/draftkings.ts
- FOUND: src/ingestion/promos/books/draftkings.test.ts
- FOUND: commit 363f158
- FOUND: commit 117aaf0
- FOUND: commit 810370e
- FOUND: commit fcc35c1

---
*Quick task: 260927-pcc-draftkings-single-game-boosts-and-super-*
*Completed: 2026-09-27*
