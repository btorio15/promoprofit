# Quick 260930-fge: Exclude Done promos from "Available today" Summary

The viewer's Done promos (both halves of a Done pair) no longer count toward `availableProfit.today`. Week and month are unchanged.

## Commits
- ea2117e: summarizeAvailableProfit takes a required `excludeFromToday` set, applied to the today bucket only (decimal.js retained); new tests.
- cc8bce0: loadAvailableProfit takes `doneIds`; getPromos passes its `doneIds`, getOpportunities passes `ctx.doneIds`; one action test each.

## Deviations
None. The plan was executed as written. The worktree was reset to bf376d4 at start.

## Verification
Full test suite passed (1381 tests) and lint was clean. Typecheck showed only the known `LayoutProps` artifact in src/app/layout.tsx. No DB queries were added, and there were no writes or migrations.

## Self-Check: PASSED
