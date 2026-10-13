---
phase: 06-profit-graph
verified: 2026-10-13T00:00:00Z
status: passed
score: 4/4 roadmap success criteria verified (6/6 requirements)
overrides_applied: 0
---

# Phase 6: Profit Graph Verification Report

**Phase Goal:** A member sees, at the top of the Opportunities page, how much profit was available at their books over time next to how much they personally extracted
**Status:** passed
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Graph at top with grey (available) and green (extracted) lines | VERIFIED | `OpportunitiesScreen.tsx:160` mounts `<ProfitGraph>` right after the header and above the stale banner and feed. `ProfitGraph.tsx` (223 lines) draws two `stepAfter` lines. `get-opportunities.ts:92` populates `profitSeries` through `loadProfitSeries`, using `requireUser()` and the member's own completions. |
| 2 | Range switch 7d / 30d / All | VERIFIED | `profitSeries.ts` exports `rangeStartDate`, `parseGraphRange` and `GRAPH_RANGE_LABELS`. Series tests pass. Owner confirmed on a phone that switching works and the selected chip is visible. |
| 3 | Hover/tap shows date and both totals to the cent | VERIFIED | Money math uses 2dp strings and Decimal. No float math was found in the component. Owner confirmed the touch tooltip on iPhone. |
| 4 | Phone fit; "nothing yet" for empty history | VERIFIED | Owner phone sign-off: 160px card, dark mode legible. The empty, not-ready and error states are covered by the component tests. |

**Score:** 4/4

## Required Artifacts

| Artifact | Status |
|----------|--------|
| `src/domain/promos/profitSeries.ts` | VERIFIED (pure math, tested) |
| `src/domain/promos/memberFeed.ts` | VERIFIED (shared singles and pair rule) |
| `src/domain/promos/memberObservationEntries.ts` | VERIFIED |
| `drizzle/0012_member_profit_observations.sql` | VERIFIED (applied to production per owner approval) |
| `src/db/memberObservations.ts` and `src/db/feedContext.ts` (`loadProfitSeries`) | VERIFIED, wired in `get-opportunities.ts:8,92` |
| `src/ingestion/odds/morningObserve.ts` (`recordAllMembersObservations`) | VERIFIED, called at line 103 |
| `src/components/opportunities/ProfitGraph.tsx` | VERIFIED (substantive, wired) |

## Key Links

| From | To | Status |
|------|----|--------|
| `OpportunitiesScreen` | `ProfitGraph` (`ok.profitSeries`, with skeleton and error states) | WIRED |
| `get-opportunities` action | `recordMemberProfitObservations`, then `loadProfitSeries` (record before build) | WIRED |
| Morning job | per-member recording with one pair rule | WIRED |

## Data-Flow Trace (Level 4)

`ProfitGraph` receives `series` from the `getOpportunities` response. That value comes from `loadProfitSeries`, which reads the `member_profit_observations` table filtered by the session user id, and from the member's completions. Production has a real first row (Ben, 2026-10-13, $2.56). Status: FLOWING.

## Behavioral Spot-Checks

`npx vitest run src/domain/promos src/components/opportunities` passed: 35 files, 614 tests. The orchestrator reported the full suite (1738 tests), typecheck and lint as clean.

## Probe Execution

None declared. Skipped.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| STATS-01 | SATISFIED | Graph card at the top of the Opportunities page |
| STATS-02 | SATISFIED | Grey line is built from best-per-promo, first-Denver-day observations in `member_profit_observations` |
| STATS-03 | SATISFIED | Green line is built from `profit_extracted` by Denver day of completion |
| STATS-04 | SATISFIED | Three range options, client-side switching |
| STATS-05 | SATISFIED | Tooltip with date and both totals; owner confirmed on a phone |
| STATS-06 | SATISFIED | Phone sign-off; empty state implemented |

All six IDs appear in REQUIREMENTS.md and are marked Complete and mapped to Phase 6. No orphaned requirements. STATS-07 to STATS-09 belong to Phase 7.

## Anti-Patterns

No TBD, FIXME or XXX markers in the key files. Review warnings WR-01 to WR-03 were fixed. WR-04 is by design (D-04).

## Notes (informational, not gaps)

- Nothing is pushed yet. Production on Vercel still runs the pre-Phase-6 code. Migration 0012 is already applied, and the old code does not touch the new table, so this is safe. Push to ship.
- The grey line starts on the graph start day (2026-10-13). History before that is intentionally absent (D-04).

## Human Verification Required

None outstanding. The owner completed the phone check on 2026-10-13 and signed off.

## Gaps Summary

No gaps. The phase goal is achieved.

_Verifier: Claude (gsd-verifier)_
