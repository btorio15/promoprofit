---
phase: quick-260929-gcn
plan: 01
subsystem: promos
tags: [fanduel, scraper, review-queue, et-windows]
key-files:
  created:
    - src/test/fixtures/promos/fanduel-promo-detail-nhl-boost-0929.json
  modified:
    - src/domain/promos/etTime.ts
    - src/ingestion/promos/books/fanduel.ts
    - src/domain/promos/memberScope.ts
    - src/domain/promos/reviewInput.ts
    - src/domain/promos/correctionOptions.ts
    - src/domain/promos/dto.ts
    - src/app/actions/correct-promo-match.ts
    - src/app/actions/classify-promo.ts
    - src/app/actions/get-promos.ts
    - src/components/promos/CorrectionScopeSelect.tsx
    - src/components/promos/QueueItemCard.tsx
    - src/components/promos/ClassifyQueueCard.tsx
metrics:
  completed: 2026-09-29
---

# Quick 260929-gcn: Multi-day promo windows Summary

FanDuel promos that name several game days ("September 29th and September 30th, 2026") now get a window covering every named ET day, and the review queue can save a multi-day sport window in one step with a "Through" day picker prefilled from the scraped window.

## Commits

- 27c60ce feat: FanDuel multi-date windows (parseEtDateSpan, extendToExpiry, span regex, fixture)
- 7eab7b5 feat: range-aware sport_day scope (resolveMemberScope etEndDate, zod, actions, helpers)
- 549284d feat: review UI Through-day selector with scraped-window prefill

## Fixture

`fanduel-promo-detail-nhl-boost-0929.json` is a LIVE capture (HTTP 200 from the FanDuel detail endpoint, no PerimeterX header): one-element array, promoCode LONHLPBT0929, description contains the September 29th and September 30th text, combinedEndDate 2026-10-01T06:00:00.000Z. Not hand-built.

## Results

- LONHLPBT0929 parses to windowStart 2026-09-29T04:00:00.000Z, windowEnd 2026-10-01T03:59:59.999Z, maxStake null with "maxStake" still in unparsedCapFields (CR-04 untouched).
- "this week" and other ambiguous text keep a null window; existing CFB and Eagles @ Bears assertions untouched and passing.
- Single-day review submissions are unchanged (no etEndDate key sent, same result and messages).
- Tests: full vitest 67 files / 1016 tests pass. eslint clean. `tsc --noEmit`: only error is pre-existing `src/app/layout.tsx(21,50): Cannot find name 'LayoutProps'` (Next generated types absent in this worktree, unrelated to these changes).
- verbatimGuard.ts, reconcile.ts, finePrint.ts, sportHints.ts not modified.

## Plan-checker warnings applied

1. get-promos.ts scrapedWindow guards sportKeyHint/windowStart/windowEnd with `typeof === "string"` so partial drafts (undefined fields) never throw.
2. parseEtDateSpan trims trailing connectors and punctuation ("to", "until", "and", ",", "!") before tokenising; table cases added ("September 29th, 2026, and" / ", up to" tail, trailing "!").

## What happens to the stored LONHLPBT0929 row (id 14)

Read from src/domain/promos/lifecycle.ts (decideScrapedWrite) and src/ingestion/promos/store.ts:

- The window on the stored row lives in the scope columns (window_start/window_end). A scrape of an already-active row never rewrites the scope columns; it only touches (last seen, expiry) or refreshes the parsed JSON and cap columns. So the next scrape will NOT change or replace the hand-set window 2026-09-29T04:00Z..2026-10-01T03:59:59.999Z. The new parser's window only lands in the row's `parsed` JSON.
- The max stake is the risk. If the $10 max stake was entered through the app's cap-entry action (cap_entered_by_user_id set), the scrape only "touches" the row and the $10 and active status stay. If the $10 was set directly in the database without setting cap_entered_by_user_id, the scrape takes the "refresh" path: caps are re-taken from the parse (maxStake null), so max_stake would be cleared and the row would drop back to pending_review/caps (CR-01/CR-04), needing the $10 entered again in the review queue. This is existing behavior, not changed here. To check: `select cap_entered_by_user_id from promos where id = 14`.
- No correction is needed for the window itself; it is already right.

## Deviations from Plan

None to plan behavior. Note: worktree started at 62fb810 and was reset to the expected base d69fd98 per the branch check; node_modules is a symlink to the main checkout's (gitignored, not committed).

## Self-Check: PASSED

Commits 27c60ce, 7eab7b5, 549284d exist; fixture file exists.
