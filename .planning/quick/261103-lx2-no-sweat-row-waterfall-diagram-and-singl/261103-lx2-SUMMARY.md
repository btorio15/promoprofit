---
phase: quick-261103-lx2
plan: 01
subsystem: ui
tags: [no-sweat, opportunities, waterfall, popover]
key-files:
  created:
    - src/components/promos/noSweatWaterfall.ts
    - src/components/promos/noSweatWaterfall.test.ts
    - src/components/promos/NoSweatNoticesPopover.tsx
  modified:
    - src/components/promos/NoSweatDetails.tsx
    - src/components/promos/NoSweatRow.tsx
    - src/components/promos/TrackButton.tsx
completed: 2026-11-03
---

# Quick 261103-lx2: No-sweat row waterfall diagram + single notices popover

Implements sketch 001 (diagram B + notices 1): the expanded no-sweat panel shows two bet chips and win/lose waterfalls on one shared scale (decimal.js-derived amounts), and every notice sits in one (i) popover beside the est. badge.

## Commits
- b038441: pure waterfall helper + 7 vitest cases
- Task 2: NoSweatDetails rewrite (bets + waterfalls + legend + worst-case line; no Track button, no risk text, no green)
- Task 3: NoSweatNoticesPopover, amber warning dot, est. badge, TrackButton no longer renders risk advisory

## Verification
- Full `npx vitest run`: 163 files / 2335 tests pass
- `npm run typecheck`: clean; `npm run lint`: 0 errors (4 pre-existing warnings in unrelated tests)
- No `text-primary`/`bg-primary` in new files; no changes under src/domain/

## Deviations
- Helper also exports `netLabel` (used by tests and formatStepAmount); `precision` prop dropped from NoSweatDetails (now unused).
- Task 1 tests and implementation were written together and passed first run (no separate RED commit).
- Task 2 and 3 were committed separately, so the Task 2 commit alone does not typecheck (NoSweatRow still passed `precision`); fixed in Task 3.

## Pending
- Owner phone (375-390px) and laptop visual check: waterfalls match sketch 001 B, (i) popover does not toggle row, amber dot shows with Low-profile warnings, one Track button. Not yet done.

## Self-Check: PASSED
