---
phase: 09-no-sweat-promos-in-the-feed
plan: 16
subsystem: ui
tags: [ui, tracking-strip, settle, done-list]
requires: ["09-12", "09-14", "09-15"]
provides:
  - TrackingStrip, TrackedNoSweatCard, trackedCardView helpers, no-sweat Done row
affects: [09-18]
key-files:
  created:
    - src/components/opportunities/trackedCardView.ts
    - src/components/opportunities/trackedCardView.test.ts
    - src/components/opportunities/TrackedNoSweatCard.tsx
    - src/components/opportunities/TrackingStrip.tsx
    - src/components/promos/NoSweatCorrectionFields.tsx
  modified:
    - src/components/promos/DonePromoRow.tsx
requirements-completed: [FEED-05]
duration: ~20min
completed: 2026-11-03
---

# Phase 9 Plan 16: Tracking strip and tracked no-sweat card Summary

Tracking strip with a full-lifecycle no-sweat card (status, outcome buttons, correction panel, refund conversion, undo/stop) and a no-sweat Done row with Fix amounts.

## Commits
- 02a69e7: pure view helpers + tests (15 passing)
- e4a7dca: TrackingStrip, TrackedNoSweatCard, NoSweatCorrectionFields, DonePromoRow variant

## Notes
- Outcome buttons are shown only when the server `pastKickoff` flag is true; each button has its own transition and inline error.
- Correction flow: "Recalculate profit" applies the member's amounts (shown as "Using the amounts you entered."), and the next outcome button sends them (and the optional actual-profit override for push/void only). Preview is display-only; server recomputes.
- Done-row "Fix amounts" inputs start blank because DoneNoSweatDTO exposes only text summaries, not raw stake/odds values.
- Not wired into OpportunitiesScreen (plan 09-18).

## Deviations from Plan
- [Rule 3] Added shared `src/components/promos/NoSweatCorrectionFields.tsx` so the card and Done row reuse the same inputs (not in plan's file list).
- `correctionPreview` does its own Decimal math with the shared `floorCents`/`americanToDecimal` (no snapshot needed client-side); first arg is accepted but unused.

## Verification
Full `npx vitest run`: 162 files, 2328 tests pass. Lint: 0 errors. Typecheck: only the known `LayoutProps` worktree artifact.

## Self-Check: PASSED
