---
phase: quick-261013-ny2
plan: 01
subsystem: odds-ingestion
tags: [odds-api, credits, key-rotation, migration]
key-files:
  created:
    - src/ingestion/odds/oddsKeys.ts
    - src/ingestion/odds/keySelection.ts
    - src/db/undefinedColumn.ts
    - drizzle/0013_credit_usage_key_id.sql
  modified:
    - src/ingestion/odds/client.ts
    - src/ingestion/odds/store.ts
    - src/ingestion/odds/refresh.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/ingestion/odds/morningObserve.ts
    - src/ingestion/odds/status.ts
    - src/db/schema.ts
    - .github/workflows/scrape-promos.yml
    - .env.example
metrics:
  completed: 2026-10-13
  commits: [1f4cd12, 94e0771, f26ef26]
---

# Quick Task 261013-ny2: Rotate across multiple Odds API keys Summary

Every refresh (moneyline, spreads/totals, promo-scoped, morning job) now runs entirely on one Odds API key, chosen under the refresh lock as the configured key with the most credits left (ties go to the earliest-listed). Spend is recorded per key as an 8-hex sha256 fingerprint, and the member-visible meter shows the combined balance.

## What changed

- `oddsKeys.ts`: `ODDS_API_KEYS` (comma list, trimmed, deduped) with fallback to `ODDS_API_KEY`; fingerprints; legacy-row owner; `pickKey`; shared `MISSING_KEY_MESSAGE`.
- `client.ts`: explicit `apiKey` parameter; new `listSportsWithQuota` (free `/sports` call that also returns quota headers). Errors stay fixed and key-free.
- `keySelection.ts`: probes each candidate with the free `/sports` call, drops failing keys (logs fingerprint + status only), picks the best, returns that key's balance and the global latest row.
- `store.ts`: `getLatestCreditUsage` selects explicit columns (works pre-0013); `getLatestCreditUsageByKey`; key-aware `recordCreditUsage` with a no-`key_id` fallback insert on 42703.
- Gates, carry-forward and extended confirm/blocked payloads use the chosen key's balance; the 15-minute confirm window and the sports estimate stay global.
- `status.ts`: with more than one key and the column present, `remaining`/`total` are summed; `level` follows the best key, so it is "blocked" only when every key is below 20.
- Workflow passes `ODDS_API_KEYS`; `.env.example` documents it and adds `ANTHROPIC_API_KEY`.
- Migration `drizzle/0013_credit_usage_key_id.sql` (`ALTER TABLE "credit_usage" ADD COLUMN "key_id" text;`) generated only, NOT applied.

## Intended behavior change (single key)

With a single configured key, `selectOddsKeyForRefresh` still makes the free `/sports` probe and prefers its `x-requests-remaining` over the DB-derived balance (this also reflects usage outside the app and surfaces a bad key before any spend). When the probe's remaining equals the DB balance, gate outcomes are identical to before (test: "gate balance is unchanged..."); when they differ the probe's real balance wins (test: "the probe's real balance wins..."). If the probe fails in single-key mode, the refresh fails with the generic key-free message (no key, no URL).

## Pre-0013 behavior

While `credit_usage.key_id` is missing there is no rotation. If `ODDS_API_KEY` is set it is the only candidate (even if not in `ODDS_API_KEYS`); otherwise the first `ODDS_API_KEYS` entry. Rows are inserted without `key_id`, so another key's spend is never charged to the legacy row. Rotation starts automatically once the column exists.

## Deviations from Plan

None beyond the two orchestrator follow-ups (single-key probe tests; ODDS_API_KEY-only candidate pre-0013), both implemented with tests. Existing caller tests (refresh-odds, refresh-spreads-totals, refreshExtended) run the real key selection against mocked client/store (probe returns no balance header, store reports `keyColumn: false`) rather than mocking `keySelection`. Task 2 touched more files than the plan listed's grouping; accepted by the checker.

Note: an accidental `npx prettier` run (not a project dependency, default config) reformatted some files in Task 2's commit (refresh.ts, refreshExtended.ts, and touched odds files); the Task 3 files were reverted and redone without it. Behavior is unaffected.

## Verification

Full `npx vitest run` (127 files, 1780 tests), `npm run typecheck`, `npm run lint` all green. No real API call, no key printed, no DB access, no migration applied. `grep process.env.ODDS_API_KEY` outside tests and `oddsKeys.ts` returns nothing.

## Owner setup

No real values below; use the interactive prompts so keys stay out of shell history.

1. `.env.local`: open in an editor and add one line `ODDS_API_KEYS=<current key>,<new key 2>,<new key 3>` (current key first; keep `ODDS_API_KEY` as is).
2. Vercel: `vercel env add ODDS_API_KEYS production` (paste the comma list at the hidden prompt; repeat with `preview` if previews refresh odds), then redeploy: `vercel --prod` (or Redeploy in the dashboard) so the new env is picked up.
3. GitHub Actions: `gh secret set ODDS_API_KEYS` (paste at the prompt).
4. Migration 0013: review `drizzle/0013_credit_usage_key_id.sql` (adds nullable `credit_usage.key_id`), then after giving explicit OK run `npm run db:migrate`. Until it is applied the app stays on the original key only (no rotation).
5. Optional credit-free check: open the app and confirm the meter reads "... of 1,500 credits remaining this month".

## Self-Check: PASSED

- Behavior note (review WR-01): pre-0013 gate prefers the free /sports probe balance (x-requests-remaining) over the DB row -- accepted improvement.
