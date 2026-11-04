---
phase: 12-add-kalshi-and-polymarket-as-hedge-venues
plan: 07
subsystem: ui
tags: [book-picker, onboarding, settings, prediction-markets]
requires: [12-01]
provides:
  - Grouped BookPicker with opt-in "Prediction markets" group and CFTC availability note
  - Pure helpers groupBookOptions / hasSportsbook
key-files:
  created:
    - src/components/settings/bookPickerGroups.ts
    - src/components/settings/bookPickerGroups.test.ts
  modified:
    - src/components/settings/BookPicker.tsx
    - src/components/settings/SettingsBooksForm.tsx
    - src/components/settings/OnboardingBooksForm.tsx
    - src/app/settings/page.tsx
    - src/app/onboarding/books/page.tsx
    - src/app/book-routing.test.ts
    - src/app/settings-navigation.test.ts
requirements-completed: [MKT-01]
completed: 2026-11-02
---

# Phase 12 Plan 07: Opt-in market venues in My Books Summary

Shared BookPicker now shows Sportsbooks, then a "Prediction markets" group (Kalshi, Polymarket) unticked by default, with the verbatim CFTC note under a ticked market; submit requires at least one sportsbook.

## Tasks
1. Pure grouping helper + grouped BookPicker (commit: "feat(12-07): grouped BookPicker...")
2. Onboarding/Settings wiring to getMyBookOptions / getUserMyBookKeys (commit: "feat(12-07): wire onboarding and Settings...")

## Notes
- Settings initialKeys now come from getUserMyBookKeys; getUsableUserBooks (sportsbook-only) still drives the redirect predicate and the caps form, so markets never appear in caps.
- Forms show "Select at least one sportsbook." when only markets are ticked.

## Deviations from Plan
**[Rule 3 - Blocking] settings-navigation.test.ts** mocked `@/db/queries` without the new exports and failed; added getMyBookOptions/getUserMyBookKeys to its mock.

## Verification
vitest src/components/settings src/app: 407 passed; eslint clean; tsc only the known LayoutProps error. No stubs. No VPN wording present.

## Self-Check: PASSED
