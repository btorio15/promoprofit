---
phase: 09-no-sweat-promos-in-the-feed
plan: 05
subsystem: promos
tags: [exhaustive-switch, d-19, pairs, dto]
requires:
  - phase: 09-01
    provides: no_sweat type, GuaranteedPromoType, assertNever
provides:
  - promoTypeLabel / guaranteedPromoTypeLabel helpers
  - pair finder runtime no-sweat guard
  - guaranteed DTOs and v1 snapshots narrowed to guaranteed types
requirements-completed: [FEED-02, FEED-04]
completed: 2026-11-03
---

# Phase 9 Plan 05: Exhaustive guaranteed pipeline Summary

Every boost-vs-bonus branch in the guaranteed pipeline is now an exhaustive switch ending in assertNever, the pair finder filters out no-sweats at runtime, and guaranteed DTOs / v1 snapshots only accept Boost and Bonus bet.

## Tasks
1. promoTypeLabel.ts (+test); pairPromos.ts buildLegOption and boost/bonus kind derivation became switches; findPairCandidates filters with isGuaranteedPromoType (forced-cast test); altSpreads input narrowed to GuaranteedPromoType. Commit 8f543c9.
2. dto.ts PromoRowDTO and sibling DTOs use GuaranteedPromoType; promoRowDto/pairRowDto use guaranteedPromoTypeLabel, promoTitle is a switch; doneSnapshot/pairSnapshot v1 schemas use z.enum(GUARANTEED_PROMO_TYPES); legacy Done title/label no longer map no_sweat to "Bonus bet" (DonePromoDTO label widened to PromoTypeLabel); queue item label uses promoTypeLabel; set-promo-cap comment. Tests added in doneSnapshot.test.ts. Second commit on this branch (see git log).

## Deviations from Plan
- rankPromoHedges.ts, leagueWideAltTargets.ts, yourCap.ts needed no edit: RankablePromo.promoType was already GuaranteedPromoType (09-01) and their conditions are boost-specific cap guards.
- dto.ts:175 (classify queue `suggested.promoType`) intentionally stays PromoType: a reviewer may classify into no_sweat.
- DonePromoTerms.promoType narrowed to GuaranteedPromoType to match the v1 schema.
- No fallout files (lifecycle, promoReview, addPromoDraft, AddPromoForm, PromoRow, store.ts) needed changes; typecheck is clean.

## Verification
vitest on src/domain/promos, src/app/actions, src/db: 1205 tests pass. `npm run typecheck`: only the known worktree LayoutProps artifact in src/app/layout.tsx.

## Self-Check: PASSED
