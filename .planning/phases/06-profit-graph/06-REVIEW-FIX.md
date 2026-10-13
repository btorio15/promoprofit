---
phase: 06
fixed_at: 2026-10-13T00:00:00Z
review_path: .planning/phases/06-profit-graph/06-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 1
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Source review:** .planning/phases/06-profit-graph/06-REVIEW.md
**Iteration:** 1
**Scope (owner decision):** WR-01, WR-02, WR-03 only.

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped (out of scope / by design): WR-04, IN-01, IN-02, IN-03

Full suite 1738 tests pass, typecheck and lint are clean.

## Fixed Issues

### WR-01: Observation precision mismatch inflates recorded "best" profit

**Files modified:** `src/app/actions/get-opportunities.ts`, `src/app/actions/get-opportunities.test.ts`
**Commit:** 0becf25
**Applied fix:** When the member views "cents", `getOpportunities` loads a second "whole" feed context just for recording. Observations are therefore always recorded at "whole", matching the morning job. The feed the member sees keeps their chosen precision. New test asserts the entries recorded under "cents" equal those under "whole" (confirmed to fail without the fix).

### WR-02: Morning member pass counts failed writes as recorded

**Files modified:** `src/db/memberObservations.ts`, `src/ingestion/odds/morningObserve.ts`, `src/ingestion/odds/morningObserve.test.ts`, `src/db/memberObservations.test.ts`
**Commit:** c0ca243 (the `memberObservations.test.ts` assertions for the new boolean return landed in the WR-03 commit 488122d)
**Applied fix:** `recordMemberProfitObservations` still never throws, but now returns `true` on success or when there are no entries, and `false` on failure. `recordAllMembersObservations` counts `failed++` when it returns false. Tests cover both returns and the failed count.

### WR-03: `isUndefinedTableErrorFor` ignores the table name when the code matches

**Files modified:** `src/db/undefinedTable.ts`, `src/db/memberObservations.test.ts`
**Commit:** 488122d
**Applied fix:** A 42P01 error whose message names a different relation is no longer treated as "not ready". A bare 42P01 with no message is still accepted. A message naming the table matches as before. Tests cover a different table (direct and via the cause chain) and the matching table.

## Skipped Issues

### WR-04: Past extracted profit dropped from the "All time" headline

**File:** `src/domain/promos/profitSeries.ts:84-88`, `src/components/opportunities/ProfitGraph.tsx:105`
**Reason:** Skipped, by design (D-04). Completions before the graph start day are not drawn but still count in Total profit extracted. Revisit the labeling in the Phase 7 Dashboard.
**Original issue:** The graph headline and `totals.totalExtracted` can differ.

### IN-01: `aria-controls` references a missing id in not-ready/error states
**Reason:** Skipped, out of scope (owner limited this pass to WR-01..03).

### IN-02: Observations may be recorded from stale cached odds
**Reason:** Skipped, out of scope (owner limited this pass to WR-01..03).

### IN-03: Sequential per-member loop and a table scan for the start day
**Reason:** Skipped, out of scope (owner limited this pass to WR-01..03).

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


## Orchestrator follow-up

WR-01 fix (0becf25) originally re-loaded the whole feed context (promos + both odds caches) a second time for cents viewers. Precision only affects `rankOpts`, so the follow-up commit re-ranks the already-loaded context with `precision: "whole"` instead -- same recorded entries, no second DB round trip. The WR-01 test (cents entries equal whole entries) still passes.
