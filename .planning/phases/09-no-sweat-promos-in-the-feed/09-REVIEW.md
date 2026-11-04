---
phase: 09-no-sweat-promos-in-the-feed
reviewed: 2026-11-03T16:05:00Z
depth: standard
files_reviewed: 88
files_reviewed_list:
  - drizzle/0018_small_wrecking_crew.sql
  - scripts/audit-no-sweat.ts
  - scripts/recon-no-sweat.ts
  - src/app/actions/classify-promo.ts
  - src/app/actions/delete-promo.ts
  - src/app/actions/edit-promo.ts
  - src/app/actions/expire-promo.ts
  - src/app/actions/get-add-promo-options.ts
  - src/app/actions/get-opportunities.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/refresh-promos.ts
  - src/app/actions/set-low-profile.ts
  - src/app/actions/set-promo-cap.ts
  - src/app/actions/track-no-sweat.ts
  - src/app/settings/page.tsx
  - src/components/NoSweatRiskAdvisory.tsx
  - src/components/opportunities/OpportunitiesScreen.tsx
  - src/components/opportunities/TrackedNoSweatCard.tsx
  - src/components/opportunities/TrackingStrip.tsx
  - src/components/opportunities/trackedCardView.ts
  - src/components/promos/AddPromoForm.tsx
  - src/components/promos/ClassifyQueueCard.tsx
  - src/components/promos/DonePromoRow.tsx
  - src/components/promos/NoSweatCorrectionFields.tsx
  - src/components/promos/NoSweatDetails.tsx
  - src/components/promos/NoSweatFields.tsx
  - src/components/promos/NoSweatNoteRow.tsx
  - src/components/promos/NoSweatNoticesPopover.tsx
  - src/components/promos/NoSweatRow.tsx
  - src/components/promos/TrackButton.tsx
  - src/components/promos/noSweatRowView.ts
  - src/components/promos/noSweatWaterfall.ts
  - src/components/settings/SettingsLowProfileForm.tsx
  - src/db/addedPromoPipeline.ts
  - src/db/addedPromos.ts
  - src/db/lowProfile.ts
  - src/db/noSweatFeed.ts
  - src/db/noSweatGuard.ts
  - src/db/profitHistory.ts
  - src/db/promoReview.ts
  - src/db/promoTracking.ts
  - src/db/promos.ts
  - src/db/schema.ts
  - src/db/trackedNoSweats.ts
  - src/domain/hedge/conversionRate.ts
  - src/domain/hedge/noSweat.ts
  - src/domain/opportunities/types.ts
  - src/domain/promos/addPromoDraft.ts
  - src/domain/promos/addedPromoInput.ts
  - src/domain/promos/altSpreads.ts
  - src/domain/promos/buildAddedPromo.ts
  - src/domain/promos/buildTrackedSnapshot.ts
  - src/domain/promos/describe.ts
  - src/domain/promos/doneSnapshot.ts
  - src/domain/promos/dto.ts
  - src/domain/promos/duplicateHint.ts
  - src/domain/promos/lowProfile.ts
  - src/domain/promos/noSweatRowDto.ts
  - src/domain/promos/noSweatSettle.ts
  - src/domain/promos/noSweatSnapshot.ts
  - src/domain/promos/pairPromos.ts
  - src/domain/promos/pairRowDto.ts
  - src/domain/promos/pairSnapshot.ts
  - src/domain/promos/promoRefreshScope.ts
  - src/domain/promos/promoRowDto.ts
  - src/domain/promos/promoTypeLabel.ts
  - src/domain/promos/rankNoSweat.ts
  - src/domain/promos/rankNoSweatFeed.ts
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/reviewInput.ts
  - src/domain/promos/scraped.ts
  - src/domain/promos/selection.ts
  - src/domain/promos/trackedCardDto.ts
  - src/domain/promos/types.ts
  - src/domain/stats/dailyHistory.ts
  - src/ingestion/promos/books/ballybet.ts
  - src/ingestion/promos/books/draftkings.ts
  - src/ingestion/promos/books/fanduel.ts
  - src/ingestion/promos/exclusions.ts
  - src/ingestion/promos/noSweat.ts
  - src/ingestion/promos/noSweatAudit.ts
  - src/ingestion/promos/promoReading.ts
  - src/ingestion/promos/readerPass.ts
  - src/ingestion/promos/reconcile.ts
  - src/ingestion/promos/reviewTriage.ts
  - src/ingestion/promos/run.ts
  - src/ingestion/promos/signupOffers.ts
  - src/lib/sortPreference.ts
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-11-03T16:05:00Z
**Depth:** standard
**Files Reviewed:** 88
**Status:** issues_found

## Summary

I reviewed the no-sweat lifecycle: the scraper and reader detection, the feed ranker and solver, the Track/settle/refund/correct server actions, the tracked_no_sweats and low-profile DB modules, the migration, and the UI that calls them. The server actions are sound. Each one calls `requireUser()` first, uses strict schemas with no member id, filters every DB statement by the session user, and does all money math with Decimal. The settle formulas (won = winnings − hedge stake; lost = hedge payout − hedge stake − qualifying stake + refund profit; push/void = 0) match the solver's `winNet`/`loseNet`.

The main problems are in scraper parsing. The new refund-cap parser misreads common promo wording. These values go straight into the stake the app recommends and the refund value it assumes. When the promo reader doesn't run, or doesn't disagree, a scraped no-sweat goes live with a wrong cap. I confirmed this by running `parseNoSweatRefundCap` on sample strings. There are also some robustness gaps in the backfill script, the review-draft defaults and how feed errors are handled.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Refund-cap parser drops thousands separators and takes the wrong dollar amount

**File:** `src/ingestion/promos/noSweat.ts:27-42`
**Issue:** `CAP_PATTERNS` captures `\$(\d+(?:\.\d{1,2})?)` and tries the patterns in list order, not in the order they appear in the text. I checked two cases:
- `"No Sweat up to $1,000 in Bonus Bets"` returns `"1.00"` because the comma ends the capture.
- `"Bet up to $500 on any NFL game. If your bet loses, get a $25 bonus bet."` returns `"500.00"`. The generic `up to \$` pattern runs before `\$N bonus bet`, so it grabs the wager limit instead of the refund.

`rankNoSweat` uses `stake = promo.refundCap` (D-09) and values the refund at `conversionRateFor(refundCap)`. In the second case the app tells the member to place a $500 qualifying bet and hedge it as if a $500 bonus bet comes back. The book only refunds $25. If the qualifying bet loses, the member is down hundreds of dollars against a "positive estimate". The DraftKings, FanDuel and Bally parsers all call this function. The reader cross-check (`moneyDiffers` in reconcile.ts) only catches it when the reader runs and returns a different non-null amount. With no reader, a null reader amount, or a reader that agrees, the promo goes live. The backfill planner (`noSweatAudit.ts:69`) uses the same parser. `reviewTriage.ts`'s `DOLLAR_BONUS_BET_RE` already handles commas, so the two parsers disagree.
**Fix:**
```ts
const AMOUNT = String.raw`\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const CAP_PATTERNS: RegExp[] = [
  new RegExp(String.raw`max(?:imum)? (?:reward|refund):?\s*` + AMOUNT, "i"),
  new RegExp(AMOUNT + String.raw`\s+(?:in\s+)?(?:bonus bets?|no[- ]sweat|refund|free bets?)`, "i"),
  new RegExp(String.raw`(?:refund|back|bonus bet)[^.\n]{0,40}up to\s*` + AMOUNT, "i"),
];
// strip commas before new Decimal(...)
```
Don't use a bare `up to $N` pattern that isn't tied to refund wording. When there are several different dollar amounts and none is clearly the refund, return null so the promo goes to review.

## Warnings

### WR-01: Cash-refund detection fails when the fine print mentions bonus bets anywhere

**File:** `src/ingestion/promos/noSweat.ts:61`
**Issue:** `CASH_REFUND_RE.test(combined) && !BONUS_REFUND_RE.test(combined)` treats any mention of "bonus bet" as proof the refund is a bonus bet. `"If your bet loses, get your stake back in cash. Not valid with bonus bets."` comes back as `bonus_bet_refund`. D-17 says cash refunds must never be priced. This one would be priced as a bonus-bet conversion.
**Fix:** Look for the refund form next to the refund phrase, e.g. `/(?:refund(?:ed)?|back)\s+(?:in|as)\s+(cash|bonus bets?|...)/i`. Return `cash_refund` or `bonus_bet_refund` from that match. If both forms appear without a clear match, return an `unknown` form that goes to review.

### WR-02: No-sweat review drafts default to "bonus_bet" or "profit_boost" when the reader doesn't run

**File:** `src/ingestion/promos/reviewTriage.ts:153-171`, `src/ingestion/promos/run.ts:140-141`, `src/db/promoReview.ts:285-287`
**Issue:** Without a reader, a parser `no_sweat_cash` or `unrecognized` no-sweat skip (Bally "Second Chance Bet", FanDuel with no readable cap) goes through `buildClassifyDraft` with `partial: null`. `chooseDraftPromoType` then picks `bonus_bet` whenever `"$N bonus bet"` appears, which it does in most no-sweat copy, and `profit_boost` otherwise. It never picks `no_sweat`. `cashRefund` only checks the reader's summary line or `reviewReadings`, so the cash note is missing too. The classify card then offers a no-sweat pre-filled as a guaranteed bonus bet with the refund cap as its amount. One accept puts a stake-back promo into the guaranteed pipeline (A-01, FEED-02).
**Fix:** Carry the skip reason into the draft. When `skip.reason === "no_sweat_cash"` or `classifyNoSweat(...)` is not `none`, set `promoType: "no_sweat"` and `bonusAmount: parseNoSweatRefundCap(...)`. Set `cashRefund` from `skip.reason`, or persist it as a column, instead of matching rawText.

### WR-03: The backfill can crash halfway through on the unique dedupe_key

**File:** `src/ingestion/promos/noSweatAudit.ts:46,90-94`, `scripts/audit-no-sweat.ts:65-86`
**Issue:** `liveKeys` only holds keys from `active` and `pending_review` rows, and it isn't updated after a planned retype. `promos.dedupe_key` is `UNIQUE` across every status (schema.ts:210). A retype fails if (a) an expired or dismissed row already holds the new key, or (b) two live rows map to the same new key, because both get planned as `retype`. The `--apply` loop runs one UPDATE at a time with no transaction (neon-http), so a unique violation leaves the backfill half-applied.
**Fix:** Pass in every row's dedupe key, not just live rows. Add each planned `newDedupeKey` to the set as you go, so a later collision becomes `expire_duplicate`. In the script, catch a unique violation per row and report it.

### WR-04: One bad tracked row hides every Tracking card without telling the member

**File:** `src/app/actions/get-opportunities.ts:105-110`, `src/domain/promos/trackedCardDto.ts:77-79`
**Issue:** `loadNoSweatFeed` builds all tracked cards before it ranks anything. `buildTrackedCardDTO` calls `americanToDecimal` / `floorCents` outside its try block (line 79). The snapshot schema allows any integer for `qualifying.oddsAmerican` / `hedge.oddsAmerican` (noSweatSnapshot.ts:59,66), so a bad stored value throws a RangeError. The same applies to any throw in the ranker. `getOpportunities` catches it, logs it, and returns `tracking: []`, so every bet the member has open disappears from the screen with no message. These are real bets with money on them.
**Fix:** Wrap each `buildTrackedCardDTO` call in its own try/catch and drop only the failing card, with a warning. Load tracking separately from ranking, so a ranker error can't hide the Tracking strip. Also apply the `americanOdds` range refine to the snapshot's odds fields.

### WR-05: Settle and refund return a profit that may not be what was saved

**File:** `src/app/actions/track-no-sweat.ts:252-255,309-312`, `src/db/promoTracking.ts:56-69`
**Issue:** `markPromoDone` uses `ON CONFLICT DO NOTHING` and returns void. If two settle or refund requests race (double tap, two tabs), both get past `hasCompletion`. Only the first insert is kept, but both return `ok` with their own computed `profitExtracted`. For refunds the two requests can pick different `optionKey`s, so the "Recorded +$X" toast can show a figure that isn't the one stored.
**Fix:** Have `markPromoDone` return whether it inserted, using `.returning()`. On a conflict, re-read the stored completion and return its `profitExtracted`, or return `invalid`.

### WR-06: Low-profile-blocked no-sweats are listed under "Not worth it right now"

**File:** `src/components/opportunities/OpportunitiesScreen.tsx` (NoSweatNotesSection: `notWorth = notes.filter((n) => n.note !== "cant_price")`)
**Issue:** `low_profile_blocked` notes are grouped with `not_worth_it` under that heading. A promo that may be profitable but was filtered out by the member's own Low-profile settings is shown as unprofitable. The member won't know to relax a setting.
**Fix:** Give `low_profile_blocked` its own heading, e.g. "Hidden by your Low-profile settings (N lines)", using `filteredOut`.

## Info

### IN-01: Money validation uses native floats

**File:** `src/domain/promos/noSweatSnapshot.ts:15-18`, `src/domain/promos/scraped.ts:336`
**Issue:** `Number(v) > 0 && Number(v) <= MAX_STAKE` and `Number(promo.bonusAmount) <= 0` do money comparisons in floating point. CLAUDE.md says Decimal only. It's harmless at these bounds but goes against the convention.
**Fix:** Use `new Decimal(v).gt(0) && new Decimal(v).lte(10000)`.

### IN-02: The same constants are defined in several files

**File:** `src/app/actions/track-no-sweat.ts:43-46`, `src/domain/promos/noSweatSettle.ts:20-21`, `src/domain/promos/trackedCardDto.ts:20`
**Issue:** `MAX_ABS_OVERRIDE`, the 2dp money regex and `REFUND_OPTION_LIMIT = 3` are each defined in two or three places. If the action's refund limit and the card's limit drift apart, the card can show an option that the server always rejects as `odds_changed`.
**Fix:** Export them once from `noSweatSettle.ts` / `noSweatSnapshot.ts` and import them everywhere else.

### IN-03: `mapOwnPromoToEditValues` throws on an unknown stored promo_type

**File:** `src/db/addedPromos.ts:166`
**Issue:** `assertNever(row.promoType as never)` runs on a plain DB string. Any unexpected value throws a generic Error and crashes the edit form. The previous code degraded gracefully.
**Fix:** Return null (not found) for unknown types instead of throwing.

### IN-04: The "too early" settle response shows a generic error

**File:** `src/components/opportunities/TrackedNoSweatCard.tsx` (`settle` handler)
**Issue:** `status: "too_early"` becomes "Couldn't save that result. Try again." This can happen when the client clock or render time is off from the server's kickoff check.
**Fix:** Map `too_early` to a message like "This game hasn't started yet."

### IN-05: A correction is saved even when nothing was changed

**File:** `src/components/opportunities/TrackedNoSweatCard.tsx` (`settle`, `recalc`)
**Issue:** If the member presses "Recalculate profit" without editing anything, `correction` is still sent. The result is stored with `profitSource: "corrected"` even though the amounts are the original ones.
**Fix:** Skip `correction` when it equals the snapshot's stakes and odds.

### IN-06: The snapshot records the member's precision, not the precision used for pricing

**File:** `src/domain/promos/buildTrackedSnapshot.ts:31`, `src/domain/promos/rankNoSweat.ts:261`
**Issue:** With `naturalStakes` on, the solver prices at `"whole"`, but `snapshot.precision` stores the member's view setting (possibly `"cents"`). The Done tab's `recordedPrecision` is then wrong for that row.
**Fix:** Store `lowProfile.naturalStakes ? "whole" : precision`.

---

_Reviewed: 2026-11-03T16:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
