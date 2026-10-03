---
phase: 03-promo-scraping-review
plan: 09
subsystem: api
tags: [zod, drizzle, decimal.js, next-server-actions, react, base-ui-select, vitest, tdd, promo-review]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-04: scope.ts/selection.ts (ScopeGuess, resolveSelection, enumerateScopeSelections), etTime.ts (etDayBounds/etDayLabel); 03-07: promoReview.ts's getPendingPromo/QueueRow, confirm-promo-match.ts's PromoReviewResponse skeleton, QueueItemCard.tsx's match/caps card shell, dto.ts's QueueItemDTO/GetPromosResponse"
provides:
  - "src/domain/promos/correctionOptions.ts: listCorrectionOptions -- Correct sub-panel dropdown data (one game with optional market/side pin, or a sport+ET-day window) built ONLY from the cached-odds pool already in Postgres (T-03-09-06, no Odds API call, no ingestion import)"
  - "src/domain/promos/reviewInput.ts: CorrectMatchInputSchema (discriminated event/sport_day scope, half-point/side-validated optional pin) and EnterCapsInputSchema (per-field money/odds validation, no `kind` field -- the max-winnings cap kind never comes from the client)"
  - "src/db/promoReview.ts: applyCorrectedMatch/applyCapEntry -- the same conditional UPDATE...WHERE status='pending_review' race-safe idiom as Plan 07's applyConfirmedMatch/applyDismissal, extended with pin columns and cap columns respectively; QueueRow gains maxWinningsKind"
  - "src/app/actions/correct-promo-match.ts / enter-promo-caps.ts: correctPromoMatch/enterPromoCaps server actions -- every client choice is re-validated against current cached odds or a strict schema before writing (T-03-09-02/03)"
  - "src/domain/promos/dto.ts / src/app/actions/get-promos.ts: GetPromosResponse's ok branch gains correctionOptions, computed only when the queue has a match-kind item (reusing the odds cache already fetched for hedge math, or fetching it directly when there are zero active promos)"
  - "src/components/promos/QueueItemCard.tsx: Correct sub-panel (sport-grouped Event select with sport-day choices first, then a disabled-until-chosen Market/side select) and Enter cap details sub-panel (one Input per still-missing cap field), both wired through ReviewQueueSection.tsx/PromosScreen.tsx"
affects: [03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "correctionOptions.ts reuses enumerateScopeSelections/resolveSelection (Plan 04) directly rather than re-implementing market enumeration -- every pinned option a member can choose is, by construction, something resolveSelection already accepts, so correctPromoMatch's own re-resolve check can never disagree with what the dropdown offered (short of the cache changing between page-load and submit, which the re-check still catches)"
    - "enterPromoCaps passes through the row's OWN already-known cap values for any field not in unparsedCapFields, rather than trusting the client to resend them or blindly nulling them out -- applyCapEntry's UPDATE always sets all three cap columns, but the action computes what each one's final value should be before calling it"
    - "QueueItemCard.tsx's Select values are prefixed (event:{id} / day:{sportKey}|{etDate}) client-side only, to disambiguate one flat Select covering two option shapes -- correctionOptions.ts's own data never carries this prefix, it's purely a UI encoding stripped before building the server-action payload"

key-files:
  created:
    - src/domain/promos/correctionOptions.ts
    - src/domain/promos/correctionOptions.test.ts
    - src/app/actions/correct-promo-match.ts
    - src/app/actions/enter-promo-caps.ts
  modified:
    - src/domain/promos/reviewInput.ts
    - src/db/promoReview.ts
    - src/app/actions/confirm-promo-match.ts
    - src/app/actions/promo-review.test.ts
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-promos.test.ts
    - src/components/promos/QueueItemCard.tsx
    - src/components/promos/ReviewQueueSection.tsx
    - src/components/promos/PromosScreen.tsx

key-decisions:
  - "listCorrectionOptions' per-event market order follows enumerateScopeSelections' own deterministic sort (moneyline home before away, spread/total lines ascending) rather than the away-first reading of the plan's illustrative <behavior> example text -- the plan's <action> section is explicit that markets come 'one option per enumerateScopeSelections... result', which this literally does; the example list's ordering was read as illustrative of the SET of labels, not a mandated array order (no acceptance grep pins a specific order)."
  - "enterPromoCaps' fieldErrors key is 'minOdds' (matching CapField/unparsedCapFields' own naming) even though the input schema's own field is 'minOddsAmerican' -- zod's z.flattenError(...).fieldErrors is keyed by schema field name, so the action explicitly renames minOddsAmerican -> minOdds when mapping schema-level errors into the response, keeping the public fieldErrors vocabulary consistent with CAP_FIELDS across both the schema-validation path and the business-rule ('Enter the min odds.') path."
  - "correctPromoMatch's invalid-with-fieldErrors.selection message is surfaced in QueueItemCard's existing shared role='alert' line, not under a dedicated input -- there is no single form control a 'that market isn't available' error naturally attaches to (the failure could be either the Event or the Market/side select), so it follows the same alert-line convention as stale/conflict messages."

requirements-completed: [PROMO-04, CALC-03]

# Metrics
duration: ~65min
completed: 2026-09-27
---

# Phase 3 Plan 9: Correct Flow + Enter Cap Details Summary

**Correct sub-panel (dropdown-only, cache-sourced game/sport-day + optional market pin) and Enter-cap-details sub-panel on review-queue cards, both server-revalidated and race-safe, completing D-14's reviewer actions and D-18's "never guess a cap" guarantee.**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-09-27 (approx, first file reads before RED commit)
- **Completed:** 2026-09-27
- **Tasks:** 2 completed (Task 1 TDD RED → GREEN, Task 2 build-verified)
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- `src/domain/promos/correctionOptions.ts`'s `listCorrectionOptions` builds every Correct sub-panel choice from the existing cached-odds pool only (moneyline ∪ extended, deduped, SPORT_KEYS, commence strictly within `(now, now+7d]`) -- an acceptance-grepped `0` for any odds-client/ingestion import proves it never spends an Odds API credit. Per event it reuses `enumerateScopeSelections`/`resolveSelection` (Plan 04) directly rather than re-deriving market logic, so "Best available (app picks)" plus one option per real 2-way market/side is always something the promo-matching engine itself already accepts.
- `correctPromoMatch` (new) re-validates every member choice against LIVE cached odds before writing, never the client's dropdown value as-is: an event scope's game must still exist with a future commence time; a pin must both resolve via `resolveSelection` AND belong to the promo's own `eligibleMarketTypes`; a sport-day scope's ET bounds are recomputed server-side from `etDayBounds(etDate)`, never taken from the client. Writes through the new `applyCorrectedMatch`, the same conditional-UPDATE race-safe idiom as Plan 07's `applyConfirmedMatch`, extended with pin columns and `corrected_by_user_id` attribution.
- `enterPromoCaps` (new) requires every field the row's own `unparsedCapFields` still needs (returning a field-specific "Enter the max stake." etc. otherwise), normalizes money through `decimal.js` to 2dp, and refuses to write a `maxWinnings` amount when the row's `maxWinningsKind` is null (D-18: "the math never guesses a cap") -- the winnings-cap *kind* always comes from the row, never from input. Any field NOT being newly entered passes through the row's own already-known value unchanged. Writes through the new `applyCapEntry`, which always activates the promo and clears `unparsed_cap_fields`.
- `getPromos` now computes `correctionOptions` on every `"ok"` response: built only when the queue actually has a match-kind item (skipping the extra cache reads entirely otherwise), reusing the odds cache already fetched for hedge math when active promos exist, or fetching it directly when there are zero active promos (a case the hedge-math path never otherwise reaches).
- `QueueItemCard.tsx` gained both inline sub-panels per 03-UI-SPEC.md verbatim: match-kind cards get a **Correct** button toggling an Event select (grouped by sport, sport-day choices listed before that sport's games within each group) and a Market/side select (disabled until a specific game is chosen, hidden for a sport-day choice); caps-kind cards get an **Enter cap details** button toggling one Input per still-missing field. Both Save buttons call their server action inside their own `useTransition` and `onChanged()` on success.
- Full suite (590 tests across 50 files), `typecheck`, `lint`, and `next build --webpack` all green.

## Task Commits

1. **Task 1: Correction options from cached odds, and the Correct and Enter-caps server actions** -- TDD, two commits:
   - `9e92d99` (test) -- RED: `correctionOptions.test.ts` fails with `Cannot find module` (correctionOptions.ts temporarily removed for the RED run); `promo-review.test.ts`'s new `correctPromoMatch`/`enterPromoCaps` describe blocks fail the same way (`correct-promo-match.ts`/`enter-promo-caps.ts` didn't exist yet)
   - `21ff5d3` (feat) -- GREEN: `correctionOptions.ts`, `reviewInput.ts` (`CorrectMatchInputSchema`/`EnterCapsInputSchema`), `promoReview.ts` (`applyCorrectedMatch`/`applyCapEntry`, `QueueRow.maxWinningsKind`), `correct-promo-match.ts`, `enter-promo-caps.ts`, `confirm-promo-match.ts` (`PromoReviewResponse.fieldErrors`); all 55 tests pass, `typecheck` clean
2. **Task 2: Correct and Enter-cap-details sub-panels on queue cards** -- `c02a77f` (feat): `dto.ts` (`correctionOptions` on the ok branch, re-exported types), `get-promos.ts`/`get-promos.test.ts` (`correctionOptionsFor` helper, 4 new tests), `QueueItemCard.tsx` (both sub-panels), plus `ReviewQueueSection.tsx`/`PromosScreen.tsx` wiring (see Deviations); `get-promos.test.ts` (22 tests), `typecheck`, `lint`, `next build --webpack` all pass

_No separate "Plan metadata" commit yet -- SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/domain/promos/correctionOptions.ts` / `correctionOptions.test.ts` -- `listCorrectionOptions`, `CorrectionOptions`/`CorrectionEventOption`/`CorrectionMarketOption`/`CorrectionSportDayOption`
- `src/domain/promos/reviewInput.ts` -- `CorrectMatchInputSchema`, `EnterCapsInputSchema` (added alongside Plan 07's `PromoIdInputSchema`)
- `src/db/promoReview.ts` -- `applyCorrectedMatch`, `applyCapEntry`, `QueueRow.maxWinningsKind`, shared `scopeColumnsFrom` helper (refactored out of `applyConfirmedMatch`)
- `src/app/actions/correct-promo-match.ts` -- `correctPromoMatch`
- `src/app/actions/enter-promo-caps.ts` -- `enterPromoCaps`
- `src/app/actions/confirm-promo-match.ts` -- `PromoReviewResponse`'s invalid branch gains optional `fieldErrors`
- `src/app/actions/promo-review.test.ts` -- 33 new tests (18 correctPromoMatch, 12 enterPromoCaps, both files' existing 19 confirm/dismiss tests still pass) -- 55 total in the two touched test files
- `src/domain/promos/dto.ts` -- `GetPromosResponse`'s ok branch gains `correctionOptions`; re-exports `CorrectionOptions`/etc.
- `src/app/actions/get-promos.ts` -- `correctionOptionsFor` helper wired into every `"ok"` return
- `src/app/actions/get-promos.test.ts` -- 4 new correction-options tests (22 total, up from 18) + `maxWinningsKind` added to existing `QueueRow` fixtures
- `src/components/promos/QueueItemCard.tsx` -- Correct and Enter-cap-details sub-panels, `groupCorrectionOptions` helper
- `src/components/promos/ReviewQueueSection.tsx` / `PromosScreen.tsx` -- thread `correctionOptions` through to `QueueItemCard` (see Deviations)

## Decisions Made

- `listCorrectionOptions`'s per-event market ordering follows `enumerateScopeSelections`'s own deterministic sort rather than the plan's illustrative away-first example text -- see key-decisions above.
- `enterPromoCaps` renames the schema field `minOddsAmerican` to the public `minOdds` key when mapping `z.flattenError` output into `fieldErrors`, keeping the response vocabulary aligned with `CAP_FIELDS`.
- `correctPromoMatch`'s `selection` field error surfaces in the shared alert line rather than under a specific input, since the failure can originate from either the Event or Market/side choice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Threaded `correctionOptions` through `ReviewQueueSection.tsx` and `PromosScreen.tsx`**
- **Found during:** Task 2
- **Issue:** The plan's `files_modified` list for this plan only names `dto.ts`, `get-promos.ts`, `get-promos.test.ts`, and `QueueItemCard.tsx`. But `QueueItemCard` needs `correctionOptions` as a prop to render the Correct sub-panel's dropdowns, and the data has to pass through `ReviewQueueSection` (which maps `queue` into `QueueItemCard`s) and `PromosScreen` (which holds the `getPromos` response) to get there. Without this wiring, the Correct sub-panel's Event/Market selects would always be empty, defeating the task's own `<done>` criterion.
- **Fix:** Added a `correctionOptions` prop to `ReviewQueueSectionProps`, forwarded it to every `QueueItemCard`, and passed `response.correctionOptions` from `PromosScreen` into `ReviewQueueSection`.
- **Files modified:** `src/components/promos/ReviewQueueSection.tsx`, `src/components/promos/PromosScreen.tsx`
- **Verification:** `typecheck`, `lint`, `next build --webpack` all green; `get-promos.test.ts` proves the data getPromos returns is correct, and this wiring is a pure pass-through with no independent logic to unit-test.
- **Committed in:** `c02a77f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 -- missing critical wiring)
**Impact on plan:** Necessary plumbing for the task's own stated UI behavior to function at all; no scope creep beyond what Task 2's `<done>` criterion already requires.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` -- symlinked all three from the primary checkout per the parallel-execution setup instructions (never committed; unlinked before returning).
- Used `npx next build --webpack` for local build verification, matching prior plans' documented Turbopack-symlinked-`node_modules` workaround.
- Task 1's RED verification required temporarily removing/reverting three implementation files (`correctionOptions.ts`, `promoReview.ts`, `reviewInput.ts`) that had already been drafted before the RED test run, to get a genuine "fails on missing module" signal rather than a false pass -- restored immediately after confirming RED, before writing the two new action files for GREEN.

## User Setup Required

None -- no external service configuration required. No network requests were made to sportsbooks and no Odds API refresh was triggered during this plan's execution (pure code changes, mocked tests, local build/typecheck/lint only).

## Next Phase Readiness

- Every queued promo can now be confirmed, corrected, completed with caps, or dismissed from the Promos tab -- D-14's full reviewer-action set and D-18's "no guessed cap" guarantee are both complete (PROMO-04, CALC-03).
- `applyCorrectedMatch`/`applyCapEntry`'s conditional-UPDATE shape and `correctPromoMatch`/`enterPromoCaps`'s re-validation pattern are directly reusable by any future review-queue action needing the same race-safety and attribution discipline.
- No blockers identified for downstream plans.

## Known Stubs

None -- every field rendered or written by this plan's code is wired to real data (cached odds for `correctionOptions`, the row's own DB columns for cap pass-through); no hardcoded/mocked queue or dropdown data.

## Self-Check: PASSED

- FOUND: src/domain/promos/correctionOptions.ts
- FOUND: src/domain/promos/correctionOptions.test.ts
- FOUND: src/app/actions/correct-promo-match.ts
- FOUND: src/app/actions/enter-promo-caps.ts
- FOUND (modified): src/domain/promos/reviewInput.ts
- FOUND (modified): src/db/promoReview.ts
- FOUND (modified): src/app/actions/confirm-promo-match.ts
- FOUND (modified): src/app/actions/promo-review.test.ts
- FOUND (modified): src/domain/promos/dto.ts
- FOUND (modified): src/app/actions/get-promos.ts
- FOUND (modified): src/app/actions/get-promos.test.ts
- FOUND (modified): src/components/promos/QueueItemCard.tsx
- FOUND (modified): src/components/promos/ReviewQueueSection.tsx
- FOUND (modified): src/components/promos/PromosScreen.tsx
- FOUND commit: 9e92d99
- FOUND commit: 21ff5d3
- FOUND commit: c02a77f

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
