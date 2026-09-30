---
phase: 05-group-added-promos
plan: 05
subsystem: promos-add-ui
tags: [react, forms, added-promos]
requires: [05-04]
provides:
  - addPromoDraft helpers (expiryDayOptions, expiryTimeOptions, parseOddsText, bonusPayloadFromDraft, emptyBonusDraft)
  - ExpiryField, BonusBetFields, AddPromoForm components
  - Add promo entry point in Promos > Active
affects: [05-06]
key-files:
  created:
    - src/domain/promos/addPromoDraft.ts
    - src/domain/promos/addPromoDraft.test.ts
    - src/components/promos/ExpiryField.tsx
    - src/components/promos/BonusBetFields.tsx
    - src/components/promos/AddPromoForm.tsx
  modified:
    - src/components/promos/PromosScreen.tsx
key-decisions:
  - "Client validation runs AddPromoInputSchema + fieldErrorsFromIssues so client and server show identical messages"
  - "More details (optional) auto-opens when it holds a field error so errors are never hidden"
duration: 20min
completed: 2026-09-30
---

# Phase 5 Plan 05: Add-promo UI (bonus bet) Summary

A member can tap "Add promo" at the top of Promos > Active, fill book, bonus amount and expiry (game(s) and min odds optional), save through addPromo, and see it in Promos and Opportunities right away.

## Commits
- d9a953a: draft helpers with 14 tests, ExpiryField, BonusBetFields
- see git log: AddPromoForm and PromosScreen wiring

## Notes
- Book select only lists books from getAddPromoFormOptions (D-08); with none it shows "Pick your sportsbooks first" and a link to /settings.
- Blank Game(s) sends scope null (server stores "any").
- On save: form closes, session confirmation line shows, getPromos refetches and onPromosChanged() refetches Opportunities (D-09).
- Cancel returns focus to the Add promo button; opening focuses the Book select; first invalid field takes focus on Save.
- Accent styling uses the default Button variant (the app's --primary is the accent green).
- Money and odds never touch floats: odds parsed with regex + parseInt, amount passed as a string to the server schema.

## Deviations from Plan

**1. [Rule 3] Worktree base was 914da50**; reset to 5a77c54 per instructions. node_modules symlinked for tests and removed before return.

**2. [Rule 1] Test date expectation:** Oct 4 2026 is a Sunday, so the test asserts "Sun, Oct 4" (the plan's "Sat, Oct 4" was only an example label).

**3. Minor addition:** More details collapsible is controlled so it opens itself when it contains an error (otherwise a min-odds or game error would be invisible).

## Verification
- `npm test`: 86 files, 1286 tests pass. Lint clean.
- `npm run typecheck`: only the known `src/app/layout.tsx LayoutProps` artifact.
- Acceptance greps pass (no parseFloat/Number( in addPromoDraft.ts, no db imports there, required copy present).
- Not done: manual 360px browser check (left for verify-work); duplicate hint (D-12) and Type toggle belong to later plans.

## Known Stubs
None.

## Self-Check: PASSED
