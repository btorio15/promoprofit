# Quick 260929-hht: Searchable review game picker Summary

Replaced the single "Game or day" dropdown with a ScopePicker: a One game / All games in a league toggle, a searchable grouped game list (44px rows, bounded scroll), and League / From / Through selects prefilled from scraped windows. Server payloads unchanged.

## Commits
- 4aeab27 feat: pure game search, grouping, scope draft helpers (+ CorrectionEventOption homeTeam/awayTeam/etDate/searchText)
- 251ea08 feat: ScopePicker component
- b52bdbb feat: wire into QueueItemCard and ClassifyQueueCard; delete CorrectionScopeSelect.tsx

## Verification
- vitest: 69 files, 1059 tests pass; tsc clean (after `npx next typegen`); lint clean.
- No changes under src/app/actions, src/db, src/ingestion, reviewInput.ts, memberScope.ts (diff vs base 8b3ea5d).

## Deviations
None. Collapsed state derives from draft.eventId; search resets on eventId change (state adjusted during render, no effect). Stale comments in src/app/actions/get-promos.ts still mention CorrectionScopeSelect (left untouched to keep server files unchanged).
