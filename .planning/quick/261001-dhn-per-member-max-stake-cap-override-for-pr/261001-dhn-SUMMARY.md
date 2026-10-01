---
phase: quick-261001-dhn
plan: 01
subsystem: promos
tags: [drizzle, server-action, profit-boost, per-member]
key-files:
  created:
    - drizzle/0011_user_promo_caps.sql
    - drizzle/meta/0011_snapshot.json
    - src/domain/promos/yourCap.ts
    - src/db/promoCaps.ts
    - src/app/actions/set-promo-cap.ts
    - src/components/promos/YourCapField.tsx
  modified:
    - src/db/schema.ts
    - src/db/promos.ts
    - src/db/promoObservations.ts
    - src/domain/promos/promoRowDto.ts
    - src/domain/promos/dto.ts
    - src/components/promos/PromoRow.tsx
    - src/components/promos/UnprofitablePromoRow.tsx
    - src/components/promos/PromosScreen.tsx
metrics:
  completed: 2026-10-01
---

# Quick 261001-dhn: Per-member "Your cap" for profit boosts Summary

A member can type their own max stake on a Promos-tab boost row; it saves instantly and recomputes that member's stakes and profit everywhere, while other members and shared observations stay on the promo's own cap.

## Status

- Task 1 (storage, helpers, cap-aware getActivePromos, group-safe observations, DTO): done, commit cca0729.
- Task 2 (setPromoCapAction + YourCapField UI): done, commit ea43d66.
- **Task 3 is PENDING OWNER ACTION and was not executed:** review drizzle/0011_user_promo_caps.sql, run `npm run db:migrate` yourself, then run the manual checks (Your cap = 20 on promo #20, Opportunities shows it, a second member still sees $25, "Use book's cap" restores $25). No live DB write of any kind was made. `drizzle-kit generate` was run with a dummy DATABASE_URL, so it never connected anywhere.

## How it works

- `getActivePromos(now, viewerUserId)` loads the viewer's caps in parallel and applies them (`applyMemberCaps`), so Promos, Opportunities, pairs, alt-spread picking and mark-done snapshots pick them up with no caller changes.
- `recordCurrentProfitObservations` ranks `stripMemberCaps(...)`, so shared observations always use the promo's own cap (tested).
- Before migration is applied: `getMemberPromoCaps` returns no caps only on SQLSTATE 42P01 (direct or via `.cause`); the action returns an "unavailable" message. Other errors still surface.
- Scraper boundary test asserts nothing under src/ingestion or scripts references the caps table.

## Deviations from Plan

None in behavior. Note: the Task 2 write functions (getCapEditablePromo, upsert, delete) were added to src/db/promoCaps.ts in the Task 1 commit, since that file was created there.

## Deferred Issues

- Pre-existing failure, not caused by this plan (reproduces on the untouched main checkout): `src/app/actions/refresh-spreads-totals.test.ts` > "returns blocked when credits are low" (expects "blocked", gets "error"). Likely date-dependent. Left alone as out of scope.

## Verification

- Targeted tests (yourCap, promoCaps, promoObservations, rankPromoHedges, boundary, promos, set-promo-cap): pass.
- Full vitest: 1494 passed, 1 failed (the pre-existing one above).
- `tsc --noEmit`: only the known worktree `LayoutProps` error in src/app/layout.tsx.
- `npm run lint`: clean.
- Migration is additive (no DROP / ALTER COLUMN / RENAME).

## Self-Check: PASSED
