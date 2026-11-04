---
phase: 09-no-sweat-promos-in-the-feed
plan: 18
status: complete
requirements: [FEED-01, FEED-02, FEED-03, FEED-04, FEED-05]
---

# Phase 9 Plan 18: Wire the Opportunities screen

Status: complete. Task 1 done and committed (1cdbd9a). Task 2 run by the orchestrator from the main checkout on 2026-11-03 and approved by the owner.

## Task 1
- TrackingStrip rendered under the Opportunities heading / stale line, above SortSwitch.
- Promos source renders NoSweatRow vs PromoRow via isNoSweatRow (temporary skip from 09-12 removed).
- "Can't price yet" section last (with sub-copy) plus "Not worth it right now" sub-heading; unsliced, never through pickTop.
- Edit host for hand-added no-sweats: AddPromoForm in edit mode hosted in OpportunitiesScreen, wired to NoSweatRow/NoSweatNoteRow addedActions (only when addedByYou).
- sortCaption(sort, hasEstimate): "Top 5 by Est. ROI" when an estimate is visible; no new sort option. OpportunitySection and SortSwitch needed no changes.

## Verification
Full suite: 162 files, 2328 tests pass. Lint: 0 errors (4 pre-existing warnings). Typecheck: only the known worktree LayoutProps artifact.

## Task 2 (owner checkpoint, 2026-11-03)
- **Audit dry run:** the first attempt failed on a transient Neon connection error; the re-run checked 6 live promos and found 0 needing attention (the DK "NFL London No Sweat" row is no longer live). Nothing to apply, so `--apply` was not run.
- **Live test data:** no book had a live no-sweat, so with the owner's OK BetMGM was added to the owner's books and promo #144 (BetMGM no-sweat up to $1,500, any game, expires 2026-11-10) was added through the same pipeline as Add promo.
- **Owner check:** the owner checked it in the browser and asked for a less text-heavy row. Sketch 001 (waterfall bars + one (i) notice popover) was approved and built as quick task 261103-lx2, and at the owner's request the worst-case figure was then removed from the row. The owner approved the phase.
- **Re-scoped:** the owner asked for a separate "Best intro offers" section on Opportunities, with intro offers kept out of promo sorting and the profit graph. It was folded into Phase 10, not this phase.
- **FEED-01 per book:** DraftKings is verified against a reconstructed fixture (09-10). FanDuel is "fixture pending" (synthetic labelled tests, 09-11). Bally Bet is built from the live "Second Chance Bet" detail fixture; it has no dollar cap, so it routes to review (09-11).
- **Checks:** full suite 163 files / 2335 tests pass, typecheck clean, lint 0 errors.

## Deviations
None.
