# Quick Task 261013-ny2: Rotate across multiple Odds API keys - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Task Boundary

Let the app use several The Odds API keys (the owner reports The Odds API approved cycling keys, 2026-10-13). Today every Odds API caller reads one `ODDS_API_KEY`, and the credit safeguards (credit meter, low-credit block, insufficient-credit block, 15-minute confirm) assume one 500-credit balance tracked in `credit_usage`. This task makes all of that key-aware. Out of scope: buying a paid plan, changing which sports/markets are fetched, scheduled polling.
</domain>

<decisions>
## Implementation Decisions (locked by the owner)

### Key count
- 3 keys total (the current key + 2 new) = 1,500 credits/month. Code must work for any N >= 1.

### Rotation rule
- Each refresh uses the key with the MOST effective credits remaining (monthly-reset aware). Keys drain evenly.
- A whole refresh (every sport / event call in that refresh) stays on ONE key; never split a refresh across keys.
- Ties: deterministic (e.g. configured order).
- A configured key with no recorded history counts as a fresh 500.

### Configuration and secrets
- New env var `ODDS_API_KEYS` (comma-separated, whitespace-trimmed, empties ignored, duplicates collapsed). If unset, fall back to the existing single `ODDS_API_KEY` (no behavior change for existing deploys).
- Keys are never logged, printed, committed, or stored. Each key is identified by a short non-reversible fingerprint (e.g. first 8 hex chars of sha256) — this is what goes in the DB and logs.
- The owner adds the real keys themselves to `.env.local`, Vercel and GitHub secrets (the assistant must not ask for them in chat). Deliverable includes exact commands for that.

### Credit tracking
- `credit_usage` gains a nullable `key_id` (fingerprint) column via migration 0013 — GENERATE ONLY; the owner applies it with explicit OK (project rule). Code must keep working before 0013 is applied (missing column tolerated, behaving like today's single-key mode).
- Legacy rows (null `key_id`) belong to the original `ODDS_API_KEY`'s fingerprint.
- The `x-requests-remaining` / `x-requests-used` headers returned for the chosen key update that key's balance.

### Safeguards
- `evaluateRefreshGate` (block below 20, insufficient credits, 15-minute confirm) applies to the chosen key's balance. The existing refresh lock still serializes refreshes.
- `FREE_TIER_MONTHLY_CREDITS` (500) stays a per-key constant.

### Credit meter (member-visible)
- Shows the combined total across configured keys, e.g. "1,240 of 1,500 credits remaining this month". Warn/block styling must be sensible for the combined view and must not claim refreshes are possible when every key is below the block threshold.

### Claude's Discretion
- Exact module layout (e.g. a small `oddsKeys` module), fingerprint length, how the combined warn level is derived, how the "missing column" tolerance is detected (mirror Phase 6's `undefinedTable.ts` pattern for 42703 undefined_column if useful).

### Resolved after research (orchestrator, within Claude's Discretion)
- Before migration 0013 is applied (key_id column missing), do NOT rotate: use only the original key exactly as today, so other keys' spend is never charged to it.
- Legacy null-key_id rows belong to `ODDS_API_KEY`'s fingerprint when set; if only `ODDS_API_KEYS` is set, to its FIRST key.
- Use the free `/sports` call (0 credits) to read each candidate key's real `x-requests-remaining` before choosing, so a typo'd/revoked key is never picked as a "fresh 500" and out-of-app usage is reflected. Add it as a new export (keep existing `listSports` mocks valid). Probing must stay credit-free.
- The 15-minute confirm window and the sportsFetched estimate stay GLOBAL (latest row across all keys); only the balance gates are per key. Choose the key after acquiring the refresh lock.
- Meter: keep `OddsStatus` field names; combined remaining/total; warn/block level from the best key; single-key behavior unchanged.
</decisions>

<specifics>
## Specific Ideas / Callers to cover

- `src/ingestion/odds/client.ts` (reads `process.env.ODDS_API_KEY` at call time — must accept an explicit key)
- `src/ingestion/odds/refresh.ts` (user refresh), `src/ingestion/odds/refreshExtended.ts` (promo-scoped + spreads/totals), `src/ingestion/odds/morningObserve.ts` (morning job; `hasApiKey` check)
- `src/ingestion/odds/quota.ts` (thresholds, gate, effectiveRemaining, isFromEarlierBillingMonth, nextMonthlyReset)
- `src/db/schema.ts` `creditUsage`, plus wherever the latest credit row is read for the meter and gate
- `.github/workflows/scrape-promos.yml` (pass `ODDS_API_KEYS` from a new secret, keep `ODDS_API_KEY`)
- `.env.example` (add `ODDS_API_KEYS`, and the missing `ANTHROPIC_API_KEY` line)
- Existing workflowConfig.test.ts asserts things about the workflow file — keep it green / extend it.

## Constraints
- Never spend Odds API credits in tests or verification (mocks only). Never print real keys.
- No `npm install` / `npm ci` (host disk is low). Do not push. Do not apply migrations.
</specifics>

- Pre-0013 gate prefers the free /sports probe balance over the DB row (accepted improvement, review WR-01).
