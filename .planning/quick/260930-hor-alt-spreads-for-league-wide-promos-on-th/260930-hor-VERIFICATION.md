---
phase: quick-260930-hor
verified: 2026-09-30T18:55:00Z
status: passed
score: 8/8 must-haves verified
---

# Quick 260930-hor Verification

Verified against code at commits 06d6f99 and e290977, not the SUMMARY.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each unpinned spread-eligible league-wide promo adds exactly one (top-1 main-line) game | VERIFIED | `leagueWideAltTargets.ts` ranks `[promo]` on alt-stripped events and takes `[0].selection.eventId`. Filter: `isLeagueWideAltSpreadPromo` |
| 2 | Dedupe, including against single-game ids | VERIFIED | Set in the picker. `Set` merge of `base.scopedEventIds` and `picked` in `refreshExtended.ts` |
| 3 | Shared 5-game cap, soonest first, skipped count | VERIFIED | Merged ids go into the unchanged `selectAltSpreadTargets`. Cap test is in `altSpreads.test.ts` and `refreshExtended.test.ts` |
| 4 | No eligible game means no target | VERIFIED | `rankPromoHedges` returns only profitable promos. `top` is undefined, so nothing is added |
| 5 | Picker throw does not fail the main refresh | VERIFIED | The hook call is in its own try/catch falling back to `[]`. It does not touch `altLines.failed` |
| 6 | Unconfirmed press does no load, pick or alt fetch | VERIFIED | The action loads promos only `if (confirmed)`. The refresh returns `confirm_required` before the main loop, where the hook lives |
| 7 | Ranking uses alt pairs for league-wide promos | VERIFIED | `altSpreadBookKey: promo.bookKey` with the scope guard removed. The test expectations were updated to 5.30 and 30.30 |
| 8 | correctionOptions, Arb tab and bonus finder unchanged | VERIFIED | `git diff --stat` from 02b10b2 to HEAD touches only the planned files plus `refresh-spreads-totals.hook.test.ts`. `correctionOptions.ts`, `selection.ts`, `pairPromos.ts`, `rankArbs.ts` and `rankBonusBetHedges.ts` are not touched |

## Spot-checks
- `npx vitest run src/domain/promos src/ingestion/odds/refreshExtended.test.ts src/app/actions`: 45 files, 807 tests, all pass.
- `npx tsc --noEmit`: clean (no output).

## Notes (informational, not gaps)
- The action also filters out completed ("done") promos before picking, mirroring the feed. The plan did not call for this, but it is consistent with `get-promos.ts` and adds a `getPromoCompletions` call.
- The action test for the hook is in a new file, `refresh-spreads-totals.hook.test.ts`, rather than the existing test file. This is acceptable.
- I did not run lint, and I did not call the DB or the Odds API.
