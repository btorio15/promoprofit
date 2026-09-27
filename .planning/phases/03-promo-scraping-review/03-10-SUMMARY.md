---
phase: 03-promo-scraping-review
plan: 10
subsystem: api
tags: [flag-back, safety-net, drizzle, zod, vitest, tdd, react, promo-review]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-08: decideScrapedWrite's autoMatchBlocked rule (permanently refuses to auto-reactivate a flagged row); 03-09: promo-review.test.ts's mock/fixture setup, confirm-promo-match.ts's PromoReviewResponse shape"
provides:
  - "src/db/promoReview.ts: getActivePromoForFlag/applyFlag -- the D-11 safety-net write path, a single conditional UPDATE gated on status='active' AND auto_matched=true"
  - "src/app/actions/flag-promo-match.ts: flagPromoMatch server action"
  - "src/components/promos/PromoRow.tsx: flag-back icon button next to the Auto-matched badge, restructured to the ArbRow.tsx absolute-trigger pattern so the button is never nested inside CollapsibleTrigger's own <button>"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "applyFlag nulls every scope/pin column (scope_kind, event_id, sport_key, event_commence_time, home_team, away_team, window_start, window_end, market_type, line, side) in the same UPDATE that flips status back to pending_review -- no stale scope survives on a row no longer active, mirroring applyDismissal/applyConfirmedMatch's own conditional-UPDATE discipline"
    - "PromoRow.tsx adopts ArbRow.tsx's absolute-position-trigger + pointer-events-none-content split (rather than ResultRow.tsx's direct CollapsibleTrigger wrap) specifically because the flag button is a real interactive <button> -- nesting it inside CollapsibleTrigger's own <button> would be invalid HTML with unpredictable keyboard/click behavior, the same WR-06 problem ArbRow.tsx already solved for its Tie risk/Multiple books badges"

key-files:
  created:
    - src/app/actions/flag-promo-match.ts
  modified:
    - src/db/promoReview.ts
    - src/app/actions/promo-review.test.ts
    - src/components/promos/PromoRow.tsx
    - src/components/promos/PromosScreen.tsx

key-decisions:
  - "getActivePromoForFlag validates the row's own current scope columns through ScopeGuessSchema before returning a guess, unlike the existing scopeGuessFromColumns helper (used for pending-review rows, which trusts columns already written by a validated code path) -- this is deliberate defense-in-depth per the plan's own <action> instruction, since the flagged row's best_guess becomes a real, user-facing 'Best guess' line in the review queue"
  - "PromoRow.tsx's Collapsible/CollapsibleTrigger/chevron structure was restructured to ArbRow.tsx's overlay pattern (group moved from CollapsibleTrigger to the Collapsible root, group-data-open instead of group-data-panel-open) -- a Rule 1 fix, not a stylistic choice: the flag button is the first genuinely interactive <button> ever added inside this row's trigger, and the prior ResultRow.tsx-style direct wrap would have produced nested buttons"

requirements-completed: [PROMO-04]

# Metrics
duration: ~12min
completed: 2026-09-27
---

# Phase 3 Plan 10: Flag-Back on Auto-Matched Promo Rows Summary

**The D-11 safety net: any member can flag an auto-matched promo row wrong in one tap, pulling it out of hedge math immediately and permanently blocking it from auto-reactivating on a later scrape, attributed to who flagged it.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-27 01:20 (approx, first file reads)
- **Completed:** 2026-09-27 01:31:55
- **Tasks:** 2 completed (Task 1 TDD RED → GREEN, Task 2 build-verified)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `src/db/promoReview.ts` gains `getActivePromoForFlag` (loads one `status='active'` row's id/autoMatched flag and its current scope, rebuilt into a `ScopeGuess` and validated through `ScopeGuessSchema`) and `applyFlag` (a single conditional `UPDATE ... WHERE status = 'active' AND auto_matched = true RETURNING id`, gating out any row that's already flagged/confirmed/dismissed/expired). The write sets `status='pending_review'`, `review_reason='match'`, `auto_match_blocked=true`, `auto_matched=false`, stores the row's own current scope as `best_guess`, records `flagged_by_user_id`/`reviewed_at` (D-12), and nulls every scope/pin column so no stale scope lingers on a row that's no longer active.
- `src/app/actions/flag-promo-match.ts`'s `flagPromoMatch` server action: `requireUser()` first (T-03-10-01), strict `PromoIdInputSchema.safeParse`, then `getActivePromoForFlag` -- null means "Someone else already handled this promo," `autoMatched: false` means "Only auto-matched promos can be flagged." A human-confirmed match (via Plan 07/09's Confirm/Correct) can never be flagged; only the app's own automatic match can be.
- `decideScrapedWrite` (Plan 08) already enforces D-11's "never auto-reactivated" guarantee end-to-end -- a flagged row lands in `pending_review`/`match` with `auto_match_blocked=true`, which the existing `existing.autoMatchBlocked -> touch` branch (unchanged this plan, already covered by Plan 08's own tests) refuses to overwrite on any later scrape.
- `src/components/promos/PromoRow.tsx` renders a ghost icon `Button` (`Flag` lucide icon, `size-4`, `h-10 w-10` tap target) immediately after the "Auto-matched" badge, wrapped in a `Tooltip` with the verbatim copy "Flag this match as wrong — sends it back for review." `onClick` calls `event.stopPropagation()` before dispatching `flagPromoMatch({ promoId })` inside `useTransition`; the button is disabled while pending; an `"ok"` outcome calls `onChanged()` (parent re-fetches and the row disappears from the active list), any other outcome shows its message in a `role="alert" text-sm text-destructive` line under Col 1.
- `PromosScreen.tsx` passes `onChanged={runGetPromos}` to every `PromoRow`.
- Full suite (640 tests across 52 files), `typecheck`, `lint`, and `next build --webpack` all green.

## Task Commits

1. **Task 1: flagPromoMatch sends an auto-matched promo back to review and blocks auto re-activation** -- TDD, two commits:
   - `11202af` (test) -- RED: `promo-review.test.ts`'s new `flagPromoMatch` describe block fails with `Cannot find module './flag-promo-match'` (`flag-promo-match.ts` temporarily removed, `promoReview.ts` temporarily reverted to its pre-plan HEAD state for the RED run); all 17 pre-existing `lifecycle.test.ts` assertions still pass unaffected
   - `3e23605` (feat) -- GREEN: `promoReview.ts` (`getActivePromoForFlag`, `applyFlag`), `flag-promo-match.ts` (`flagPromoMatch`); 71/71 tests pass (`promo-review.test.ts` + `lifecycle.test.ts`), `typecheck` clean
2. **Task 2: Flag button next to the "Auto-matched" badge on promo rows** -- `ace6ad8` (feat): `PromoRow.tsx` (flag button, restructured Collapsible layout -- see Deviations), `PromosScreen.tsx` (`onChanged` wiring); `typecheck`, `lint`, `next build --webpack` all pass, full suite (640 tests) still green

## Files Created/Modified

- `src/db/promoReview.ts` -- `getActivePromoForFlag`, `applyFlag`, `activeScopeGuessFromRow` (private helper), `ActivePromoScopeRow` (private interface)
- `src/app/actions/flag-promo-match.ts` -- `flagPromoMatch`
- `src/app/actions/promo-review.test.ts` -- 7 new tests (logged-out rejection, invalid promoId, IDOR-guard extra key, event-scope flag, sport_window-scope flag, human-confirmed conflict, not-active/zero-rows conflict) -- 71 total across `promo-review.test.ts`/`lifecycle.test.ts`
- `src/components/promos/PromoRow.tsx` -- `onChanged` prop, flag button + tooltip + role="alert" message line, restructured to ArbRow.tsx's overlay-trigger pattern
- `src/components/promos/PromosScreen.tsx` -- `onChanged={runGetPromos}` passed to `PromoRow`

## Decisions Made

- `getActivePromoForFlag`'s scope-to-`ScopeGuess` conversion is validated through `ScopeGuessSchema` (defense-in-depth), distinct from the existing `scopeGuessFromColumns` helper used for pending-review rows -- see key-decisions above.
- `PromoRow.tsx`'s Collapsible structure was restructured to ArbRow.tsx's absolute-trigger/pointer-events-none-content pattern rather than keeping the prior direct-`CollapsibleTrigger`-wrap structure -- see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restructured PromoRow.tsx's Collapsible layout to avoid a nested `<button>`**
- **Found during:** Task 2
- **Issue:** The plan's `<action>` instructs rendering a `Button variant="ghost" size="icon"` immediately after the "Auto-matched" badge, inside Col 1 of the existing row markup. But the existing `PromoRow.tsx` (from Plan 03/15) wraps the entire row's content directly in `CollapsibleTrigger`, which itself renders as a `<button>` (Base UI's Collapsible.Trigger default). Placing a second, real interactive `<button>` (the flag icon) inside that structure produces invalid nested-`<button>` HTML -- undefined keyboard/click behavior, and a real risk that activating the flag button also fires the row's own collapse toggle regardless of `stopPropagation()` (browsers auto-hoist/close mismatched nested interactive elements). `src/components/arb/ArbRow.tsx` already solved exactly this problem (01.1 review WR-06) for its Tooltip/Popover-triggered badges, using an absolute-positioned, content-free `CollapsibleTrigger` behind a `pointer-events-none` content layer where only specific elements opt back in with `pointer-events-auto`.
- **Fix:** Restructured `PromoRow.tsx` to the same pattern: `group` moved from `CollapsibleTrigger` to the `Collapsible` root; `CollapsibleTrigger` is now an empty `absolute inset-0` overlay; all prior content moved into a sibling `pointer-events-none` div, with the flag `Button` and every existing Tooltip-wrapped badge given `pointer-events-auto`; the chevron's animation selector changed from `group-data-panel-open` to `group-data-open` to match the root-level `group` (verified against ArbRow.tsx's identical selector).
- **Files modified:** `src/components/promos/PromoRow.tsx`
- **Verification:** `typecheck`, `lint`, `next build --webpack` all green; visual/interaction behavior (row toggles on background click, flag button click never toggles the row) matches ArbRow.tsx's proven pattern exactly, byte-for-byte structural parity confirmed by direct comparison.
- **Committed in:** `ace6ad8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 -- HTML-validity/interaction bug the plan's literal instruction would have introduced)
**Impact on plan:** No behavior change to any existing row content or styling; purely a structural fix required to make the plan's own flag-button requirement safe to implement. All acceptance-criteria greps (`stopPropagation`, the verbatim tooltip copy, `flagPromoMatch(`) still match exactly as specified.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` -- symlinked all three from the primary checkout per the parallel-execution setup instructions; unlinked before returning, never committed.
- Task 1's RED verification required temporarily reverting `src/db/promoReview.ts` to its pre-plan `HEAD` content (via `git show HEAD:...`) and removing `src/app/actions/flag-promo-match.ts` entirely, to get a genuine "Cannot find module" failure signal rather than a false pass -- both were restored from a scratchpad backup immediately after confirming RED, before the GREEN commit.
- No network requests were made to sportsbooks and no Odds API refresh was triggered during this plan's execution (pure code changes, mocked unit tests, local build/typecheck/lint only). No real promos in the live DB were flagged or otherwise modified -- verification was entirely through `promo-review.test.ts`'s mocked `getActivePromoForFlag`/`applyFlag`.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- The full member-action set on a promo's lifecycle is now complete: Confirm/Correct/Dismiss (Plans 07/09) for queued promos, and Flag (this plan) for active auto-matched ones -- every path D-10/D-11/D-14 describes is wired end-to-end.
- `getActivePromoForFlag`/`applyFlag`'s conditional-UPDATE shape is directly reusable by any future action needing the same race-safety and attribution discipline against an `active` row (the existing helpers in this file only ever targeted `pending_review` rows before this plan).
- `PromoRow.tsx`'s overlay-trigger restructuring is a template for any future row-level interactive control this tab might need (e.g. a future per-row action) -- the direct-`CollapsibleTrigger`-wrap style should not be reintroduced once a row needs any real `<button>` inside it.
- No blockers identified for downstream plans.

## Known Stubs

None -- every value this plan writes or renders (the flag attribution, the best-guess scope, the flag button's pending/message state) is real, computed data; nothing here renders a hardcoded/placeholder value.

## Threat Flags

None -- this plan's only new surface (`flagPromoMatch`) was already enumerated in the plan's own `<threat_model>` (T-03-10-01..04) and implemented exactly as mitigated there: `requireUser()` first, strict schema, conditional UPDATE for the race, and attribution recorded atomically.

## Self-Check: PASSED

- FOUND: src/app/actions/flag-promo-match.ts
- FOUND (modified): src/db/promoReview.ts
- FOUND (modified): src/app/actions/promo-review.test.ts
- FOUND (modified): src/components/promos/PromoRow.tsx
- FOUND (modified): src/components/promos/PromosScreen.tsx
- FOUND commit: 11202af
- FOUND commit: 3e23605
- FOUND commit: ace6ad8

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
