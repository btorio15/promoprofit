---
phase: 04-opportunities-feed
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/domain/hedge/pairMath.ts
  - src/domain/promos/pairPromos.ts
  - src/domain/promos/pairSnapshot.ts
  - src/domain/promos/doneSnapshot.ts
  - src/domain/promos/profitTotals.ts
  - src/domain/promos/pairRowDto.ts
  - src/domain/opportunities/pick.ts
  - src/app/actions/get-opportunities.ts
  - src/app/actions/mark-pair-done.ts
  - src/app/actions/mark-promo-used.ts
  - src/app/actions/get-promos.ts
  - src/db/promoTracking.ts
  - src/db/memberPairState.ts
  - src/db/feedContext.ts
  - src/components/AppShell.tsx
  - src/components/opportunities/OpportunitiesScreen.tsx
  - src/components/opportunities/PairCard.tsx
  - src/components/opportunities/MarkPairDoneButton.tsx
  - src/components/promos/PromosScreen.tsx
  - src/components/promos/DonePairRow.tsx
  - src/lib/sortPreference.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-09-29
**Depth:** standard
**Files Reviewed:** 21 (UI files ToolsScreen, PairDetails, OpportunitySection, SortSwitch not read in depth)
**Status:** issues_found

## Summary

The correctness-critical core holds up. pairMath.ts uses decimal.js throughout. Its inverse-payout formulas for net_winnings, boost_extra and total_payout caps are consistent with the forward payout. The prune bounds in pairPromos.ts are valid upper bounds, and the D-08 gate is strict (`gt`). Auth is correct: requireUser() is the first statement in every action, schemas are strict with no userId, both pair rows go in one multi-row INSERT with no ON CONFLICT, undo deletes both rows scoped to the session user, and the odds-changed check compares profit and both stakes as Decimals. No client numbers are persisted, and there is no dangerouslySetInnerHTML in the phase's files. Profit totals count a pair once. No BLOCKERs found. The warnings are robustness gaps around error handling, concurrency and matching fallback.

## Warnings

### WR-01: Thrown server action leaves confirm dialog stuck open with no message
**File:** `src/components/opportunities/MarkPairDoneButton.tsx:49-75` (same pattern in `src/components/promos/DonePairRow.tsx:44-54`)
**Issue:** `markPairDoneAction` and `unmarkPairDoneAction` are awaited inside `startTransition` with no try/catch. The server side can throw: requireUser() when the session has expired, or any DB error in `computeMemberPairState` or `unmarkPairDone`. In that case the promise rejects. In MarkPairDoneButton, `setOpen(false)` never runs and `setErrorMessage` is never called, so the dialog stays open and the user gets no feedback. In DonePairRow, Undo silently does nothing. The rejection is unhandled. The SAVE_FAILED_MESSAGE path only covers the `save_failed` and `invalid` statuses. OpportunitiesScreen and PromosScreen wrap the same kind of call in try/catch, so this is inconsistent.
**Fix:**
```ts
startTransition(async () => {
  let outcome;
  try { outcome = await markPairDoneAction({...}); }
  catch { setOpen(false); setErrorMessage(SAVE_FAILED_MESSAGE); return; }
  ...
});
```

### WR-02: Concurrent double submit reports a failure although the pair was saved
**File:** `src/app/actions/mark-pair-done.ts:34-64`, `src/db/promoTracking.ts:75-87`
**Issue:** The double-tap guard is a read-then-write pre-check (`already_done_pair`), not atomic. Two near-simultaneous requests (double click before `isPending` disables the button, or two devices) both pass the pre-check. One INSERT succeeds and the other hits the (userId, promoId) unique violation, which is caught as `save_failed`. The second caller sees "Couldn't save that" although the pair is recorded. Data integrity is preserved: nothing half-writes. The user-facing result is wrong, and a retry then returns ok via the pre-check.
**Fix:** In the catch, re-run `computeMemberPairState`. If it now returns `already_done_pair`, return `{ status: "ok", profitExtracted }`. Otherwise return `save_failed`.

### WR-03: Greedy fallback for large pair components silently breaks the exact-matching guarantee (D-10)
**File:** `src/domain/promos/pairPromos.ts:466-471`, `src/app/actions/get-opportunities.ts:98-103`
**Issue:** Components of more than 20 promos use greedy-by-gain, which is not max-weight. `selectPairs` supports `onFallback`, but neither caller passes it. The feed can show a suboptimal pairing, and the pair-aware Total profit is understated, with no log or signal. Failure scenario: a member with many books and many boosts on one slate forms a 21+ node component, and the total silently differs from the true optimum. The greedy fallback is also not deterministic relative to the exact path when weights tie. Realistic risk is low for a small group, but the deviation is invisible.
**Fix:** Pass `{ onFallback: (n) => console.warn(...) }` from getOpportunities at minimum. Consider a max-weight matching (blossom) or a larger exact bound.

### WR-04: Duplicate fetch on every mutation in PromosScreen
**File:** `src/components/promos/PromosScreen.tsx:141-144` with effect at `:126-133`
**Issue:** `handleChanged` calls `runGetPromos()` and then `onPromosChanged()`. The latter bumps `promosVersion`, and PromosScreen's own `[promosVersion]` effect fires `runGetPromos()` again. Every Mark done or Undo triggers two `getPromos` server actions. Each one also runs `recordCurrentProfitObservations`, a DB write. The requestId guard keeps the UI correct, but it doubles the DB and CPU work.
**Fix:** Have `handleChanged` call only `onPromosChanged()`, since the version effect already refetches.

## Info

### IN-01: Misleading "no longer active" message when a promo is already done or not at the member's book
**File:** `src/db/memberPairState.ts:70-73`, `src/app/actions/mark-pair-done.ts:39-41`
**Issue:** If either promo is already done (individually or in a different pair) or is at a book the member lacks, the state is `not_active` and the UI shows "One of these promos is no longer active." This is inaccurate. It does not corrupt data.
**Fix:** Return a distinct `already_done` or `unavailable` state with accurate copy.

### IN-02: Odds-changed guard compares only profit and the two stakes
**File:** `src/domain/promos/pairSnapshot.ts:211-221`
**Issue:** If the best market or the odds shift but profit and both stakes happen to be identical, the stale row passes. The snapshot is built from the server recompute, so the stored numbers are always self-consistent. Only the user's on-screen selection or odds could differ from what is saved. This is a very low likelihood that matches the D-23 spec as written.
**Fix:** Optionally include the selection or odds in the expected payload.

### IN-03: "Profit available" (today/week/month) is not pair-aware
**File:** `src/app/actions/get-opportunities.ts:53`, `src/db/feedContext.ts:18-23`
**Issue:** `totalProfit` counts a pair once (D-12). The observation-based available-profit periods are recorded per promo from singles only. A pair's extra gain is not in them, and the two headline figures use different bases.
**Fix:** Document the difference, or record pair observations.

### IN-04: Feed read performs a DB write and can fail the whole feed
**File:** `src/app/actions/get-opportunities.ts:52`
**Issue:** `recordCurrentProfitObservations` is awaited unguarded on every feed load. A transient write failure makes `getOpportunities` throw, so the whole landing screen shows "Couldn't load" even though the feed data is fine. Same pattern as getPromos.
**Fix:** Wrap it in try/catch and log, since it is best-effort bookkeeping.

---

_Reviewed: 2026-09-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
