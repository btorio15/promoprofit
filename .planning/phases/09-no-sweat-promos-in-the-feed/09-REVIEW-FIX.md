---
phase: 09-no-sweat-promos-in-the-feed
fixed_at: 2026-11-03T23:18:16Z
review_path: .planning/phases/09-no-sweat-promos-in-the-feed/09-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-11-03T23:18:16Z
**Source review:** .planning/phases/09-no-sweat-promos-in-the-feed/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, WR-01..WR-06; IN-* out of scope)
- Fixed: 7
- Skipped: 0

**Final checks (run after all fixes):**
- `npx vitest run`: 163 files, 2362 tests, all passed (was 2345 before this run; 17 new regression tests)
- `npm run typecheck`: clean (0 errors)
- `npm run lint`: 0 errors, 4 warnings. All 4 are older unused `_x` variables in test files that this run did not change (`promoTracking.test.ts:153-154`, `addedPromoInput.test.ts:219`, `noSweatSnapshot.test.ts:23`).
- `scripts/audit-no-sweat.ts` was NOT run (no dry run, no `--apply`). It was only typechecked and linted.

## Fixed Issues

### CR-01: Refund-cap parser drops thousands separators and takes the wrong dollar amount

**Files modified:** `src/ingestion/promos/noSweat.ts`, `src/ingestion/promos/noSweat.test.ts`
**Commit:** 4cbca58
**Status:** fixed: requires human verification (logic change in parsing)
**Applied fix:** A shared `AMOUNT` pattern now accepts `$1,000`-style thousands separators. Commas are stripped before the value goes into `Decimal`, and a lookahead rejects malformed numbers like `$1,0000`. The patterns are now ranked tiers, and every tier needs refund wording: (1) `MAX REWARD/refund/bonus bet: $N`, (2) `$N [in|as a] bonus bet(s)/free bet(s)/no-sweat/refund/back`, (3) `refund/back/bonus bet ... up to $N`. The bare `up to $N` pattern is gone. If one tier finds two different amounts, the parser returns null so the promo goes to review. Regression tests:
- `$1,000 in Bonus Bets` reads 1000.00
- `MAX REWARD: $1,000` reads 1000.00
- `$2,500.50 bonus bet` reads 2500.50
- `Bet up to $500 ... get a $25 bonus bet.` reads 25.00, both from the parser and through `classifyNoSweat`
- `up to $25 back in bonus bets` reads 25.00
- the NFL London fixture still reads 10.00
- a bare `Bet up to $500` reads null
- two different bonus-bet amounts read null; the same amount twice reads that amount

All existing book fixture tests still pass.

### WR-01: Cash-refund detection fails when the fine print mentions bonus bets anywhere

**Files modified:** `src/ingestion/promos/noSweat.ts`, `src/ingestion/promos/noSweat.test.ts`
**Commit:** f3f2336
**Status:** fixed: requires human verification (logic change in classification)
**Applied fix:** A new `refundFormOf` helper reads the refund form from the words right after the refund phrase (`refund(ed)/back/returned ... in|as [the form of] [a] cash|bonus bet|free bet|site credit|token|crown cash|dk dollars`). If the form is cash, the promo is `cash_refund`. If it is a bonus bet, the promo is `bonus_bet_refund`. If both forms appear, it is treated as `cash_refund`: never priced and sent to review (D-17). I did not add a new `unknown` kind, so the parsers that call this need no changes. If no refund phrase states a form, the old whole-text rule applies, so existing behaviour is unchanged (for example "non-withdrawable" bonus-bet copy). Tests:
- "stake back in cash. Not valid with bonus bets." is now `cash_refund`
- "back as a Bonus Bet ... no cash value" stays `bonus_bet_refund`
- copy that states both forms is `cash_refund`

### WR-02: No-sweat review drafts default to "bonus_bet" or "profit_boost" when the reader doesn't run

**Files modified:** `src/ingestion/promos/reviewTriage.ts`, `src/ingestion/promos/reviewTriage.test.ts`, `src/domain/promos/scraped.ts`, `src/db/promoReview.ts`, `src/db/promoReview.test.ts`
**Commit:** bcc442a
**Status:** fixed: requires human verification (logic change in draft typing)
**Applied fix:** `buildClassifyDraft` now runs `classifyNoSweat` on the skip. If the skip reason is `no_sweat_cash` or the text is detected as a no-sweat, and the reader gave no type, the draft is typed `no_sweat` and `bonusAmount` is set from `parseNoSweatRefundCap`. A reader-supplied type still wins.

The skip reason is not stored as a column, so I did not add one. Instead, cash drafts get a new `NO_SWEAT_CASH_MARKER` ("[No-sweat refund: cash]") as the first line of rawText. The marker is not added when the reader summary line already says no_sweat_cash. `mapPendingPromoRow` now sets `cashRefund` from this marker as well as from the existing signals.

Note: when a promo has no externalId, its rawText is part of the dedupe key, and the promo type always is. A pending classify row that was mis-typed today will therefore be replaced by a correctly typed one on the next scrape.

Tests:
- a reader-less `no_sweat_cash` Bally Second Chance skip becomes a no_sweat draft with refund cap 25.00 and the marker
- an unrecognized FanDuel no-sweat becomes no_sweat 25.00, not bonus_bet 500
- the marker is not added twice when the reader line exists
- `mapPendingPromoRow` flags cash from the marker

### WR-03: The backfill can crash halfway through on the unique dedupe_key

**Files modified:** `src/ingestion/promos/noSweatAudit.ts`, `src/ingestion/promos/noSweatAudit.test.ts`, `scripts/audit-no-sweat.ts`
**Commit:** d4ec599
**Applied fix:** The planner now builds `takenKeys` from every row, whatever its status, and adds each planned retype's new key as it goes. A later collision becomes `expire_duplicate`. The script now loads every status: the planner still only acts on live rows, and the "Checked N live promo(s)" count only counts live rows. The `--apply` loop is now one `applyAction` call per row inside try/catch. A failure, such as a Postgres 23505 unique violation (reported as "unique dedupe_key conflict"), is recorded and listed at the end, the other rows still get written, and the process exits with code 1. Tests:
- an expired or dismissed holder of the new key turns the retype into expire_duplicate
- when two live rows map to the same new key, the first is retyped and the second expired

### WR-04: One bad tracked row hides every Tracking card without telling the member

**Files modified:** `src/db/noSweatFeed.ts`, `src/db/noSweatFeed.test.ts`, `src/domain/promos/noSweatSnapshot.ts`, `src/domain/promos/noSweatSnapshot.test.ts`
**Commit:** 6090260
**Applied fix:**
- **Tracking cards:** each `buildTrackedCardDTO` call has its own try/catch. A card that fails is dropped with a `console.warn`.
- **Loading:** if loading active no-sweats or Low-profile settings fails, it is caught and logged, and the Tracking cards are still returned.
- **Ranking:** now runs in a separate `rankForMember` function wrapped in try/catch, so a ranker error returns the Tracking cards with no ranked rows.
- **Snapshot schema:** `qualifying.oddsAmerican` and `hedge.oddsAmerican` now use the `americanOdds` range refine. A stored value inside (-100, 100) fails validation, and the existing `getTrackedNoSweats` handling drops that one row with a warning.

Tests:
- a bad hedge odds value drops only that card
- the ranker throwing keeps Tracking
- active-promo loading rejecting keeps Tracking
- the schema rejects 0/50/-99/99 on both odds fields

### WR-05: Settle and refund return a profit that may not be what was saved

**Files modified:** `src/db/promoTracking.ts`, `src/db/promoTracking.test.ts`, `src/app/actions/track-no-sweat.ts`, `src/app/actions/track-no-sweat.test.ts`
**Commit:** f284595
**Applied fix:** `markPromoDone` now uses `.returning()` and returns `Promise<boolean>`: true if this call inserted the row. In `settleNoSweatAction` and `completeRefundNoSweatAction`, if the insert loses a race, the action reads the stored completion again through `getPromoCompletions` (filtered by the session user) and returns its `profitExtracted`, formatted to 2dp with Decimal. If no completion is found, it returns `invalid`. `mark-promo-used.ts` ignores the new boolean, so its behaviour is unchanged. Tests:
- `markPromoDone` returns true on insert and false on conflict
- a settle that loses the race returns the stored 0.00, not its own 26.38
- a lost race with no stored row returns invalid
- a refund that loses the race returns the stored 9.37, not 14.37

### WR-06: Low-profile-blocked no-sweats are listed under "Not worth it right now"

**Files modified:** `src/components/promos/noSweatRowView.ts`, `src/components/promos/noSweatRowView.test.ts`, `src/components/opportunities/OpportunitiesScreen.tsx`
**Commit:** baccd72
**Applied fix:** Two new pure helpers, `groupNoSweatNotes` and `lowProfileBlockedHeading`. `NoSweatNotesSection` now shows three groups: "Can't price yet", "Not worth it right now" (only `not_worth_it`), and a new "Hidden by your Low-profile settings (N lines)" group, where N is the sum of `filteredOut`. The count is left off when it is 0. Tests cover the grouping and the heading wording (6 lines / 1 line / no count).

---

_Fixed: 2026-11-03T23:18:16Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
