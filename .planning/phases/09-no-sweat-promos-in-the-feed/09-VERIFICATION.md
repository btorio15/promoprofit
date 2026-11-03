---
phase: 09-no-sweat-promos-in-the-feed
verified: 2026-11-03T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 9: No-Sweat Promos in the Feed Verification Report

**Goal:** Existing-customer no-sweat promos at DraftKings, FanDuel and Bally Bet show up in the Opportunities feed as clearly labelled estimates, without inflating guaranteed numbers.
**Status:** passed. Re-verification: No.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scraped DK/FD/Bally no-sweats appear as no-sweat promos; new-customer ones go to Sign-up offers | VERIFIED | The scrapers draftkings.ts, fanduel.ts and ballybet.ts contain no_sweat paths, with noSweat.ts, exclusions.ts and their tests. Caveats below. |
| 2 | No-sweat is never shown as a bonus bet (2026-10-08 regression); parser/reader disagreement goes to review | VERIFIED | reconcile.ts line ~297 routes a no-sweat vs anything-else disagreement to review. Regression coverage is in reconcile.test.ts, exclusions.test.ts, noSweat.test.ts and the fanduel.test.ts 2026-10-08 case. |
| 3 | No-sweats are ranked in the feed, marked "est." with the conversion rate | VERIFIED | NoSweatRow.tsx renders the "est." badge and the Est. ROI caption. 09-12 and 09-18 wire it into OpportunitiesScreen (rankNoSweatFeed, noSweatRowDto). The row was redesigned as waterfall bars plus an (i) popover, and the worst-case figure was removed (quick task 261103-lx2, owner-approved). |
| 4 | Dashboard totals, profit graph grey line and Statistics are unchanged (guaranteed-only) | VERIFIED | promos.ts excludes no_sweat in SQL (`ne(promos.promoType, "no_sweat")`, lines 451-453). profitHistory.ts lines 34 and 65 exclude no_sweat. The guaranteed-only type guard is in noSweatGuard.ts. Tests pass. |
| 5 | Marking a no-sweat done records the member's actual profit, not the estimate | VERIFIED | The track-no-sweat.ts action takes overrideProfit and settleProfit. It uses tracked_no_sweats, doneSnapshot and noSweatSettle, with tests in trackedNoSweats.test.ts. |

**Score:** 5/5

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| FEED-01 | SATISFIED (see caveat) | Parser and reader have a no_sweat kind. DK, FD and Bally paths exist. New-customer ones route to Sign-up offers. |
| FEED-02 | SATISFIED | Reconcile disagreement routes to review. Regression tests exist. Audit and re-check scripts exist. |
| FEED-03 | SATISFIED | Inline ranked rows with "est." and the rate. |
| FEED-04 | SATISFIED | SQL exclusions in promos.ts and profitHistory.ts. |
| FEED-05 | SATISFIED | Settle with a member-entered or confirmed profit. |

All five IDs are claimed in the plans and mapped to Phase 9 in REQUIREMENTS.md. There are no orphans. REQUIREMENTS.md still shows them as "Pending" and unchecked, so update that bookkeeping. The 09-18 checkbox in ROADMAP.md is also unchecked even though the plan is complete.

## Behavioral Spot-Checks

| Check | Result |
|-------|--------|
| Full test suite | 163 files, 2335 tests pass |
| Typecheck / lint | Clean / 0 errors (reported by the orchestrator, not re-run) |
| TBD/FIXME/XXX in no-sweat source | None found |

## Notes (non-blocking)

- FEED-01 per book. DraftKings is verified against a reconstructed fixture. FanDuel is covered only by synthetic labelled tests ("fixture pending"). Bally Bet has no dollar cap, so it routes to review. The owner accepted this at UAT. The live end-to-end scrape-to-feed path for FanDuel and Bally is not proven against live data. Treat this as a known limitation, not a gap.
- The owner approved the phone/laptop UAT on 2026-11-03. The post-UAT redesign (261103-lx2) and the "Best intro offers" section (moved to Phase 10, INTRO-08..10) are approved changes, not gaps.
- No human verification items remain.

_Verifier: Claude (gsd-verifier)_
