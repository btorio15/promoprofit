---
phase: quick-261014-u6k
plan: 01
subsystem: promos
tags: [max-stake, caps, settings, drizzle]
key-files:
  created:
    - src/db/bookCaps.ts
    - src/app/actions/set-book-cap.ts
    - src/app/actions/set-book-cap.test.ts
    - src/components/settings/SettingsBookCapsForm.tsx
    - drizzle/0016_worthless_rockslide.sql
  modified:
    - src/domain/promos/yourCap.ts
    - src/domain/promos/promoRowDto.ts
    - src/db/promos.ts
    - src/db/schema.ts
    - src/app/settings/page.tsx
    - src/components/promos/YourCapField.tsx
decisions:
  - "Per-promo cap wins outright, even above the book's own cap (261001-dhn behavior kept)"
  - "Boosts with unknown book cap are now evaluated at the $25 default instead of skipped"
metrics:
  completed: 2026-10-14
---

# Quick 261014-u6k: $25 default max bet plus per-book max bet in Settings

Every profit boost is now computed at a $25 max bet (or the book's own cap if lower); members can set a max bet per book in Settings, and the existing per-promo "Your cap" still wins over everything.

## Precedence (profit boosts only; bonus bets unchanged)
1. Per-promo "Your cap" (may exceed the book's cap).
2. Else the member's per-book value, or the $25 default, bounded above by the promo's own cap when known. Ties go to the book's cap.

## Commits
- 1fa395a test: failing precedence tests (RED)
- dd7eed9 feat: domain precedence, `applyMemberCaps(promos, promoCaps, bookCaps)`, row labels, `YourCapDTO`
- a6d7e09 feat: `user_book_caps` table + migration 0016, `src/db/bookCaps.ts`, `setBookCapAction`, feed wiring, scraper boundary test
- 14744b2 feat: Settings "Max bet per book" card, `YourCapField` labels

## Manual step for owner
Run `npm run db:migrate` to apply migration 0016 (`user_book_caps`). Until then the app treats per-book caps as unset (the $25 default still applies) and saving a per-book max bet returns an "unavailable" message. The executor did not run it.

Note: per-member profit snapshots/observations recorded from now on reflect the $25 default.

## Deviations from Plan
- [Rule 3] Updated existing tests broken by the new signatures: `rowPrices.test.ts` fixture (new fallback fields), `promoObservations.test.ts` and `rankPromoHedges.test.ts` (3-arg `applyMemberCaps`), and `book-routing.test.ts` / `settings-navigation.test.ts` (mock `@/db/bookCaps` and the new form since SettingsPage now loads book caps).
- Migration SQL verified to contain only CREATE TABLE user_book_caps and its two FKs.

## Verification
`npm test` 1827 passed; `npm run lint` clean. `tsc --noEmit` reports only `src/app/layout.tsx: Cannot find name 'LayoutProps'` (pre-existing; relies on Next generated types, unrelated to this change).

## Known Stubs
None.

## Self-Check: PASSED
