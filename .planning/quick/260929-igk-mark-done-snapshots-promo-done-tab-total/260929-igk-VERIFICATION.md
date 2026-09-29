---
phase: quick-260929-igk
verified: 2026-09-29
status: human_needed
score: 9/9 must-haves verified in code
---

# Quick 260929-igk Verification

All truths verified against code (not SUMMARY). Tests re-run: doneSnapshot + actions = 12 files / 236 tests pass.

| Truth | Status | Evidence |
|---|---|---|
| Done rows render only from snapshot | VERIFIED | DonePromoRow takes only DonePromoDTO; toDonePromoDTO reads only snapshot (zod-validated) and the profit_extracted column; no live-odds input. Legacy: null snapshot -> "Marked done before profit tracking", forced "0.00". |
| totalExtracted per session user, Decimal | VERIFIED | getPromos: getPromoCompletions(user.userId) -> sumProfitExtracted (Decimal reduce, toFixed(2)); included in all 5 "ok" returns. |
| mark/undo/read filter by session user | VERIFIED | requireUser() first statement; strict schemas (no userId); getPromoCompletions WHERE user_id; unmark DELETE WHERE user_id AND promo_id; promoCompletions referenced only in promoTracking.ts and schema.ts. |
| Odds-changed rejection | VERIFIED | mark action recomputes via computeMemberPromoState with session user; isSameDisplayedProfit (Decimal, null handling) mismatch -> odds_changed, nothing stored; client value never persisted. Covered by tests. |
| Active feed and "Total profit possible" exclude done | VERIFIED | feedPromos = activePromos minus doneIds used for empty check, rank, unprofitable, re-rank; sumOwnBookProfit gets doneIds. |
| Group observations unchanged | VERIFIED | recordCurrentProfitObservations still receives full activePromos; promoObservations.ts and profitTotals.ts untouched in diff. |
| No-hedge at $0, Undo kept, double-tap | VERIFIED | no_hedge snapshot profit "0.00"; onConflictDoNothing keeps first snapshot. |
| Migration | VERIFIED | 0009 has snapshot jsonb + profit_extracted numeric(10,2) DEFAULT '0' NOT NULL. |
| Tabs UI wired | VERIFIED | PromosScreen Active/Done(n) tabs, doneRows.map -> DonePromoRow, totalExtracted passed to ProfitSummary. |

Minor notes (non-blocking): getPromoCompletions inner-joins promos (promos never deleted, so fine).

## Human verification required

1. In the browser, mark a promo done on Active: it should move to Done with the correct profit and "Total profit extracted" should rise by that amount.
2. Press Undo on a Done row: it returns to Active and the total drops.
3. Confirm the two legacy completions (promos 5, 13) show as "Marked done before profit tracking" at $0.00.
4. Visual check of the tab strip and the two side-by-side totals on mobile and desktop.
