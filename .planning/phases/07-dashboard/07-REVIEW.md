---
phase: 07-dashboard
reviewed: 2026-10-17T20:59:46Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/app/actions/get-opportunities.ts
  - src/components/opportunities/DashboardTotals.tsx
  - src/components/opportunities/dashboardTotalsView.ts
  - src/components/opportunities/OpportunitiesScreen.tsx
  - src/components/opportunities/ProfitGraph.tsx
  - src/components/opportunities/profitGraphView.ts
  - src/domain/opportunities/types.ts
  - src/domain/promos/dashboardTotals.ts
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-10-17T20:59:46Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 7 source changes (daf8217..HEAD): the new totals domain module, its view model and card, the `getOpportunities` response change, the screen layout, and the graph "since" label. I also checked the code they call: `feedContext.loadMemberFeedContext` / `loadProfitSeries`, `doneSnapshot.toDoneRows` / `toDonePromoDTO`, `pairSnapshot.isPairMemberSnapshot`, `profitSeries.buildDailyGains` / `rangeStartDate`, `profitTotals.periodStartDates` / `denverDate`, and `promoTracking.markPairDone`.

What checks out:
- `requireUser()` is still the first statement in `getOpportunities`.
- No Odds API client is imported, so the change adds no Odds API spending.
- All money math uses decimal.js and is formatted to 2dp strings. Denver-day windows reuse `periodStartDates` (today-6 / today-29).
- Pair marker rows (`kind: "pair_member"`, stored at the default 0.00) are dropped by `toDoneRows` before `promosDone` is counted. They stay in the raw `completions` sum, which is harmless because they add $0.00.
- The average uses ROUND_HALF_UP. For the owner's data it gives 33.09 / 10 = 3.31.
- The 75 targeted tests pass. The only `tsc` error is a stale `.next/dev/types` artifact, not a problem in the source.

There are no correctness blockers. The main problem is labeling. On the default graph range (30d), the graph headline is clipped at the graph start day but carries no "since" label. The totals card above it shows a different, unclipped "Last 30 days" extracted figure. D-06/D-04 exist to prevent exactly this kind of unexplained mismatch.

## Warnings

### WR-01: Graph headline only says "since Oct 13" on the All range, but the default 30d (and 7d) headline is also clipped at the graph start day

**File:** `src/components/opportunities/profitGraphView.ts:106` (with `src/domain/promos/profitSeries.ts:105-108, 86, 156`)
**Issue:** `sinceLabel` is set only when `range === "all"`. However:
- `rangeStartDate` clamps every range to `graphStartDay`.
- `buildDailyGains` drops completions dated before `graphStartDay` (line 86).
- The graph's default range is `"30d"` (`parseGraphRange`).

As a result, on first load the graph headline reads "Extracted $X of $Y available" with no time basis. Directly above it, the totals card's "Last 30 days" cell shows the extracted figure from raw completions, which per D-18 includes completions before Oct 13. Today (Oct 17), any completion between Sep 18 and Oct 12 makes the two 30-day extracted numbers on the same screen disagree, with no label explaining why. D-06 says the graph card's headline should be "framed as 'since Oct 13' so it does not contradict the all-time totals above". The current code does that for only one of the three ranges.
**Fix:** Show the suffix whenever the range window was clipped to the graph start day, not only for "all":
```ts
const rawStart = range === "7d" ? addDays(series.today, -6) : range === "30d" ? addDays(series.today, -29) : series.graphStartDay;
const sinceLabel = rawStart <= series.graphStartDay ? "since " + formatTickDate(series.graphStartDay) : null;
```
Add a test for `buildGraphView(series, "30d")` with `graphStartDay` inside the 30-day window that expects `sinceLabel === "since Oct 13"`.

### WR-02: The graph headline's `aria-label` overrides the visible "since Oct 13" suffix, so screen readers never hear it

**File:** `src/components/opportunities/ProfitGraph.tsx:104-111`, `src/components/opportunities/profitGraphView.ts:68-70`
**Issue:** The `<p aria-label={view.ariaLabel}>` replaces the element's accessible name with `ariaFor(...)`, which ends in `GRAPH_RANGE_LABELS[range]` ("All time"). The new `sinceLabel` span inside the `<p>` is never announced. A screen-reader user hears "Extracted $X of $Y available, All time", which is the very all-time framing D-04/D-06 say is misleading here. The totals card right above it says "Extracted all-time" with a different, larger number.
**Fix:** Include the since-label in the accessible name, for example by passing `sinceLabel` into `ariaFor` (`..., since Oct 13`), or by removing `aria-label` from the `<p>` so its visible text is read.

## Info

### IN-01: Stale comment on `recordCurrentProfitObservations`

**File:** `src/app/actions/get-opportunities.ts:56`
**Issue:** "keeps the landing screen's period figures fresh" is no longer true. The landing screen stopped reading group observations (`loadAvailableProfit`) in this phase. The write is still needed by other readers (`profitHistory`, `morningObserve`), but the comment gives the wrong reason.
**Fix:** Change the comment to name the actual consumers (the Statistics tab / group history).

### IN-02: Leftover summary fields that nothing reads

**File:** `src/db/feedContext.ts:136,155`, `src/app/actions/get-promos.ts:126,144`
**Issue:** `ctx.totalExtracted` is no longer used by `getOpportunities`. `getPromos` still computes `totalExtracted` and runs an extra DB query (`loadAvailableProfit`) for `availableProfit`. No component reads either value now that `ProfitSummary` is deleted (grepping `src/components` finds no consumers). CONTEXT lists removing these at Claude's discretion.
**Fix:** Remove `availableProfit`/`totalExtracted` from the Promos response and `totalExtracted` from the feed context, or record why they are kept.

### IN-03: Redundant rendering and an ignored `aria-label` in the best-promo span

**File:** `src/components/opportunities/DashboardTotals.tsx:77-83`
**Issue:** `{label}{fullName.slice(label.length)}` always equals `fullName`, so it is just indirection. `aria-label` on a plain `<span>` (generic role) is not allowed by ARIA and most screen readers ignore it. It is also unnecessary, because `truncate` hides overflow only visually and the full text is already in the DOM.
**Fix:** Render `{counts.best.fullName}` and drop the `aria-label` (keep `title` for the hover tooltip).

### IN-04: Totals card disappears when the load fails

**File:** `src/components/opportunities/DashboardTotals.tsx:41`, `src/components/opportunities/OpportunitiesScreen.tsx:160`
**Issue:** When `getOpportunities` throws or returns `invalid`, `dashboard` is `null` and the card renders nothing, while the graph card shows its error state. D-07 says the totals card is "always visible". The layout also shifts when the card drops out.
**Fix:** Render a small "Couldn't load your totals" state in the card when not loading and `dashboard === null`.

### IN-05: The "error" series status is shown as "Not ready yet"

**File:** `src/components/opportunities/dashboardTotalsView.ts:44`, `src/domain/promos/dashboardTotals.ts:23,57`
**Issue:** `available` is `null` for both `not-ready` and `error`, so a DB failure in `loadProfitSeries` is shown as "Available: Not ready yet". The graph card next to it shows an error message for the same condition, so the two cards disagree.
**Fix:** Carry the series status through (e.g. `available: {...} | { status: "not-ready" | "error" }`) and use the graph's error wording for `error`.

### IN-06: All-time extracted includes future-dated completions that the windows exclude

**File:** `src/domain/promos/dashboardTotals.ts:49-53`
**Issue:** `exAll` adds every completion, but `ex7`/`ex30` skip `day > today`. The graph (`buildDailyGains`) also drops `day > today`. A clock-skewed `completed_at` would therefore count in "Extracted all-time" and the average but nowhere else. Real-world risk is very low because `completed_at` is set server-side to `now`.
**Fix:** Apply the same `day <= today` guard to `exAll`, or document that all-time intentionally ignores it.

---

_Reviewed: 2026-10-17T20:59:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
