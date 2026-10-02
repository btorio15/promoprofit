---
phase: quick-261002-dqn
plan: 01
subsystem: promos
tags: [flag, review, dto]
key-files:
  modified:
    - src/db/promoReview.ts
    - src/app/actions/flag-promo-match.ts
    - src/db/promos.ts
    - src/domain/promos/dto.ts
    - src/domain/promos/promoRowDto.ts
    - src/components/promos/PromoRow.tsx
    - src/components/promos/UnprofitablePromoRow.tsx
completed: 2026-10-02
---

# Quick 261002-dqn: Flag any active scraped promo

Any active scraped promo (auto-matched or human-confirmed/corrected/classified) can now be flagged back into Needs a look; member-added promos cannot.

## Changes
- `flagUpdateWhere(promoId)`: status active AND added_by_user_id IS NULL replaces the auto_matched condition in `applyFlag` (still one race-safe UPDATE).
- `getActivePromoForFlag` returns `scraped`; the action rejects non-scraped with "Only scraped promos can be flagged."
- `ActivePromo.scraped` feeds `flaggable` on PromoRowDTO and UnprofitablePromoRowDTO; PromoRow and UnprofitablePromoRow show Flag on `row.flaggable`, and the Auto-matched badge stays on `row.autoMatched`.
- Tests: action, flagUpdateWhere SQL, mapActivePromoRow, getPromos flaggable, lifecycle (flagged confirmed row stays in review; no lifecycle.ts change needed).

## Commits
- 0f5795c: server-side flag change
- f76b4e8: flaggable DTO + UI

## Deviations
None of substance. The flag lookup still selects `autoMatched` because `ActivePromoScopeRow` requires it (caught by tsc, fixed in f76b4e8).

## Verification
vitest 1639/1639 pass; tsc clean except the pre-existing `LayoutProps` error; eslint clean.

## Self-Check: PASSED
