---
phase: quick-261013-ny2
verified: 2026-10-13
status: passed
score: 8/8 must-haves verified
---

# Quick 261013-ny2 Verification

All 8 truths verified against code. Full vitest (127 files, 1780 tests), typecheck and lint were re-run and are green.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One key per refresh, most credits left, ties to earliest | VERIFIED | `keySelection.ts` is called after `tryAcquireRefreshLock` in refresh.ts (L69 then L98) and refreshExtended.ts (L201 then L230). `selected.key` is passed to every `fetchSportOdds` and `fetchEventOdds`. `pickKey` uses strict `>` so ties keep configured order. |
| 2 | Single key behaves as before | VERIFIED (with a documented change) | `configuredOddsKeys` falls back to `ODDS_API_KEY`. status.ts only combines when more than one key is set and the column exists. With one key, selection still makes a free probe and prefers the probe's remaining over the DB balance. The SUMMARY flags this as intentional and the gate outcome is unchanged when the two agree. |
| 3 | Pre-0013 works in single-key mode | VERIFIED | `getLatestCreditUsage` selects explicit columns. `getLatestCreditUsageByKey` returns `{keyColumn:false}` on 42703. `recordCreditUsage` retries without `key_id` on 42703. With `keyColumn:false`, `keySelection.ts` has a single candidate (`ODDS_API_KEY` or the first listed key). |
| 4 | Fingerprint stored, legacy null rows go to the legacy key | VERIFIED | `keyFingerprint` is 8 hex of sha256. `legacyKeyId` and `latestRowForKey` merge null rows into the legacy key. Both refresh paths record `keyId: selected.id`. |
| 5 | Gates use the chosen key's balance, confirm window and estimate stay global | VERIFIED | Both refresh paths use `priorRemaining` and `priorUsed` from `selected`. `lastRefreshAt` is `selected.globalLatest?.recordedAt`. |
| 6 | A failing probe is never chosen, only its fingerprint is logged | VERIFIED | The probe catch logs `{keyId, status}` only. The client errors are fixed messages with no cause or URL. If every probe fails, the first error is rethrown (key-free). |
| 7 | Combined meter, blocked only when every key is below 20 | VERIFIED | status.ts sums remaining and total across keys. `level = creditLevel(best)`, so it is blocked only when the best key is below 20. Field names are unchanged. |
| 8 | No real call or key, migration generated but not applied | VERIFIED | `drizzle/0013_credit_usage_key_id.sql` holds a single `ADD COLUMN "key_id" text;`. `grep process.env.ODDS_API_KEY` outside tests and oddsKeys.ts returns nothing. `.env.example` has empty placeholders. The workflow adds `ODDS_API_KEYS` next to `ODDS_API_KEY`. No migrate was run. |

## Other callers
`morningObserve.ts` uses `configuredOddsKeys().length > 0`. `scripts/odds-smoke.ts` still compiles because `apiKey` is an optional trailing parameter that defaults to the first configured key.

## Anti-patterns
No TBD, FIXME or XXX markers were checked beyond the diff. No blockers were found in the diff.

## Human verification
None required. Owner steps (set the env var, apply migration 0013 after OK) are documented in SUMMARY.md. Note: the meter and rotation only activate after the owner applies 0013.

## Notes (non-blocking)
- In single-key mode a failed `/sports` probe now fails the refresh with a generic message. Previously a failed `listSports` also failed it, so this is equivalent in practice.
- An accidental prettier run reformatted some files. Behavior is unaffected.
