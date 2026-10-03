---
phase: 03-promo-scraping-review
plan: 05
subsystem: api
tags: [zod, decimal.js, promos, scraping, parsing, intl, vitest]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-01 Scraper Contract (3 http books), 03-03 promos/scrape_runs schema and domain vocabulary (types.ts)"
provides:
  - "src/domain/promos/scraped.ts — ScrapedPromoSchema (strict Zod 4), BookScraper/HttpRequestSpec/DetailPlan contract, SKIP_REASONS"
  - "src/domain/promos/dedupe.ts — promoDedupeKey (D-19: match/scope excluded)"
  - "src/domain/promos/lifecycle.ts — statusAfterMatch (D-18 cap-review routing)"
  - "src/domain/promos/etTime.ts — parseEtDateTime/etDayWindow/etDayBounds/etDayLabel/slateWindow"
  - "src/ingestion/promos/finePrint.ts — htmlToText, parseMaxStake/parseMaxWinnings/parseMinOdds/extractFinePrintNote"
  - "src/ingestion/promos/exclusions.ts — classifyExclusion (D-15)"
  - "src/ingestion/promos/sportHints.ts — sportFromText/sportFromTags"
  - "src/ingestion/promos/promoText.ts — splitTeams"
affects: [03-06, 03-12, 03-13, 03-14, 03-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope-based promo shape (game-wide or sport+date-wide) replaces the earlier single-market ScrapedPromo design, per 03-RECON.md Design Implication 1 — the app picks the market/side later (Plan 04), the scraper never does"
    - "Cap-parsing helpers detect a 'mention' (max+bet/wager/stake keyword) and a numeric amount as two independent checks per line, not one adjacent regex — DraftKings' 'MAX $25 WAGER' wedges the amount between the two keywords"
    - "D-15 exclusion priority: not-a-promo > title-level SGP/Parlay > outright/futures > player-prop > terms-based Parlay/SGP-with-no-Single fallback — a title-level Parlay/SGP signal always wins over an incidental Scorer/prop mention in the same title"
    - "ET wall-time <-> UTC conversion via Intl.DateTimeFormat shortOffset probed at noon UTC on the target date, never a hardcoded UTC-4/UTC-5 offset — correct across DST transitions with no new dependency"
    - "dedupe key hashes identity + money/price fields only; match/scope fields (teams, window, sport hint) are deliberately excluded so re-matching a promo never spawns a duplicate row (D-19)"

key-files:
  created:
    - src/domain/promos/scraped.ts
    - src/domain/promos/scraped.test.ts
    - src/domain/promos/dedupe.ts
    - src/domain/promos/dedupe.test.ts
    - src/domain/promos/lifecycle.ts
    - src/domain/promos/lifecycle.test.ts
    - src/domain/promos/etTime.ts
    - src/domain/promos/etTime.test.ts
    - src/ingestion/promos/finePrint.ts
    - src/ingestion/promos/finePrint.test.ts
    - src/ingestion/promos/exclusions.ts
    - src/ingestion/promos/exclusions.test.ts
    - src/ingestion/promos/sportHints.ts
    - src/ingestion/promos/promoText.ts
    - src/ingestion/promos/promoText.test.ts
  modified: []

key-decisions:
  - "ScrapedPromoSchema.pinned generalizes the plan's explicitly-tested spread half-point rule to totals too (both use isHalfPoint from spreadsTotalsFilter.ts), since a total's line has the identical push-risk reasoning as a spread's — only spread was in the plan's behavior list, but the schema enforces the same rule for total"
  - "classifyExclusion checks title-level SGP/Parlay before the generic futures/outright/player-prop wording, not after (the plan's action-text prose lists prop before title-SGP/Parlay, but its own behavior list requires '25% NFL TD Scorer Parlay Profit Boost' -> parlay, which only holds if Parlay is checked first) — the behavior list is the authoritative test spec, so implementation follows it"

patterns-established:
  - "Pattern: a shared ingestion helper file gets its own test file except when the plan explicitly nests its tests inside a sibling's test file (sportHints has no sportHints.test.ts — its cases live in promoText.test.ts per this plan's acceptance criteria)"

requirements-completed: [PROMO-03, PROMO-04]

# Metrics
duration: 13min
completed: 2026-09-26
---

# Phase 3 Plan 5: Scope-Based Promo Contract & Shared Parsing Helpers Summary

**Strict Zod 4 ScrapedPromo/BookScraper contract for game-wide and sport+date-wide promos, plus one shared, unit-tested rule set (cap parsing, D-15 exclusions, sport hints, team splitting, Eastern-time windows) that all three book parsers (Plans 12-14) will reuse verbatim.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-26T23:45:17-06:00 (first commit on this plan)
- **Completed:** 2026-09-26T23:57:54-06:00
- **Tasks:** 2 completed (both TDD RED -> GREEN)
- **Files modified:** 15 created, 0 modified

## Accomplishments

- `ScrapedPromoSchema` (strict Zod 4 object + `superRefine`) validates the scope-based shape recon found: sport-wide (`teamsText: []`) or game-wide (`teamsText` of exactly 2), cross-field rules for boost/bonus/pinned-price consistency, `SPORT_KEYS` gating, and half-point pinned spread/total lines — 16 behavior cases from the plan, all passing
- `BookScraper`/`HttpRequestSpec`/`DetailPlan` contract fixes `render: "http"` and `stealth: false` as literal types (D-09: no browser mode exists in the type system at all, not just unused)
- `promoDedupeKey` (sha256) and `statusAfterMatch` implement D-19 (match/scope excluded from the key) and D-18 (a boost with no parsed `maxStake` always routes to `pending_review/caps`) exactly per the plan's behavior table
- `finePrint.ts` parses every verbatim cap/min-odds string from 03-RECON.md's Observed Promos table, including Bally's `"-+100"` sign typo and DraftKings' `"MAX $25 WAGER"` (amount wedged between the two mention keywords) — normalizes every amount via `decimal.js`, never `parseFloat`
- `exclusions.ts` classifies every D-15 skip reason from real book titles/terms, keeping the DraftKings "Single, Parlay, SGP, or SGPx" boost (Single survives) and correctly routing a Parlay-themed scorer boost ("TD Scorer Parlay") to `parlay` rather than `prop`
- `etTime.ts` converts ET wall-clock text to UTC ISO using `Intl.DateTimeFormat`'s real EDT/EST offset for the target date (no hardcoded UTC-4/-5, no new dependency), and implements `slateWindow`'s 12-hour late-kickoff extension rule exactly

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Scope-based ScrapedPromo/BookScraper contract, dedupe key, lifecycle rule**
   - `171b4ce` (test) — RED: `scraped.test.ts`, `dedupe.test.ts`, `lifecycle.test.ts` (31 tests, all failing on missing modules)
   - `23692f7` (feat) — GREEN: `scraped.ts`, `dedupe.ts`, `lifecycle.ts` (31/31 passing)
2. **Task 2: Shared parsing helpers — fine print caps, D-15 exclusions, sport hints, teams, ET dates**
   - `770091d` (test) — RED: `finePrint.test.ts`, `exclusions.test.ts`, `promoText.test.ts` (incl. sportHints describe block), `etTime.test.ts` (55 tests, all failing on missing modules)
   - `b308102` (feat) — GREEN: `finePrint.ts`, `exclusions.ts`, `sportHints.ts`, `promoText.ts`, `etTime.ts` (55/55 passing); also fixed two test fixtures discovered to not match real book wording while making RED tests pass (see Deviations)

_No separate "Plan metadata" commit yet — SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/domain/promos/scraped.ts` — `ScrapedPromoSchema`, `ScrapedPromo`, `SKIP_REASONS`, `SkippedEntry`, `ParseResult`, `HttpRequestSpec`, `DetailPlan`, `BookScraper`
- `src/domain/promos/dedupe.ts` — `promoDedupeKey`
- `src/domain/promos/lifecycle.ts` — `statusAfterMatch`
- `src/domain/promos/etTime.ts` — `parseEtDateTime`, `etDayWindow`, `etDayBounds`, `etDayLabel`, `slateWindow`
- `src/ingestion/promos/finePrint.ts` — `htmlToText`, `parseMaxStake`, `parseMaxWinnings`, `parseMinOdds`, `extractFinePrintNote`, `CapParse<T>`
- `src/ingestion/promos/exclusions.ts` — `classifyExclusion`
- `src/ingestion/promos/sportHints.ts` — `sportFromText`, `sportFromTags`, `SportHint`
- `src/ingestion/promos/promoText.ts` — `splitTeams`
- Matching `*.test.ts` for every file above (86 tests total across `src/domain/promos` + `src/ingestion/promos`)

## Decisions Made

- `ScrapedPromoSchema`'s pinned-line half-point rule applies to both `spread` and `total` market types (only `spread` was in the plan's explicit behavior list), since a total's push-risk reasoning is identical to a spread's — this is the same `isHalfPoint` helper `spreadsTotalsFilter.ts` already uses for the same purpose.
- `classifyExclusion` checks title-level SGP/Parlay wording *before* the generic futures/outright/player-prop checks, reversing the literal order given in the plan's action-text prose. The plan's own behavior table requires `"25% NFL TD Scorer Parlay Profit Boost" -> parlay`, which only holds if Parlay is checked before the generic "Scorer" prop-keyword match; the behavior table is the authoritative test spec for this task, so implementation follows it over the prose ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `parseMaxStake`/`parseMaxWinnings` mention regex missed DraftKings' amount-wedged-between-keywords wording**
- **Found during:** Task 2, first RED->GREEN pass on `finePrint.test.ts`
- **Issue:** An initial single combined regex (`max...bet|wager|stake` as one contiguous pattern) failed to match `"BOOSTED UP TO MAX $25 WAGER"` because the dollar amount sits between "MAX" and "WAGER", and the regex only allowed an all-letters optional group in between.
- **Fix:** Split "mention" detection into two independent boolean checks (`HAS_MAX_RE` and `HAS_BET_WAGER_STAKE_RE`, ANDed) so the two keywords can appear anywhere in the line, not just adjacently.
- **Files modified:** `src/ingestion/promos/finePrint.ts`
- **Verification:** `parseMaxStake("BOOSTED UP TO MAX $25 WAGER")` now returns `{status:"parsed", value:"25.00"}`; all 20 finePrint tests pass.
- **Committed in:** `b308102` (Task 2 GREEN commit) — fixed before commit, not a follow-up.

**2. [Rule 1 - Bug] Two exclusions.test.ts fixtures didn't match the books' real wording**
- **Found during:** Task 2, first RED->GREEN pass on `exclusions.test.ts`
- **Issue:** (a) The live-wager-only test passed only the promo title (`"...Live Wager Profit Boost"`) with no terms text, but recon shows the actual `"Live Wagers Only"` signal is in the description bullet, not the title (03-RECON.md Observed Promos row 3). (b) The not-a-promo test used `"pick'em"` (no space) but the real DraftKings title is `"Pick 'Em"` (space before the apostrophe).
- **Fix:** Updated the live-wager test to pass `"Live Wagers Only"` as the `text` argument (matching the real fixture shape); relaxed `NOT_A_PROMO_RE`'s pick'em pattern to allow an optional space (`pick\s*'?em`).
- **Files modified:** `src/ingestion/promos/exclusions.test.ts`, `src/ingestion/promos/exclusions.ts`
- **Verification:** All 11 exclusions tests pass; the pattern still doesn't over-match anything else in the suite.
- **Committed in:** `b308102` (Task 2 GREEN commit) — fixed before commit, not a follow-up.

---

**Total deviations:** 2 auto-fixed (2 bugs, both discovered while driving RED tests to GREEN — no scope creep, no architectural change).
**Impact on plan:** Both fixes are within the plan's own stated behavior (the DraftKings/Bally wording the plan itself specifies) — no behavior beyond what 03-RECON.md documents was added.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` — symlinked all three from the primary checkout per the parallel-execution setup instructions (never committed; removed before returning).
- Local `npm run typecheck` reports one pre-existing, unrelated error (`src/app/layout.tsx(21,50): error TS2304: Cannot find name 'LayoutProps'`) — confirmed present at this plan's base commit (`37dfa0c`) via a temporary `git stash`, so it predates this plan and is out of scope per the executor's scope-boundary rule. Not fixed; not introduced by this plan.

## User Setup Required

None — no external service configuration required; this plan is pure/no-I/O (no network, no database, no installs, per the plan's own objective).

## Next Phase Readiness

- Plans 12, 13 and 14 (one parser per book: Bally Bet, DraftKings, FanDuel) can now write thin adapters against `ScrapedPromoSchema`/`BookScraper` and reuse every helper in `src/ingestion/promos/*` and `src/domain/promos/etTime.ts` without modification.
- Plan 06 (scraper write path, `src/ingestion/promos/store.ts`) can rely on `promoDedupeKey` and `statusAfterMatch` as stable, tested building blocks.
- Plan 15 (hedge rows) and Plan 07 (describe.ts) can use `etTime.ts`'s exports directly from `src/domain/promos` without crossing into `src/ingestion` (the App Router boundary this plan's doc comments call out for Plan 06's boundary test).
- No blockers. `SCRAPE_TARGET_BOOK_KEYS` in `src/config/scrapeTargets.ts` still needs updating from `["ballybet"]` to all three books — that was explicitly deferred to whichever of Plans 06/12-14 first needs it (03-03-SUMMARY.md), not this plan's scope.

## Known Stubs

None — this plan is a pure contract/helpers plan with no UI or data-flow surface; nothing here renders empty/placeholder data.

## Self-Check: PASSED

All 15 created files verified present on disk; all 4 task/RED-GREEN commit hashes (`171b4ce`, `23692f7`, `770091d`, `b308102`) verified present in `git log --oneline --all`.

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-26*
