---
phase: quick-260928-it1
plan: 01
subsystem: ingestion
tags: [promo-parsing, review-queue, nhl, zod, decimal.js, vitest, react]

# Dependency graph
requires:
  - phase: 03 (promo ingestion/matching)
    provides: ScrapedPromoSchema, decideScrapedWrite, commitScrapedPromos, runPromoScrape, promo-review server actions, QueueItemCard/ReviewQueueSection UI
provides:
  - "icehockey_nhl" added to SPORTS/SPORT_KEYS/sportHints/TEAM_ALIASES (32 NHL teams) -- NHL promos now parse as normal candidates instead of unsupported_sport skips
  - SkipEvidence (rawText/sourceUrl/expiresAt/partial) carried on every parser skip in all three books
  - reviewTriage.ts: isReviewWorthySkip (escalates unrecognized/unsupported_sport/schema_invalid, and a concrete-offer not_a_promo) + buildClassifyDraft (lenient ScrapedPromo draft from a skip's evidence)
  - REVIEW_REASONS gains "classify"; decideClassifyWrite (lifecycle.ts) + commitScrapedPromos classify writes (store.ts, same db.batch as candidates)
  - runPromoScrape: LEGITIMATE_SKIP_REASONS removed, a book is "failed" only on no-scraper/fetch-failure/parse-throw/uncaught-exception/zero-found; review-worthy skips become classify writes; zero-candidate books commit with expireUnseen false; BookRunOutcome.sentToReview
  - resolveMemberScope (memberScope.ts) shared scope-resolution extracted from correctPromoMatch, reused by classifyPromo
  - classifyPromo server action + applyClassification DB write turning a "classify" row into an active/pending_review profit_boost or bonus_bet promo
  - QueueItemDTO.classify (title/excerpt/sourceUrl/expiresAt/suggested/maxWinningsKindKnown) + ClassifyQueueCard "Needs a look" UI + CorrectionScopeSelect extracted for reuse
affects: [ingestion/promos, domain/promos, db/promoReview, app/actions/promo review actions, components/promos, a follow-up Claude-based promo reader that will feed the same "classify" triage path via buildClassifyDraft-shaped evidence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lenient-vs-strict schema pair (ScrapedPromoFieldsSchema + ScrapedPromoSchema = fields.superRefine(...)) so a deliberately incomplete member-facing draft can be validated field-by-field without the cross-field refinement a completed promo still requires"
    - "Skip evidence threading: every parser skip carries rawText/sourceUrl/expiresAt/partial so a downstream triage module can rebuild a draft without re-parsing or re-fetching anything"
    - "ClassifyWriteDecision reuses ScrapedWriteDecision's skip/touch/write shapes (Extract<ScrapedWriteDecision, {kind:\"write\"}>) plus one new kind (refresh-draft) instead of duplicating the decision shape"
    - "Scope-resolution extraction (resolveMemberScope) shared by two server actions that each still own their own scope-adjacent concern (correctPromoMatch's market/side pin; classifyPromo's boost/bonus fields) -- the shared module returns the matched OddsEvent so the caller's own follow-up logic doesn't re-fetch/re-search"

key-files:
  created:
    - src/ingestion/promos/reviewTriage.ts
    - src/ingestion/promos/reviewTriage.test.ts
    - src/domain/promos/memberScope.ts
    - src/domain/promos/memberScope.test.ts
    - src/app/actions/classify-promo.ts
    - src/components/promos/CorrectionScopeSelect.tsx
    - src/components/promos/ClassifyQueueCard.tsx
  modified:
    - src/config/sports.ts
    - src/ingestion/promos/sportHints.ts
    - src/domain/promos/aliases.ts
    - src/domain/promos/types.ts
    - src/domain/promos/scraped.ts
    - src/domain/promos/scraped.test.ts
    - src/ingestion/promos/books/draftkings.ts
    - src/ingestion/promos/books/ballybet.ts
    - src/ingestion/promos/books/fanduel.ts
    - src/ingestion/promos/books/draftkings.test.ts
    - src/ingestion/promos/books/ballybet.test.ts
    - src/ingestion/promos/promoText.test.ts
    - src/domain/promos/lifecycle.ts
    - src/domain/promos/lifecycle.test.ts
    - src/ingestion/promos/store.ts
    - src/ingestion/promos/run.ts
    - src/ingestion/promos/run.test.ts
    - scripts/scrape-promos.ts
    - src/domain/promos/correctionOptions.test.ts
    - src/app/actions/refresh-odds.test.ts
    - src/app/actions/correct-promo-match.ts
    - src/domain/promos/reviewInput.ts
    - src/db/promoReview.ts
    - src/app/actions/promo-review.test.ts
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-promos.test.ts
    - src/components/promos/QueueItemCard.tsx
    - src/components/promos/ReviewQueueSection.tsx

key-decisions:
  - "NHL canonical team names sourced from The Odds API's own icehockey_nhl participant naming (no cached NHL fixture existed in-repo to source them from directly) -- 'St Louis Blues' (no period), 'Montréal Canadiens' (accented), 'Utah Mammoth', per planner finding; every other name follows the file's existing city/nickname/abbreviation convention."
  - "isReviewWorthySkip's not_a_promo concrete-offer regexes intentionally only fire on a numeric percent/dollar/boosted-price pattern -- verified against every real fixture (planner finding 5) that generic marketing copy like 'Bally's Profit Boost' never trips it, so the queue can't flood with non-offers."
  - "buildClassifyDraft never trusts a skip's evidence.partial wholesale -- every field is validated against its own ScrapedPromoFieldsSchema.shape entry (sportKeyHint additionally checked against SPORT_KEYS, since the lenient field schema alone doesn't enforce that) and silently drops to null/default on failure, per the plan's per-field-validation requirement."
  - "decideClassifyWrite takes no ScrapedPromo/draft argument at all -- every branch's outcome (skip/touch/refresh-draft/write) is fully determined by the existing row's state and `now`; store.ts supplies the draft's actual field values only when translating the decision into SQL (capsFrom \"parsed\" vs \"existing\"), keeping the pure decision function symmetric with decideScrapedWrite's own architecture."
  - "run.ts's zero-candidate branch never calls getMatchEventsOnce() even when it has classify writes to commit -- a classify row is never matched, so loading the odds cache there would be pure waste."
  - "classify-promo.ts's completed ScrapedPromo always passes the FULL ScrapedPromoSchema (not the lenient fields schema) before applyClassification runs -- the lenient schema is only for the review-queue REST state; a member's completed classification must meet the same bar every scraped candidate does."

patterns-established:
  - "A server action extracts shared scope-resolution logic into a pure domain function (memberScope.ts) that returns both the resolved ScopeGuess and the matched OddsEvent, so a caller needing additional per-domain logic (a market/side pin) doesn't need a second cache read or a duplicated lookup."

requirements-completed: [QUICK-260928-it1, PROMO-03, PROMO-04]

# Metrics
duration: 40min
completed: 2026-09-28
---

# Quick Task 260928-it1: Uncertain Promos to Review Queue, and NHL Support Summary

**Parser skips that used to silently vanish (unrecognized/unsupported_sport/schema_invalid, plus not_a_promo entries naming a concrete offer) now become "classify" review rows a member turns into a real profit boost or bonus bet; NHL is a fully supported sport end to end.**

## Performance

- **Duration:** ~40 min (first RED commit to final verification)
- **Started:** 2026-09-28T13:57:12-06:00
- **Completed:** 2026-09-28T14:34:00-06:00
- **Tasks:** 3
- **Files modified:** 29 modified, 7 created

## Accomplishments

- DraftKings' 2026-09-28 fixture entry 1125873 ("NHL 50% Profit Boost") is now a normal `profit_boost` candidate (boostPercent "50.00", maxStake "25.00", minOddsAmerican -200, sportKeyHint "icehockey_nhl") instead of a silently-dropped `unsupported_sport` skip.
- Every parser skip (DraftKings, Bally Bet, FanDuel) now carries evidence (rawText/sourceUrl/expiresAt/partial) so an uncertain entry can be turned into a review row without re-parsing or re-fetching anything.
- `isReviewWorthySkip` escalates exactly the uncertain skips (`unrecognized`/`unsupported_sport`/`schema_invalid`, plus a `not_a_promo` naming a concrete numeric offer with no exclusion wording) across every real fixture: Bally `sbk-25-WNBA-Profit-Boost` and FanDuel `LOSOCCERPB0925` are the only two currently review-worthy entries.
- A book whose parse finds promos but can't classify some of them is now `ok` (never `failed`) -- the scrape job only fails on a real problem (no scraper, fetch failure, parse throw, uncaught exception, or zero promos found). A zero-candidate book commits its classify drafts without expiring any existing live rows.
- Members can now dismiss an uncertain "Needs a look" card, or turn it into a profit boost or bonus bet (with a "Game or day" scope, prefilled boost%/stake/odds/winnings fields, and CR-04 enforced -- a boost with no max stake routes to cap review, never straight to active).

## Task Commits

1. **Task 1: NHL support, skip evidence, and the review-triage module** (TDD)
   - `26c7443` test(260928-it1): add failing tests for NHL support and review-triage
   - `6b87764` feat(260928-it1): NHL support, skip evidence, and review-triage module
2. **Task 2: Classify writes through lifecycle/store, and the new run-outcome semantics** (TDD)
   - `574be5a` feat(260928-it1): classify writes through lifecycle/store, new run outcomes
3. **Task 3: Classify server action, DB write, queue DTO, and the "Needs a look" card** (TDD)
   - `988f3c7` test(260928-it1): add failing tests for resolveMemberScope
   - `b3a4df3` feat(260928-it1): extract resolveMemberScope shared by correct/classify
   - `5f9a528` feat(260928-it1): classify input schemas and applyClassification DB write
   - `5120c31` feat(260928-it1): classifyPromo server action
   - `7786986` feat(260928-it1): classify DTO fields on the review queue
   - `b8c0795` refactor(260928-it1): extract CorrectionScopeSelect from QueueItemCard
   - `69f47e9` feat(260928-it1): "Needs a look" classify queue card

_Note: Task 2 has no separate RED commit -- lifecycle.test.ts's classify-decision cases and run.test.ts's rewritten semantics were written and implemented together, then verified green before committing (the plan's tdd="true" gate was satisfied by Task 1 and Task 3's RED/GREEN pairs; Task 2's own new logic is fully covered by the same commit's test additions)._

## Files Created/Modified

See `key-files` above for the full list. Highlights:
- `src/ingestion/promos/reviewTriage.ts` (new) -- `CLEAR_SKIP_REASONS`/`REVIEW_SKIP_REASONS`, `isReviewWorthySkip`, `buildClassifyDraft`
- `src/domain/promos/memberScope.ts` (new) -- `resolveMemberScope`, shared by `correctPromoMatch` and `classifyPromo`
- `src/app/actions/classify-promo.ts` (new) -- the `classifyPromo` server action
- `src/components/promos/ClassifyQueueCard.tsx` (new, 317 lines) -- the "Needs a look" card
- `src/components/promos/CorrectionScopeSelect.tsx` (new) -- the "Game or day" Select, extracted from `QueueItemCard.tsx` for reuse
- `src/domain/promos/lifecycle.ts` -- `decideClassifyWrite`, plus a `pending_review/classify` branch in `decideScrapedWrite`
- `src/ingestion/promos/store.ts` -- `commitScrapedPromos` now takes `{classify, expireUnseen}` and commits both write types in one `db.batch`
- `src/ingestion/promos/run.ts` -- `LEGITIMATE_SKIP_REASONS` removed; new pass/fail semantics; `BookRunOutcome.sentToReview`
- `src/db/promoReview.ts` -- `applyClassification`; `mapPendingPromoRow` validates a classify row's `parsed` against the lenient `ScrapedPromoFieldsSchema`
- `src/domain/promos/dto.ts` / `src/app/actions/get-promos.ts` -- `QueueItemDTO.classify`, sourceUrl allowlisted to http/https, `correctionOptionsFor`'s gate extended to classify items

## Decisions Made

See `key-decisions` in the frontmatter above for the full rationale on each; summarized:
- NHL canonical team names sourced from The Odds API's own naming convention (no cached fixture existed to source them from).
- `isReviewWorthySkip`'s concrete-offer regexes are deliberately narrow (verified against every real fixture) so the queue can't flood with generic marketing copy.
- `buildClassifyDraft` validates every partial field independently against its own schema entry, with an explicit SPORT_KEYS check for `sportKeyHint` since the lenient fields schema doesn't enforce that itself.
- `decideClassifyWrite` is a pure function of `(existing, now)` only -- it never needs the draft's own field values, mirroring `decideScrapedWrite`'s architecture.
- `classifyPromo`'s completed promo always passes the full `ScrapedPromoSchema`, never the lenient one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing tests broken by NHL becoming a supported sport**
- **Found during:** Task 1 (and while running the full suite after Task 2)
- **Issue:** Four pre-existing tests hardcoded `icehockey_nhl` (or "NHL" text) as an example of an *unsupported* sport, which is exactly what this task's own NHL-support change invalidates: `src/domain/promos/scraped.test.ts` ("rejects sportKeyHint values outside SPORT_KEYS"), `src/ingestion/promos/promoText.test.ts` ("resolves unsupported sports"), `src/domain/promos/correctionOptions.test.ts` ("excludes events for sports outside SPORT_KEYS"), and `src/app/actions/refresh-odds.test.ts`'s D-01 in-season-sports fixture (which included `icehockey_nhl: active` as its "non-D-01 sport that should be skipped" example).
- **Fix:** Swapped each test's unsupported-sport example to a sport that remains genuinely unsupported (`soccer_epl`), and added new passing assertions for NHL text/tag resolution in `promoText.test.ts` (mirroring the equivalent coverage already added in `reviewTriage.test.ts`).
- **Files modified:** `src/domain/promos/scraped.test.ts`, `src/ingestion/promos/promoText.test.ts`, `src/domain/promos/correctionOptions.test.ts`, `src/app/actions/refresh-odds.test.ts`
- **Verification:** Full `npx vitest run` suite (846 tests) passes.
- **Committed in:** `6b87764` (scraped.test.ts, promoText.test.ts) and `574be5a` (correctionOptions.test.ts, refresh-odds.test.ts)

**2. [Rule 1 - Bug] Fixed ballybet.test.ts strict-equality assertions broken by the new evidence field**
- **Found during:** Task 1
- **Issue:** Two `ballybet.test.ts` tests asserted `result.skipped` with a literal `toEqual([{reason, externalId, title}])` array -- exactly the shape `SkippedEntry` had before this task added the (now-always-present) `evidence` field, so both failed once every skip started carrying evidence.
- **Fix:** Changed both assertions to `toMatchObject` for the reason/externalId/title fields, plus a targeted assertion on the new `evidence.partial`/`evidence.rawText` content, preserving the original test's intent (schema_invalid carries the built candidate as `partial`; a plain `unrecognized` skip's `partial` is null).
- **Files modified:** `src/ingestion/promos/books/ballybet.test.ts`
- **Verification:** `npx vitest run src/ingestion/promos` passes.
- **Committed in:** `6b87764`

---

**Total deviations:** 2 auto-fixed (both Rule 1 -- pre-existing tests broken by this task's own NHL-support and skip-evidence changes)
**Impact on plan:** Both fixes were necessary consequences of the plan's own required changes (NHL support, skip evidence on every skip) rippling into test files the plan didn't explicitly list. No scope creep -- no behavior outside the plan's objective was touched.

## Issues Encountered

None beyond the deviations above. The three-task TDD flow (RED test file -> GREEN implementation, per task) went smoothly; no blocked/ambiguous design points required a checkpoint.

## Analysis Notes (SUMMARY success-criteria requirements)

- **Fixture-map changes:** Exactly as expected -- DK 2026-09-28 `1125873` (`unsupported_sport` -> candidate); Bally `sbk-25-WNBA-Profit-Boost` and FanDuel `LOSOCCERPB0925` (`unsupported_sport` -> classify-worthy review items, per `reviewTriage.test.ts`'s fixture-set assertions). No other real-fixture candidate/skip-reason changed.
- **NHL credit delta:** `usableOddsBooks()` currently returns 7 free-tier, API-covered books (draftkings, fanduel, betmgm, betrivers, espnbet, hardrockbet, ballybet) -- `ceil(7/10) = 1`. Adding NHL as an in-season sport therefore adds **+1 credit** to each ordinary h2h refresh (`estimateRefreshCredits(sportCount, 7)`), and **+3 credits** (marketCount 3) to each extended spreads/totals refresh, whenever NHL is reported in-season by the Odds API's `/sports` endpoint.
- **NHL fixture outcome:** DK 2026-09-28 entry `1125873` parses with `boostPercent` "50.00", `maxStake` "25.00" (from `additionalDetail`'s "BOOSTED UP TO MAX $25 WAGER", the same anchored-amount shape as the NFL boosts), and `minOddsAmerican` -200 (from "Total bet odds must be -200 or longer" matching the existing "N or longer" pattern). It is a normal active candidate once matched against a cached NHL event -- not a caps-review item, since every required cap field parsed.
- **NHL team-name source:** The Odds API's own `icehockey_nhl` participant naming (per planner finding; no cached NHL event fixture existed in the repo to source names from directly). See `key-decisions` above for the three names that needed explicit confirmation (`St Louis Blues`, `Montréal Canadiens`, `Utah Mammoth`).

## Known Stubs

None. Every classify-flow field (excerpt, sourceUrl, suggested boost/bonus values, scope selection) is wired to real data end to end; no hardcoded/mock placeholders were introduced.

## User Setup Required

None - no external service configuration, environment variables, or dashboard changes required. No database migration was needed (`promos.review_reason` is a plain `text` column with no CHECK constraint, per the plan's planner findings -- confirmed directly against `src/db/schema.ts`; adding "classify" to the `REVIEW_REASONS` TypeScript enum was sufficient).

## Next Phase Readiness

- The classify review path is fully wired end to end: scraper skip -> evidence -> `isReviewWorthySkip`/`buildClassifyDraft` -> `commitScrapedPromos` classify write -> `getReviewQueue` -> `QueueItemDTO.classify` -> `ClassifyQueueCard` -> `classifyPromo` -> `applyClassification`.
- Per the dispatch notes, the triage/review-item-creation boundary is clean: a follow-up Claude-based promo reader only needs to produce `SkipEvidence`-shaped data (or call `buildClassifyDraft` directly) to feed this same path -- no changes to `reviewTriage.ts`'s public surface should be needed.
- No blockers. Owner should confirm the live NHL team-alias table against a real cached `icehockey_nhl` event once the Odds API actually returns one (the names used were sourced from planner research, not a live fixture) -- flagged as a spot-check, not a blocker.

## Verification Results

- `npx vitest run` (whole suite, from this worktree): **846/846 passed** (58 test files)
- `npx vitest run src/ingestion/promos/reviewTriage.test.ts`: **27/27 passed** -- confirms the fixture review-set table (Bally WNBA + FanDuel soccer only)
- `npx vitest run src/app/actions src/domain/promos`: **400/400 passed**
- `npx tsc --noEmit`: 1 pre-existing error, `src/app/layout.tsx(21,50): error TS2304: Cannot find name 'LayoutProps'` -- the known worktree artifact called out in the dispatch constraints, not introduced by this task.
- `npx eslint` (full repo, via `npm run lint`): clean, no output.
- `grep -n "icehockey_nhl" src/config/sports.ts src/ingestion/promos/sportHints.ts src/domain/promos/aliases.ts`: hits in all three files.
- `grep -c "LEGITIMATE_SKIP_REASONS" src/ingestion/promos/run.ts`: `0`.
- No drizzle migration generated or run; `git status --short` on `src/db/schema.ts`/`drizzle/` shows no changes.

## Self-Check: PASSED

- FOUND: src/ingestion/promos/reviewTriage.ts
- FOUND: src/ingestion/promos/reviewTriage.test.ts
- FOUND: src/domain/promos/memberScope.ts
- FOUND: src/domain/promos/memberScope.test.ts
- FOUND: src/app/actions/classify-promo.ts
- FOUND: src/components/promos/CorrectionScopeSelect.tsx
- FOUND: src/components/promos/ClassifyQueueCard.tsx
- FOUND: commit 26c7443
- FOUND: commit 6b87764
- FOUND: commit 574be5a
- FOUND: commit 988f3c7
- FOUND: commit b3a4df3
- FOUND: commit 5f9a528
- FOUND: commit 5120c31
- FOUND: commit 7786986
- FOUND: commit b8c0795
- FOUND: commit 69f47e9

---
*Quick task: 260928-it1-uncertain-promos-to-review-queue-and-add*
*Completed: 2026-09-28*
