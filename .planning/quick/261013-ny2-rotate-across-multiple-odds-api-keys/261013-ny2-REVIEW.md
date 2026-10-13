---
status: issues_found
depth: quick
files_reviewed: 13
critical: 0
warning: 4
info: 3
---

# Code Review: quick 261013-ny2 (rotate Odds API keys)

Focus checks: no path overspends a key or splits a refresh across keys (key chosen once after the lock, passed to every fetch, gate on chosen key, row written with keyId); no key leaks (fixed error messages, fingerprint-only logs, fingerprint-only DB); 15-minute confirm stays global (globalLatest in both refresh paths).

## Warnings

### WR-01: Pre-0013 gate uses the live /sports balance, not the DB row
**File:** src/ingestion/odds/keySelection.ts:90-103
**Issue:** In the `!keyColumn` branch the gate prefers the probe's x-requests-remaining over `effectiveRemaining(latest, now)`; `priorUsed` likewise comes from the live header.
**Orchestrator decision:** ACCEPTED as an intended improvement (it was explicitly requested as plan-check follow-up 1: more accurate, still credit-free). Do not change code; record it in CONTEXT.md and the SUMMARY.

### WR-02: Single-key meter reads the newest row across ALL keys
**File:** src/ingestion/odds/status.ts:64-67, 74-75
**Issue:** With the key_id column present and one configured key, remaining/total/level come from `latest` (newest row of any key). After a key is removed from ODDS_API_KEYS, the meter shows the removed key's balance while the gate uses the configured key's own row.
**Fix:** Use the per-key computation whenever the key_id column exists and >= 1 key is configured; keep the global-latest path only pre-0013 / no keys configured.

### WR-03: Meter sums keys, but a refresh must fit on one key
**File:** src/ingestion/odds/status.ts:88-90
**Issue:** 60 + 60 shows 120 and OK, but a 70-credit refresh returns insufficient_credits (gate needs one key to cover the estimate).
**Fix:** Keep the combined total for display ("X of Y credits"), but expose the best single key's balance (e.g. `bestKeyRemaining`) and drive warn/block level and any "can refresh / estimate exceeds balance" UI hint from it, consistent with evaluateRefreshGate. Update the meter UI copy only if needed so it never implies a refresh is affordable when no single key can cover it.

### WR-04: Legacy rows lost when ODDS_API_KEY is not in ODDS_API_KEYS
**File:** src/ingestion/odds/oddsKeys.ts:46-50 (used at status.ts:76, keySelection.ts:53)
**Issue:** legacyKeyId prefers ODDS_API_KEY's fingerprint; if that key is not in the configured list, no candidate matches, legacy null-key_id rows are ignored and every key looks like a fresh 500.
**Fix:** In multi-key mode (key_id column present), if ODDS_API_KEY's fingerprint is not among the configured keys, legacy rows belong to the FIRST configured key. Pre-0013 behavior (ODDS_API_KEY is the only candidate) stays as is.

## Info

### IN-01: ANTHROPIC_API_KEY added to .env.example
Requested by the owner/orchestrator in this task. No change.

### IN-02: Silent fallback to key 0 in the client; garbled header comment
**File:** src/ingestion/odds/client.ts:3-5, 36-44
**Fix:** Make `apiKey` a required parameter of fetchSportOdds and fetchEventOdds (refresh paths always pass the selected key). Keep a default only where CLI/smoke scripts need it, explicitly. Fix the header comment.

### IN-03: scripts/odds-smoke.ts spends on the first key without a ledger row
**Fix:** Print a clear warning at start that it spends real credits on the first configured key and does not record them in credit_usage (dev-only script; do not run it).
