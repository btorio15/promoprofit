---
phase: 04-opportunities-feed
plan: 08
subsystem: opportunities-feed
tags: [pairs, done-tab, undo, snapshots]
requires: ["04-07", "04-04"]
provides:
  - "toDoneRows / DonePairDTO / kind pair in toDonePromoDTO"
  - "unmarkPairDone (single DELETE), pair-aware unmarkPromoUsed"
  - "unmarkPairDoneAction"
  - "DonePairRow in Promos > Done"
affects: [promos-done-tab, opportunities-feed]
key-files:
  created:
    - src/db/promoTracking.test.ts
    - src/components/promos/DonePairRow.tsx
  modified:
    - src/domain/promos/pairSnapshot.ts
    - src/domain/promos/pairSnapshot.test.ts
    - src/domain/promos/doneSnapshot.ts
    - src/app/actions/get-promos.ts
    - src/db/feedContext.ts
    - src/db/promoTracking.ts
    - src/app/actions/mark-pair-done.ts
    - src/app/actions/mark-pair-done.test.ts
    - src/db/memberPairState.test.ts
    - src/components/promos/PromosScreen.tsx
decisions:
  - "A done pair is one Done entry (from the primary promo's pair snapshot); the partner's marker row is filtered out of the list and count"
  - "Undo from either promo id (or a plain single Undo on a pair member) deletes both rows in one statement scoped to the session user"
metrics:
  tasks: 3
  completed: 2026-09-29
---

# Phase 4 Plan 08: Pair Done lifecycle Summary

A marked pair now shows in Promos > Done as one entry (both legs, stakes, paired profit once) and Undo from either promo removes both rows in one DELETE, so Total profit extracted stays exact.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Done read side | fe76f52 | pair schema tried first, then single, then legacy; toDoneRows drops pair_member; get-promos and feedContext use it |
| 2. Undo pair | 8cccf9b | unmarkPairDone reads the member's own row, resolves the partner, one DELETE with inArray scoped by userId; unmarkPromoUsed delegates |
| 3. DonePairRow | 93ab072 | used-row card, both leg lines, profit once, Undo (min-h-11) with inline alert |

## D-11 parity test (orchestrator addition)

`src/db/memberPairState.test.ts` gained "D-11 parity": with the same mocked fixture, `getOpportunities` (pairs source) and `computeMemberPairState` produce the same guaranteed profit and both stakes, and `isSamePairDisplay` accepts them as the same pair.

## Verification

- Full `vitest run`: 80 files, 1214 tests pass.
- `tsc --noEmit` clean (after `next typegen`); `npm run lint` clean.
- Grep gates: `toDoneRows(` once each in get-promos.ts and feedContext.ts; no old `completions.map((c) => toDonePromoDTO` left; `inArray(promoCompletions.promoId` present; no `dangerouslySetInnerHTML` in DonePairRow; requireUser is the first statement of unmarkPairDoneAction.

## Deviations from Plan

- [Rule 3] The worktree started on a stale base; reset to f2fa15e per the startup check.
- DonePairRow is a plain (non-expandable) card rather than a Collapsible: the collapsed view already carries everything the plan lists (legs, stakes, odds, paired profit, date, Undo). Added a `src/db/promoTracking.test.ts` to unit-test unmarkPairDone with a stubbed DB (the DB itself is never touched).
- DonePairRow takes a `DonePromoDTO` (kind "pair") and reads `row.pair`; `DonePairLegDTO` was added alongside `DonePairDTO` (leg fields: promoId, bookName, promoTypeLabel, promoTitle, selectionLabel, oddsAmerican, stake, payout).

## Known Stubs

None.

## Threat Flags

None. T-04-25..28 mitigated (requireUser first and userId-scoped delete; single DELETE; zod safeParse chain with legacy fallback; React text only).

## Self-Check: PASSED
