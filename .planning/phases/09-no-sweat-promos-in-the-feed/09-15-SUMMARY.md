---
phase: 09-no-sweat-promos-in-the-feed
plan: 15
subsystem: ui
tags: [ui, opportunities, no-sweat-row]
requires: ["09-12", "09-14"]
provides:
  - NoSweatRow, NoSweatDetails, NoSweatNoteRow, TrackButton, NoSweatRiskAdvisory, noSweatRowView helpers
affects: [09-18]
key-files:
  created:
    - src/components/promos/noSweatRowView.ts
    - src/components/promos/noSweatRowView.test.ts
    - src/components/NoSweatRiskAdvisory.tsx
    - src/components/promos/TrackButton.tsx
    - src/components/promos/NoSweatRow.tsx
    - src/components/promos/NoSweatDetails.tsx
    - src/components/promos/NoSweatNoteRow.tsx
decisions:
  - Estimates use text-foreground with an est. badge and Est. ROI caption; never the green accent.
  - Risk line is rendered inside TrackButton so it sits beside every Track action.
metrics:
  tasks: 2
  completed: 2026-11-03
---

# Phase 9 Plan 15: No-sweat feed row components Summary

Presentation components for no-sweat rows in the Opportunities feed (est. badge, non-green estimate, Est. ROI caption, Low-profile warnings, Track button with account-risk line, muted note rows), with all copy in tested pure helpers.

## Commits
- e21100c: view helpers (5 vitest tests pass) and NoSweatRiskAdvisory (full and compact variants)
- 7658df0: TrackButton, NoSweatRow, NoSweatDetails, NoSweatNoteRow

## Deviations from Plan
- The worktree started on a stale base; reset to the specified base commit (72051d8) per the startup check so the wave 4 dependencies (noSweatRowDto, trackNoSweatAction) were present. No code deviations.
- The "full" advisory variant adds a TriangleAlert icon inside the Alert; hiddenLinesNote uses singular "line" for a count of 1.
- Track button appears in the collapsed row below the grid (outside the pointer-events-none layer) and again in the expanded panel.

## Verification
- vitest noSweatRowView: pass. eslint: clean. typecheck: only the known LayoutProps worktree artifact.
- grep text-primary in the three row files: 0. No policy words in the risk copy.

## Known Stubs
None. Screen wiring is plan 09-18.

## Self-Check: PASSED
