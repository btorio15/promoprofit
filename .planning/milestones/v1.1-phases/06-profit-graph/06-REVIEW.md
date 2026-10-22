---
phase: 06-profit-graph
reviewed: 2026-10-13T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - drizzle/0012_member_profit_observations.sql
  - package.json
  - scripts/morning-odds-observe.ts
  - src/app/actions/get-opportunities.ts
  - src/components/opportunities/OpportunitiesScreen.tsx
  - src/components/opportunities/ProfitGraph.tsx
  - src/components/opportunities/profitGraphView.ts
  - src/db/feedContext.ts
  - src/db/memberObservations.ts
  - src/db/queries.ts
  - src/db/schema.ts
  - src/db/undefinedTable.ts
  - src/domain/opportunities/types.ts
  - src/domain/promos/profitSeries.ts
  - src/domain/promos/profitTotals.ts
  - src/domain/promos/memberFeed.ts
  - src/domain/promos/memberObservationEntries.ts
  - src/ingestion/odds/morningObserve.ts
  - src/lib/persistentState.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Depth:** standard
**Status:** issues_found

## Summary

Project priorities checked:
- **Money math:** all displayed money stays decimal.js strings. The only `Number()` use is `availableY`/`extractedY` in `profitGraphView.ts`, which is plot-only.
- **Member isolation:** every per-member read and write takes the session user id (`requireUser()`) or the `users` table id in the morning job. The only table-wide read is `min(denver_date)`, which exposes a date and nothing per member.
- **Odds API credits:** the new code paths read cached odds only. The one credit-spending call, `runOddsRefresh`, was already part of the morning job.
- **Upsert correctness:** the SQL upsert is safe from the "cannot affect row twice" error because `emitted` dedupes by promoId and the denverDate is the same for every row.

No blockers found. The warnings below are data-quality and robustness issues.

## Warnings

### WR-01: Observation precision mismatch inflates recorded "best" profit

**File:** `src/app/actions/get-opportunities.ts:52,68-77` (and `src/ingestion/odds/morningObserve.ts:56`)
**Issue:**
- The page load records observations using the client-chosen `precision` ("whole" or "cents").
- The morning job always uses "whole".
- The upsert keeps `greatest(profit)` per promo-day.
- Cents-precision stakes yield equal or higher guaranteed profit than whole-dollar stakes, but those stakes are not what a whole-dollar user would place.
- A member who toggles to "cents" once permanently raises that day's recorded "available" above what their normal precision shows. The graph's "available" line then disagrees with the feed total.

**Fix:** Record observations at one fixed precision. For example, use "whole" in `getOpportunities` when recording, or skip recording when `precision !== "whole"`. Alternatively, load a second "whole" context just for recording.

### WR-02: Morning member pass counts failed writes as recorded

**File:** `src/db/memberObservations.ts:57-59`, `src/ingestion/odds/morningObserve.ts:69-70`
**Issue:**
- `recordMemberProfitObservations` swallows every error and returns void.
- `recordAllMembersObservations` then does `recorded++`, so DB failures are reported as successes and `failed` stays 0.
- This includes the case where migration 0012 is missing, so the CI log shows `recorded: N` while nothing was written.
- Nothing flags a silent loss of the day's history.

**Fix:** Have the function return a boolean or `{ok}`, or take a `throwOnError` option for the job. Count `failed++` when it reports failure.

### WR-03: `isUndefinedTableErrorFor` ignores the table name when the code matches

**File:** `src/db/undefinedTable.ts:17`
**Issue:**
- `e.code === "42P01"` returns true for any missing relation, not just `tableName`.
- A missing `promo_completions` or `users` table inside `getMemberProfitHistory` would be reported as "migration 0012 not applied" and show "not-ready" instead of an error.
- This is currently unlikely, but it makes the helper's name wrong.

**Fix:** Check the code and then also match the message, or require the message match when the table name is known.
```ts
if (e.code === UNDEFINED_TABLE && (typeof e.message !== "string" || messageRe.test(e.message))) return true;
```

### WR-04: Past extracted profit is dropped from the "All time" headline

**File:** `src/domain/promos/profitSeries.ts:84-88`, `src/components/opportunities/ProfitGraph.tsx:105`
**Issue:**
- Completions with `day < graphStartDay` are silently excluded.
- The graph start is the table-wide earliest observation, i.e. release day.
- "All time: Extracted $X" will be lower than the separate `totals.totalExtracted` (sum of every completion) shown elsewhere on the same screen if the member completed promos before release.
- Two different "extracted" numbers on one screen is a trust problem for an app whose core value is exactness.

**Fix:** Either fold pre-start completions into the first day, or label the graph headline as "since <graphStartDay>".

## Info

### IN-01: `aria-controls` references a missing id in not-ready/error states

**File:** `src/components/opportunities/ProfitGraph.tsx:73-79,86-97`
**Issue:** `hideButton` sets `aria-controls={chartId}`, but the not-ready and error branches render no element with that id.
**Fix:** Add `id={chartId}` to the wrapper in those branches, or omit `aria-controls` there.

### IN-02: Observations may be recorded from stale cached odds

**File:** `src/ingestion/odds/morningObserve.ts:57`, `src/app/actions/get-opportunities.ts:63`
**Issue:** The only guard is that odds exist (`fetchedAt !== null`). Days-old odds still produce a "today" observation, and a blocked refresh would credit today with yesterday's number.
**Fix:** Consider skipping recording when `oddsFetchedAt` is older than a threshold (reuse `STALE_AFTER_MINUTES`).

### IN-03: Sequential per-member loop and a table scan for the start day

**File:** `src/ingestion/odds/morningObserve.ts:54-75`, `src/db/memberObservations.ts:75`
**Issue:**
- Each member re-fetches the shared cached odds and runs a full `min(denver_date)` aggregate on every page load.
- Both are fine at current scale.
- This is out of v1 scope (performance) and noted only for completeness.

**Fix:** None required.

---

_Reviewed: 2026-10-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
