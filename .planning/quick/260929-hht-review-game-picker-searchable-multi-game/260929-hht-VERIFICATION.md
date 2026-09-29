---
status: human_needed
score: 7/7 must-haves verified in code; visual/mobile check pending
---

# Quick 260929-hht Verification

Verified against code on main (not SUMMARY).

- Server/DB/ingestion untouched: `git diff --quiet 8b3ea5d HEAD -- src/app/actions src/db src/ingestion src/domain/promos/reviewInput.ts src/domain/promos/memberScope.ts` exits 0. No non-src files changed between base and HEAD, so no drizzle migration.
- Old dropdown removed: CorrectionScopeSelect.tsx deleted. No imports remain. Two stale comments remain in src/app/actions/get-promos.ts (lines 68 and 143). This is info-level only (comment text) and is in a file the task forbids editing.
- Mode toggle: ScopePicker.tsx has a ToggleGroup with "One game" and "All games in a league" (h-11).
- Game search: Input type=search, uses searchEventOptions and groupEventOptions, and the list has max-h-72 overflow-y-auto. Rows are min-h-11 with aria-pressed, and there is a live result count and the empty-state messages.
- League mode: League, From and Through selects (h-11), with selectLeague and selectFromDay from scopeDraft.ts.
- Prefill: prefillScopeDraft is used in both QueueItemCard (on open, when the draft is still empty) and ClassifyQueueCard.
- Market pin: shown only when draft.mode === "game" in QueueItemCard. Pinned is built from selectedEvent.
- Payloads: scopeInputFromDraft adds etEndDate only when Through is non-empty and differs from From (a single day has no key). Both cards use it. Classify sends null when nothing is chosen.
- Tests: gameSearch, scopeDraft and correctionOptions test files pass (62 tests). The orchestrator reported the full vitest, tsc and lint runs as clean.

## Human verification (visual / touch; cannot be checked by grep)
1. On a phone, open Correct on a match card. Type "bron" and pick the game. Confirm the list scrolls inside its box and rows are comfortable to tap.
2. Switch to "All games in a league", choose NHL, set From to today and Through to tomorrow, then save.
3. On a "Needs a look" card with a scraped window, confirm league mode opens prefilled.

## Gaps
None.
