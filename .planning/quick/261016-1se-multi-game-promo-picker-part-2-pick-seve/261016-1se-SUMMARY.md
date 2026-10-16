# Quick 261016-1se: Multi-game promo picker (Part 2) Summary

Members can now tick 2-12 games from one league when adding, editing, correcting or classifying a promo; the server re-resolves every id against cached odds and never widens a bad list.

## Commits
- 67512a0 server contract (GamesScopeInputSchema, resolveMemberScope games branch, memberScopeInputFrom, edit eventIds)
- e3e3ca8 pure picker state (ScopeDraft.eventIds, league lock, 12 cap, edit prefill, duplicate hint)
- a18872f checkbox ScopePicker UI, BoostFields and QueueItemCard pin handling

## Notes
- Edit of a games promo with a started game: that game shows as "A game no longer in the odds" and must be removed before saving (server returns stale). No keep-original path (owner decision).
- 1 pick saves as a single-game promo (pin still possible); 2+ picks send a games scope with no pin; boost odds mode with 2+ games asks for the exact bet.
- No migration, no new dependencies, no money math touched.

## Verification
- vitest: 131 files / 1915 tests passed
- tsc: only the pre-existing src/app/layout.tsx LayoutProps error
- eslint (components/promos, domain/promos, db, app/actions): clean

## Deviations
None. Worktree base was reset to c8e85ee (it started on 78e181f, which lacked the plan).
