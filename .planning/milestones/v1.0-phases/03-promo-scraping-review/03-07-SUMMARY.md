---
phase: 03-promo-scraping-review
plan: 07
subsystem: api
tags: [zod, drizzle, neon, next-server-actions, react, vitest, tdd, promo-review]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-04: scope.ts (ScopeGuess/PromoScope/scopeFromGuess/eventInScope), rankPromoHedges; 03-05: ScrapedPromoSchema, lifecycle.ts's statusAfterMatch, etTime.ts; 03-15: getActivePromos/getPromos/PromosScreen scaffold"
provides:
  - "src/db/promoReview.ts: the ONLY member-action write path for promos (D-12) -- getReviewQueue/getPendingPromo (validated reads) and applyConfirmedMatch/applyDismissal (single conditional UPDATE...WHERE status='pending_review' writes, race-safe per T-03-07-03)"
  - "src/app/actions/confirm-promo-match.ts / dismiss-promo.ts: confirmPromoMatch/dismissPromo server actions with server-side scope re-validation against current cached odds (T-03-07-04), requireUser()-first ordering, and attribution"
  - "src/domain/promos/describe.ts: describePromo/scopeGuessLabel -- pure queue-card copy formatters"
  - "src/domain/promos/dto.ts: QueueItemDTO; GetPromosResponse's ok branch gains queue: QueueItemDTO[] (present in every empty-state variant, not just when rows exist)"
  - "src/components/promos/ReviewQueueSection.tsx / QueueItemCard.tsx / DismissPromoDialog.tsx: the 'Needs review (N)' UI on the Promos tab"
affects: [03-09, 03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "promoReview.ts's applyConfirmedMatch/applyDismissal are single conditional UPDATE...WHERE status='pending_review' [AND review_reason='match'] RETURNING id statements -- the same race-safe idiom as accounts.ts's reserveLoginAttempt/redeemInviteAndCreateUser, extended to promo review actions"
    - "confirmPromoMatch never trusts the stored best_guess: an event guess is re-resolved from getCachedEvents() union getCachedExtendedEvents() and the written scope's teams/commence come from the live cached event, never copied from the guess verbatim -- closes the 'stale scraper guess activates a wrong promo' threat (T-03-07-04) at the point of write, not just at render time"
    - "QueueItemDTO's queue field is populated on EVERY GetPromosResponse ok branch (none-scraped/no-active/no-books/no-odds/normal), computed once via Promise.all alongside getActivePromos -- the review queue is a first-class citizen of the Promos tab regardless of whether any promo currently has a hedge"

key-files:
  created:
    - src/db/promoReview.ts
    - src/domain/promos/reviewInput.ts
    - src/app/actions/confirm-promo-match.ts
    - src/app/actions/dismiss-promo.ts
    - src/app/actions/promo-review.test.ts
    - src/domain/promos/describe.ts
    - src/domain/promos/describe.test.ts
    - src/components/promos/QueueItemCard.tsx
    - src/components/promos/DismissPromoDialog.tsx
    - src/components/promos/ReviewQueueSection.tsx
  modified:
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-promos.test.ts
    - src/components/promos/PromosScreen.tsx

key-decisions:
  - "confirmPromoMatch loads the pending row first: null row -> conflict; a non-null row that isn't reviewReason='match' with a bestGuess -> stale ('There's no suggested match to confirm...') -- so a caps-kind row (no Confirm button in the UI anyway) gets a clear stale message rather than a misleading conflict if ever called directly"
  - "getReviewQueue/getPendingPromo share one mapping function (mapPendingPromoRow) with NO date/expiry filtering; the D-16 expiry drop (both the SQL WHERE clause on the resolved scope columns AND the JS-side check against the scraped parsed.windowEnd/expiresAt, which stays populated even before a scope is confirmed) lives only in getReviewQueue -- getPendingPromo is a lookup for the confirm/dismiss actions, which apply their own staleness checks instead"
  - "describe.ts duplicates db/promos.ts's small ET-day-key/month-day Intl.DateTimeFormat helpers locally rather than importing them, mirroring the existing precedent (db/promos.ts already has its own copy rather than importing from a shared spot) and keeping domain/promos pure of any src/db import"
  - "DismissPromoDialog's body copy uses a scoped eslint-disable-next-line for react/no-unescaped-entities (rather than &apos; entities) so the rendered source contains the literal apostrophes the plan's own acceptance-criteria grep requires ('It won't be suggested again...') while still passing lint clean"

requirements-completed: [PROMO-04]

# Metrics
duration: ~35min
completed: 2026-09-27
---

# Phase 3 Plan 7: Review Queue — Confirm / Dismiss Summary

**Server actions that let any signed-in member confirm a queued promo's best-guess scope (activating it, or routing it to cap review per D-18) or permanently dismiss it, both with attribution and race-safe conditional writes, surfaced as a "Needs review (N)" section on the Promos tab.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-27T00:30:00Z (approx, first file reads before RED commit)
- **Completed:** 2026-09-27T01:05:00Z (approx)
- **Tasks:** 3 completed (Tasks 1 and 2 TDD RED → GREEN, Task 3 build-verified)
- **Files modified:** 14 (10 created, 4 modified)

## Accomplishments

- `src/db/promoReview.ts` is now the single write path for member promo-review actions (D-12): `getReviewQueue`/`getPendingPromo` validate every stored field (`ScrapedPromoSchema`, `ScopeGuessSchema`, enum narrowing) and drop-and-warn on malformed rows rather than throwing; `applyConfirmedMatch`/`applyDismissal` are each one conditional `UPDATE ... WHERE status = 'pending_review' [AND review_reason = 'match']` statement, so two members racing the same card can never both succeed (T-03-07-03).
- `confirmPromoMatch` re-validates the stored `best_guess` against live data before ever writing it: an event guess must still exist in `getCachedEvents() ∪ getCachedExtendedEvents()` with a future commence time, and the scope actually written is rebuilt from that cached event's own teams/commence (not copied from the stale guess) — closing T-03-07-04. A sport_window guess only needs its own `sportKey`/`windowEnd` re-checked. A boost with no parsed `maxStake` correctly routes to `pending_review/caps` instead of `active` (D-18).
- `dismissPromo` permanently dismisses via the same conditional-write idiom; both actions call `requireUser()` first (T-03-07-01) and `revalidatePath("/")` on success.
- `src/domain/promos/describe.ts` renders the exact queue-card copy: `describePromo` handles sport-wide/game-wide boosts (percent, dropping a trailing `.00`), pinned boosts with a published boosted price, and bonus bets; `scopeGuessLabel` renders an event guess as `"{away} @ {home}, {kickoff}"` or a sport_window guess as an ET single-day or multi-day range.
- `getPromos` now computes the review queue (`getReviewQueue(new Date())`) alongside `getActivePromos` and includes it (`queue: QueueItemDTO[]`) on **every** `"ok"` response — including the `none-scraped`/`no-active`/`no-books`/`no-odds` empty-state variants — so the queue is never hidden behind an active-promos empty state.
- `ReviewQueueSection`/`QueueItemCard`/`DismissPromoDialog` implement the "Needs review (N)" section per 03-UI-SPEC.md verbatim: absent entirely when the queue is empty; match-kind cards show a Confirm button only when a best-guess exists; caps-kind cards show the matched scope + cap recap (missing fields render "not found") with Dismiss only (no Confirm — D-18: nothing to accept as-is); both actions run in `useTransition`, and non-"ok" outcomes render inline via `role="alert"` since another member may have already acted on the same card.
- Full suite (536 tests across 47 files), `typecheck`, `lint`, and `next build --webpack` all green.

## Task Commits

1. **Task 1: Confirm and Dismiss server actions with attribution and race-safe writes** — TDD, two commits:
   - `668f3dd` (test) — RED: `promo-review.test.ts` fails with `Cannot find module` (confirm-promo-match.ts/dismiss-promo.ts did not exist)
   - `eaf367a` (feat) — GREEN: `promoReview.ts`, `reviewInput.ts`, `confirm-promo-match.ts`, `dismiss-promo.ts`; all 19 tests pass
2. **Task 2: getPromos returns the review queue with readable descriptions** — TDD, two commits:
   - `a402338` (test) — RED: `describe.test.ts` fails with `Cannot find module` (describe.ts didn't exist); 6 new queue-mapping cases in `get-promos.test.ts` fail (`result.queue` undefined) while the 12 pre-existing cases still pass
   - `906e0d9` (feat) — GREEN: `describe.ts`, `dto.ts` (`QueueItemDTO`), `get-promos.ts`; all 26 tests (8 + 18) pass
3. **Task 3: "Needs review (N)" section with Confirm and Dismiss on the Promos tab** — `307a051` (feat)

_No separate "Plan metadata" commit yet — SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/db/promoReview.ts` — `QueueRow`, `getReviewQueue`, `getPendingPromo`, `applyConfirmedMatch`, `applyDismissal`
- `src/domain/promos/reviewInput.ts` — `PromoIdInputSchema` (strict, positive int, no user field)
- `src/app/actions/confirm-promo-match.ts` — `confirmPromoMatch`, `PromoReviewResponse`
- `src/app/actions/dismiss-promo.ts` — `dismissPromo`
- `src/app/actions/promo-review.test.ts` — 19 tests covering both actions' full behavior list
- `src/domain/promos/describe.ts` / `describe.test.ts` — `describePromo`, `scopeGuessLabel`; 8 tests
- `src/domain/promos/dto.ts` — `QueueItemDTO`; `GetPromosResponse`'s ok branch gains `queue`
- `src/app/actions/get-promos.ts` — `getReviewQueue` wired in alongside `getActivePromos`; `toQueueItemDTO` mapper
- `src/app/actions/get-promos.test.ts` — mocks `@/db/promoReview`; 6 new queue-mapping cases (18 total, up from 12)
- `src/components/promos/QueueItemCard.tsx` — match/caps card, Confirm/Dismiss actions, inline error display
- `src/components/promos/DismissPromoDialog.tsx` — D-14 dismiss confirmation `AlertDialog`
- `src/components/promos/ReviewQueueSection.tsx` — "Needs review (N)" section, absent when empty
- `src/components/promos/PromosScreen.tsx` — renders `ReviewQueueSection` after `ScrapeStatusPanel`, before `RiskAdvisory`/rows

## Decisions Made

- `confirmPromoMatch` distinguishes "the promo row is gone/already handled" (→ conflict) from "the row exists but has nothing confirmable" (→ stale), checking `getPendingPromo`'s null result first and the `reviewReason`/`bestGuess` shape second.
- `getReviewQueue`'s D-16 expiry drop (checking the scraped `parsed.windowEnd`/`parsed.expiresAt`, which is populated even before a scope is matched) is layered on top of the SQL-level filter on the resolved scope columns (which stay null for unmatched match-kind rows) — both checks are needed to cover match-kind and caps-kind rows correctly.
- `describe.ts` duplicates `db/promos.ts`'s small ET-day-key Intl formatters locally rather than importing them, matching the codebase's existing precedent and keeping `src/domain/promos` free of any `src/db` import.
- `DismissPromoDialog`'s body copy uses a scoped `eslint-disable-next-line react/no-unescaped-entities` (not `&apos;` entities) so the source contains the literal apostrophes the plan's acceptance-criteria grep requires, while still passing `lint` clean.

## Deviations from Plan

None — plan executed exactly as written. Task 1 and Task 2 followed the TDD RED→GREEN protocol literally (implementation files/fields physically absent at the RED commit, confirmed via `git stash` for the `get-promos.ts`/`dto.ts` portion of Task 2 since that file was being extended rather than created fresh). Every hand-specified string in the plan's `<behavior>` blocks (stale/conflict messages, `describePromo`/`scopeGuessLabel` exact outputs, `QueueItemDTO` field shapes) matched the implementation without needing to adjust test expectations.

One presentational judgment call not spelled out in the plan's behavior list: the `"invalid"` response case for `confirmPromoMatch`/`dismissPromo` (malformed input, effectively unreachable from the UI since promoId is always a stored number) renders a generic "Something went wrong with that request. Try refreshing the page." message in `QueueItemCard`, since `PromoReviewResponse`'s `"invalid"` variant carries no message field.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` — symlinked all three from the primary checkout per the parallel-execution setup instructions (never committed; unlinked before returning).
- Used `npx next build --webpack` for local build verification, matching prior plans' documented Turbopack-symlinked-`node_modules` workaround.
- Discovered mid-Task-3 that a literal apostrophe in JSX text trips `react/no-unescaped-entities` (codebase convention elsewhere is `&apos;`), which would have broken the plan's own acceptance-criteria grep expecting a literal apostrophe. Resolved with a scoped `eslint-disable-next-line` on just that one description line (documented above) rather than reformatting the verbatim UI-SPEC copy.

## User Setup Required

None — no external service configuration required. No network requests were made to sportsbooks and no Odds API refresh was triggered during this plan's execution (pure code changes, mocked tests, local build/typecheck/lint only).

## Next Phase Readiness

- `src/db/promoReview.ts`'s `getPendingPromo`/`applyConfirmedMatch` are ready for Plan 09's "Correct" action to reuse directly (a corrected scope is the same conditional-write shape, just with a human-chosen event/market instead of the stored best guess) and for Plan 09's cap-entry action to extend with a `applyCapsEntered`-style sibling.
- `QueueItemDTO`/`ReviewQueueSection`/`QueueItemCard` are structured so Plan 09 can add the "Correct" button and its inline sub-panel to the match-kind branch, and "Enter cap details" to the caps-kind branch, without restructuring either component.
- `describe.ts`'s `scopeGuessLabel` is reusable as-is by Plan 09's Correct sub-panel for rendering the currently-selected event/market before save.
- No blockers identified for downstream plans.

## Known Stubs

None — every field this plan renders is wired to real data (`getReviewQueue`'s validated rows); there is no hardcoded/mocked queue data left in the UI path.

## Self-Check: PASSED

- FOUND: src/db/promoReview.ts
- FOUND: src/domain/promos/reviewInput.ts
- FOUND: src/app/actions/confirm-promo-match.ts
- FOUND: src/app/actions/dismiss-promo.ts
- FOUND: src/app/actions/promo-review.test.ts
- FOUND: src/domain/promos/describe.ts
- FOUND: src/domain/promos/describe.test.ts
- FOUND: src/components/promos/QueueItemCard.tsx
- FOUND: src/components/promos/DismissPromoDialog.tsx
- FOUND: src/components/promos/ReviewQueueSection.tsx
- FOUND (modified): src/domain/promos/dto.ts
- FOUND (modified): src/app/actions/get-promos.ts
- FOUND (modified): src/app/actions/get-promos.test.ts
- FOUND (modified): src/components/promos/PromosScreen.tsx
- FOUND commit: 668f3dd
- FOUND commit: eaf367a
- FOUND commit: a402338
- FOUND commit: 906e0d9
- FOUND commit: 307a051

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
