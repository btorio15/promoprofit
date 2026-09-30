---
phase: quick-260930-iaw
plan: 01
subsystem: ui-resilience
tags: [error-handling, server-actions, next-error-boundary]
key-files:
  created:
    - src/lib/safeAction.ts
    - src/lib/safeAction.test.ts
    - src/components/finder/finderSearchOutcome.ts
    - src/components/finder/finderSearchOutcome.test.ts
    - src/app/error.tsx
    - src/app/error.test.ts
  modified:
    - src/components/finder/FinderForm.tsx
    - src/components/arb/ArbForm.tsx
    - src/components/finder/OddsStatusBar.tsx
    - src/components/finder/RefreshConfirmDialog.tsx
    - src/components/arb/SearchSpreadsTotalsDialog.tsx
    - src/components/opportunities/MarkPairDoneButton.tsx
    - src/components/promos/ (DonePairRow, MarkUsedButton, FlagMatchButton, DismissPromoDialog, QueueItemCard, ClassifyQueueCard)
metrics:
  completed: 2026-09-30
---

# Quick 260930-iaw: Stop DB hiccups from crashing the site

A thrown server action (e.g. NeonDbError fetch failed) now shows an inline "Couldn't reach the database — try again." message instead of blanking the page, backed by a root `src/app/error.tsx` boundary.

## What was done

- `safeAction(call, label)` returns `{ok, value}` or `{ok:false}`, logs via console.error, and rethrows Next redirect/not-found control-flow errors so auth redirects still work.
- FinderForm: both `findHedges` calls wrapped; on failure results are cleared, form values kept, inline destructive Alert shown, cleared on next success. Mapping lives in pure `resolveFinderOutcome` (tested with a rejecting mocked findHedges).
- `src/app/error.tsx`: plain "Something went wrong" + Try again (`retry`), never renders error message/stack/digest (tested).
- ArbForm (findArbs + spreads/totals search), OddsStatusBar, both refresh confirm dialogs, and all promo/opportunity action buttons/dialogs/cards guarded with the same helper.
- findHedges and other action return contracts unchanged.

## Commits

- 4939e6c feat: safeAction + FinderForm inline error
- 3f28d93 feat: root error boundary + arb/odds-refresh guards
- (task 3) feat: promo mark/undo/flag/dismiss/queue guards

## Deviations

None. Note: ArbForm's thrown `refreshSpreadsTotals` also calls `router.refresh()` to mirror the existing error branch.

## Verification

vitest: 98 files / 1440 tests pass; eslint clean; tsc only the known pre-existing `LayoutProps` error in src/app/layout.tsx; grep gate for unwrapped actions empty.
