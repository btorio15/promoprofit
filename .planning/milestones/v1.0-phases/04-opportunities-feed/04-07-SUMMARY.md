---
phase: 04-opportunities-feed
plan: 07
subsystem: opportunities-feed
tags: [pairs, mark-done, server-actions, decimal.js]
requires: ["04-06"]
provides:
  - "pairSnapshot (DonePairSnapshotSchema, PairMemberSnapshotSchema, buildPairSnapshot, isSamePairDisplay)"
  - "computeMemberPairState"
  - "markPairDone (one multi-row INSERT)"
  - "markPairDoneAction"
  - "MarkPairDoneButton in PairCard"
affects: [opportunities-screen, done-tab]
key-files:
  created:
    - src/domain/promos/pairSnapshot.ts
    - src/domain/promos/pairSnapshot.test.ts
    - src/db/memberPairState.ts
    - src/db/memberPairState.test.ts
    - src/app/actions/mark-pair-done.ts
    - src/app/actions/mark-pair-done.test.ts
    - src/components/opportunities/MarkPairDoneButton.tsx
  modified:
    - src/domain/promos/reviewInput.ts
    - src/db/promoTracking.ts
    - src/components/opportunities/PairCard.tsx
decisions:
  - "Double tap on an already-marked identical pair returns ok with no write (detected via the pair snapshot on either promo's completion row)"
  - "No schema change or migration: the primary promo's row holds the pair snapshot and profit, the partner's row holds a pair_member marker at $0.00"
metrics:
  tasks: 3
  completed: 2026-09-29
---

# Phase 4 Plan 07: Mark pair done Summary

A member can mark a pair done: the server recomputes the pair, rejects if profit or either stake moved (odds-moved message, nothing saved), then writes both promos in one atomic INSERT so Total profit extracted counts the pair once.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. RED tests | ee8dbce | MarkPairDoneInputSchema + snapshot, action, memberPairState tests |
| 2. Server | 76a0b94 | pairSnapshot, computeMemberPairState, markPairDone, markPairDoneAction |
| 3. UI | 725aed0 | MarkPairDoneButton + PairCard wiring (dialog copy per UI-SPEC) |

## Verification

- Full `vitest run`: 79 files, 1201 tests pass.
- `tsc --noEmit` clean (after `next typegen`); `npm run lint` clean.
- Grep gates: no `onConflict` in markPairDone; no userId in input schema; no schema.ts/drizzle changes.

## Deviations from Plan

None to behavior. Added an extra test file `src/db/memberPairState.test.ts` (real pair logic with mocked DB) covering the recompute, not_active cases, and already_done_pair. The pairSnapshot module uses `import type` only from doneSnapshot.ts, as required for Plan 08.

## Notes for Plan 08

The Done tab's `toDonePromoDTO` does not yet understand `kind: "pair"` / `"pair_member"` snapshots; they currently fall back to the legacy "Saved details unavailable" row (profit still counted correctly, pair once).

## Known Stubs

None.

## Threat Flags

None. T-04-20..24 mitigated (requireUser first, strict input, server recompute, single atomic insert, active-promo pre-check).

## Self-Check: PASSED
