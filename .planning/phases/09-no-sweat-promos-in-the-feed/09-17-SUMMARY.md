---
phase: 09-no-sweat-promos-in-the-feed
plan: 17
subsystem: ui
tags: [ui, settings, add-promo, review-queue]
requires: ["09-13", "09-14", "09-19"]
provides:
  - SettingsLowProfileForm and the Low-profile card on /settings
  - NoSweatFields and a No-sweat option in the Add/Edit promo form
  - Disagreement and cash-refund variants of ClassifyQueueCard
  - QueueItemDTO.readings and QueueItemDTO.cashRefund
key-files:
  created:
    - src/components/settings/SettingsLowProfileForm.tsx
    - src/components/promos/NoSweatFields.tsx
  modified:
    - src/app/settings/page.tsx
    - src/components/promos/AddPromoForm.tsx
    - src/components/promos/ClassifyQueueCard.tsx
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
requirements-completed: [FEED-03, FEED-02]
completed: 2026-11-03
---

# Phase 9 Plan 17: Member-facing no-sweat inputs Summary

Low-profile settings card, a No-sweat type in the Add promo form, and a side-by-side scraper/reader review card with one-tap choices, all using the UI-SPEC copy.

## What was built
- **Settings**: "Low-profile" card after "Max bet per book" with Skip long odds (odds input disabled and dimmed when off), Main lines only, Whole-dollar stakes, an explicit "Save changes", inline "Saved" and the spec error copy. Saves through `setLowProfileAction`; initial values come from `getMemberLowProfile`.
- **Add promo**: third "No-sweat" toggle. `NoSweatFields` has Most you get back, Min odds, Sport or league, Expires, a "More details (optional)" Bet type select (Any/Moneyline/Spread/Total) and the "refund is paid as a bonus bet" note. The form body is now an exhaustive switch. Edit prefill already existed in `draftFromEditValues`.
- **Review queue**: `ClassifyQueueCard` shows "Scraper and reader disagree" with Scraper read / Reader read columns and "It's a no-sweat" / "It's a bonus bet" / "Skip". Cash-refund items show "This refund may be cash" with "It's a no-sweat (bonus bet refund)" / "Skip". One tap classifies with the reading's amount and odds. If the amount is missing, it opens an inline field panel instead (a new no-sweat panel, or the existing bonus panel). Result text ("Saved as no-sweat" etc.) shows for 2 seconds, then `onChanged()`.

## Deviations from Plan
**1. [Rule 3 - Blocking] DTO did not carry readings/cashRefund.** 09-19 added them to `QueueRow` only. I added `QueueReadingsDTO`, `QueueItemDTO.readings` and `cashRefund` in `dto.ts`, and mapped them in `get-promos.ts`.
**2. QueueItemCard unchanged.** `ReviewQueueSection` already routes classify items to `ClassifyQueueCard`, so no change was needed.
**3. Worktree base was wrong at start** and was reset to the specified base.

## Verification
Typecheck is clean except the known `LayoutProps` worktree artifact. ESLint is clean. Vitest `src/app/actions` and `src/components`: 34 files, 501 tests pass. No new component tests were written (UI only).

## Commits
- 209e275 feat(09-17): Low-profile settings card
- 32b19d6 feat(09-17): No-sweat type in the Add promo form
- 390fe04 feat(09-17): review queue disagreement and cash-refund cards

## Known Stubs
None.

## Threat Flags
None. Server actions re-validate all input (T-09-50).

## Self-Check: PASSED
