# Quick Task 261013-ny2: Rotate across multiple Odds API keys - Research

**Researched:** 2026-10-13
**Domain:** Codebase integration (Odds API client, credit ledger, refresh gate, credit meter)
**Confidence:** HIGH (codebase read directly; Odds API facts from official docs)

<user_constraints>
Locked decisions are in `261013-ny2-CONTEXT.md` (3 keys, any N >= 1; most-effective-credits-remaining
rotation, ties by configured order, one key per whole refresh; `ODDS_API_KEYS` comma list falling back to
`ODDS_API_KEY`; sha256 fingerprint only in DB/logs; nullable `credit_usage.key_id` via migration 0013
GENERATE ONLY; pre-0013 tolerated as single-key mode; legacy null rows = original `ODDS_API_KEY`'s
fingerprint; gate applies to chosen key; 500 stays per-key; meter shows combined total). Discretion: module
layout, fingerprint length, combined warn level, 42703 detection. No npm install/ci, no migrations applied,
no real Odds API calls, never print keys.
</user_constraints>

## Summary

All key reads funnel through one private function, `getApiKey()` in `src/ingestion/odds/client.ts:34-40`,
used by `listSports` (:64), `fetchSportOdds` (:106) and `fetchEventOdds` (:156). All credit reads funnel
through `getLatestCreditUsage()` (`src/ingestion/odds/store.ts:182-195`) and all writes through
`recordCreditUsage()` (`store.ts:169-179`). So the change is narrow: (1) a new pure `oddsKeys` module
(parse env, fingerprint, pick key), (2) client functions take an explicit key, (3) store gains a per-key
"latest balance" read plus a `keyId` on write, both tolerant of a missing column, (4) refresh paths pick a
key under the lock and thread it through, (5) status.ts sums the per-key balances for the meter.

The biggest non-obvious trap: Drizzle builds `INSERT` with **every** schema column (missing values become
`default`, verified in `node_modules/drizzle-orm/pg-core/dialect.js:375-387`) and `db.select().from(t)`
names every column. Once `keyId` is in `schema.ts`, the existing insert and `getLatestCreditUsage`'s
`select()` will throw 42703 on a database where 0013 is not applied. Pre-migration tolerance therefore
needs explicit column selects plus a key_id-free insert fallback, not just a try/catch on new reads.

**Primary recommendation:** Pick the key inside the existing refresh lock from per-key effective balances;
keep the 15-minute confirm window and `sportsFetched` estimate on the GLOBAL latest row (any key); record
`key_id` on every new row; on 42703 fall back to today's exact single-key behavior using the primary key.

## Touch Points (file:line)

### Key flow
| Where | What it does today | Change |
|---|---|---|
| `src/ingestion/odds/client.ts:34-40` `getApiKey()` | reads `process.env.ODDS_API_KEY`, throws `"ODDS_API_KEY is not set"` | Replace with an explicit `apiKey: string` param on `listSports`, `fetchSportOdds`, `fetchEventOdds` (optional param defaulting to the primary configured key keeps `scripts/odds-smoke.ts:26,51,101` working). |
| `client.ts:63-86` `listSports` | free `/sports` call, **discards** quota headers | Optional: return/expose quota too (see "Free /sports probe"). |
| `client.ts:49-55` `parseQuotaHeaders` | parses `x-requests-remaining/used/last` | No change; headers are per key, the caller already knows which key it used. |
| `src/ingestion/odds/refresh.ts:21,44-51` | `MISSING_KEY_MESSAGE` equality check in `safeMessage` | Keep string identical to the client's thrown message (or move the constant to `oddsKeys` and import it in all three places). |
| `refresh.ts:95-124` | `getLatestCreditUsage()` -> `effectiveRemaining` -> gate | Select key first (inside lock), gate on chosen key's effective balance, `lastRefreshAt` from global latest. |
| `refresh.ts:104,161` | `listSports()` / `fetchSportOdds()` | pass chosen key. |
| `refresh.ts:192-208` | carry-forward balance + `recordCreditUsage` in `finally` | `priorRemaining/priorUsed` must be the CHOSEN key's; add `keyId`. |
| `src/ingestion/odds/refreshExtended.ts:61,125-127` | duplicate `MISSING_KEY_MESSAGE` / `safeMessage` | same as refresh.ts. |
| `refreshExtended.ts:230,237,258-264` | latest row, listSports, gate | same as refresh.ts; also confirm payload `remaining: priorRemaining` (:288,:296) becomes chosen key's balance. |
| `refreshExtended.ts:325,378,384` | fetchSportOdds, alt-lines `balance = lastRemaining ?? priorRemaining` skip check, fetchEventOdds | pass chosen key; `balance` stays per chosen key (correct, since all alt calls use the same key). |
| `refreshExtended.ts:424-430` | carry-forward + record | add `keyId`. |
| `src/ingestion/odds/morningObserve.ts:90` | `hasApiKey = Boolean(process.env.ODDS_API_KEY)` | use `configuredOddsKeys().length > 0`. |
| `scripts/odds-smoke.ts:13,26,51,101` | calls client directly | keep working via default-key param. |
| `scripts/refresh-odds.ts` | prints `RefreshOutcome` | if outcome gains `keyId`, print fingerprint only. |

### credit_usage readers / writers (complete list from grep)
| Where | Access | Affected by new column? |
|---|---|---|
| `store.ts:169-179` `recordCreditUsage` | `db.insert(creditUsage)` | **YES** - insert lists all schema columns -> 42703 pre-migration. Needs fallback. |
| `store.ts:182-195` `getLatestCreditUsage` | `db.select().from(creditUsage)` (all columns) | **YES** - switch to explicit column select; keep as the "global latest" read (confirm window + `sportsFetched`). |
| `store.ts:206-216` `getSpendAttribution` | selects `users.displayName`, joins on `triggeredByUserId` | No (explicit columns). |
| `src/db/dailyRunStatus.ts:57-62` | selects `recordedAt` where `triggered_by_user_id IS NULL` | No. Key-agnostic duplicate-cron guard stays correct (any key's scheduled row counts). |
| `scripts/seed.ts:86` | selects `id` | No. |
| `src/db/fixtureSeedGuard.ts` | "a credit_usage row exists" | No. |
| `src/ingestion/odds/status.ts:39-90` `getOddsStatus` | meter: `remaining`, `total`, `level`, estimates | **YES** - combined meter (see below). |
| `src/app/api/cron/scrape/route.ts` | only dispatches the workflow; no key, no credit_usage | No. |
| `src/db/schema.ts:142-150` `creditUsage` | table def | add `keyId: text("key_id")` (nullable, no default). |

### UI consumers of `OddsStatus` (shape should stay the same)
`src/components/finder/OddsStatusBar.tsx:175-202` (bar value `remaining/total`, text "{remaining} of
{total} credits remaining this month", button `disabled` when `level === "blocked"`),
`src/components/finder/CreditBanner.tsx:13-28` (warning/blocked copy), `RefreshConfirmDialog.tsx`,
`promoRefresh.ts`, `src/components/arb/*`, `AppShell.tsx`, `AppHeader.tsx`, `src/app/page.tsx`. If
`status.ts` keeps the `OddsStatus` field names, no component changes are required.

## Recommended Design

**`src/ingestion/odds/oddsKeys.ts` (pure, no I/O except env read):**
- `configuredOddsKeys(env = process.env): { key: string; id: string }[]` - `ODDS_API_KEYS` split on `,`,
  trim, drop empties, dedupe preserving order; if that yields nothing, `[ODDS_API_KEY]` if set; else `[]`.
- `keyFingerprint(key)` = `createHash("sha256").update(key).digest("hex").slice(0, 8)` (node:crypto).
- `legacyKeyId(env)` = fingerprint of `ODDS_API_KEY` if set, else of the first configured key.
- `pickKey(keys, balancesById, now)` - effective balance per key = `effectiveRemaining(latestRowForKey, now)
  ?? FREE_TIER_MONTHLY_CREDITS`; choose max; ties -> configured order (stable `reduce` with strict `>`).
- Never put the raw key in any returned object that might be logged; return `{ key, id }` only to the
  refresh path, and only `id` anywhere else.

**Per-key read (store.ts):** `getLatestCreditUsageByKey(): Map<keyId | null, row>` using Drizzle
`selectDistinctOn([creditUsage.keyId], {...explicit cols})` `.orderBy(creditUsage.keyId,
desc(creditUsage.recordedAt))`. In JS, merge the `null` group into `legacyKeyId` (take whichever of the two
is more recent). Rows whose id matches no configured key are ignored (key removed from config).

**Gate (unchanged function `evaluateRefreshGate`):** `remaining` = chosen key's effective balance
(null for a never-used key -> never blocks, same as today; or pass 500 - either is fine, null mirrors
current semantics); `lastRefreshAt` = **global** latest `recordedAt` across all keys.

**Combined meter (status.ts):**
- `remaining` = sum over configured keys of `effective ?? 500` (but keep `null` when N = 1 and there is no
  current-month row, so the existing "unknown" UI and tests are unchanged).
- `total` = sum over keys of `(remaining + used)` for keys with a current-month row, else 500.
- `level` = `creditLevel(best key's effective balance)` - i.e. the balance the NEXT refresh would be gated
  on. This guarantees `blocked` exactly when every key is below 20, and `warning` when even the best key is
  below 100 (the next refresh is about to drain). CreditBanner's "Only {remaining} credits" then shows the
  combined number - acceptable; optionally note "across N keys".
- `estimatedRefreshCredits` / `sportsFetched` stay from the global latest row.

**Pre-0013 tolerance:** add `src/db/undefinedColumn.ts` mirroring `src/db/undefinedTable.ts`:
`isUndefinedColumnErrorFor(err, "key_id")` - walk `.cause` up to 5 levels (Drizzle 0.45 wraps driver errors
in `DrizzleQueryError` with `cause`), accept code `42703` whose message mentions `key_id`, or a bare 42703
with no message. Postgres phrases this two ways: `column credit_usage.key_id does not exist` (select) and
`column "key_id" of relation "credit_usage" does not exist` (insert) - match both (regex on `key_id`).
- Per-key read on 42703 -> return single-key mode: only the legacy/primary key is eligible, using the
  global latest row (exactly today's behavior). Do not rotate when the column is missing - otherwise the
  untracked keys' spend would be written as anonymous rows and misattributed to the legacy key.
- Insert on 42703 -> retry with an insert that omits `key_id`: either `db.execute(sql\`insert into
  credit_usage (requests_remaining, requests_used, refresh_cost, sports_fetched, recorded_at,
  triggered_by_user_id) values (...)\`)` or a local `pgTable("credit_usage", {...no keyId})` defined in
  store.ts (NOT in schema.ts, which drizzle-kit scans). Best-effort as today (`refresh.ts:209-212`).

**Migration:** add the column to `schema.ts`, then `npx drizzle-kit generate --name credit_usage_key_id`
(reads snapshots only; `drizzle.config.ts` loads `.env.local` but generate does not connect). Expected SQL:
`ALTER TABLE "credit_usage" ADD COLUMN "key_id" text;`. Do not run `db:migrate`.

## Free /sports probe (question 4)

`[CITED: the-odds-api.com/liveapi/guides/v4/]` GET `/v4/sports` "does not count against the usage quota"
and returns `x-requests-remaining`, `x-requests-used`, `x-requests-last`. So the existing free
`listSports` call (already made once per refresh with the chosen key) could report the chosen key's REAL
balance at zero cost; today `client.ts:63-86` throws the headers away and no test covers them.
Recommendation (optional, small): add `listSportsWithQuota(apiKey)` returning `{ sports, quota }` (a new
export, so the existing `vi.mock` factories mocking `listSports` as `Sport[]` don't break), and when
`quota.remaining` is non-null use it as the chosen key's `priorRemaining` for the gate. This fixes the
"fresh key assumed 500" case and keys used outside the app. Selection itself stays DB-based per the locked
decision. Probing all N keys before choosing is also free but adds N round-trips; not needed.

## Common Pitfalls

1. **Rotation bypasses the 15-minute confirm.** If `lastRefreshAt` came from the chosen key's latest row,
   switching keys would make every refresh look "first in 15 min". Use the global latest row.
2. **Selection outside the lock.** Two near-simultaneous refreshes could both pick the same key on stale
   balances. Read balances and pick only after `tryAcquireRefreshLock` succeeds (`refresh.ts:69`,
   `refreshExtended.ts:202`) - i.e. inside `runGuardedRefresh` / its extended twin.
3. **Carry-forward uses the wrong key.** `refresh.ts:192-194` and `refreshExtended.ts:424-426` fall back to
   `priorRemaining - refreshCost` when headers are missing; `priorRemaining/priorUsed` must be the chosen
   key's, not the global row's.
4. **Monthly reset per key.** Odds API resets "on the first of every month" for all accounts
   `[CITED: the-odds-api.com/manage/faqs.html]`, so the existing `effectiveRemaining` /
   `isFromEarlierBillingMonth` (`quota.ts:100-111`) applies per key unchanged; a last-month row ->
   null -> treated as 500.
5. **Legacy null rows.** Pre-0013 rows (and rows written by a pre-migration fallback insert) have null
   `key_id`; attribute to `legacyKeyId`. If the owner sets `ODDS_API_KEYS` without the old key in it, those
   rows simply match nothing (old key no longer used) - fine.
6. **Drizzle all-columns insert/select** (see Summary). Every `db.select().from(creditUsage)` must become
   an explicit column select; grep confirms the only one is `store.ts:184`.
7. **Bad/typo'd key looks like a fresh 500 and wins every time.** A 401 from `/sports` returns before any
   credits are spent, but the refresh then errors forever with the generic message. Using
   `listSportsWithQuota` surfaces this at zero cost; at minimum, `console.error` the fingerprint (never the
   key) on a non-OK `/sports` status so the owner can tell which key is bad. `[ASSUMED]` Odds API returns
   401 for an invalid or exhausted key (not documented in the pages fetched).
8. **Key leakage.** Current client is clean: catch blocks throw fixed messages, never the `URL` object or
   the caught error (`client.ts:71-82,119-132,167-183`), and `safeMessage` collapses everything else. Keep
   it that way: do not attach `{ cause: err }` (a fetch TypeError can carry the request), do not log `url`,
   and keep `selected key` out of `RefreshOutcome` except as `id`. `client.test.ts` already has a
   `SENTINEL_KEY` leak test (line ~52) - extend it to a multi-key case.
9. **Missing-key message drift.** `"ODDS_API_KEY is not set"` is matched by string equality in
   `refresh.ts:45` and `refreshExtended.ts:126` and asserted in `client.test.ts:73`. If the text changes
   (e.g. "No Odds API key is set (ODDS_API_KEYS / ODDS_API_KEY)"), change it in one shared constant.
10. **Env parsing.** Vercel and GitHub secrets store commas verbatim; trailing newline from `echo` is
    removed by the trim. Use interactive prompts so keys never hit shell history:
    `gh secret set ODDS_API_KEYS` (prompts, hidden) and `vercel env add ODDS_API_KEYS production`
    (prompts); Vercel needs a redeploy to pick up env changes. In `.env.local`, `ODDS_API_KEYS=a,b,c` needs
    no quotes (both dotenv and `tsx --env-file` handle it). `[ASSUMED]` exact CLI prompt behavior -
    standard for both CLIs.
11. **Tests have no key in env.** `vitest.config.ts` loads no `.env.local`; refresh tests work today only
    because `@/ingestion/odds/client` is mocked. If refresh.ts now resolves keys from env and returns
    "not set" when empty, `refresh-odds.test.ts`, `refresh-spreads-totals.test.ts`,
    `refreshExtended.test.ts` all break. Use `vi.stubEnv("ODDS_API_KEY", "test-key")` in their
    `beforeEach` (with `vi.unstubAllEnvs()` after), or mock `oddsKeys`.

## Tests That Need Updating

| File | Why |
|---|---|
| `src/ingestion/odds/client.test.ts` (:52-73) | explicit key param; keep sentinel no-leak and missing-key tests. |
| `src/app/actions/refresh-odds.test.ts` (:12-50) | `vi.mock("@/ingestion/odds/store")` factory must include any new store export (e.g. `getLatestCreditUsageByKey`) or calls hit `undefined`; env stub; assert `recordCreditUsage` gets `keyId`. |
| `src/app/actions/refresh-spreads-totals.test.ts` (:14) | same store-mock + env issues. |
| `src/ingestion/odds/refreshExtended.test.ts` (:10) | same. |
| `src/ingestion/odds/status.test.ts` (:11-23) | mocks `./store`; add per-key read mock; combined total/level cases; N=1 unchanged. |
| `src/ingestion/odds/morningObserve.test.ts` (:87) | missing-api-key case with `ODDS_API_KEYS` too. |
| `src/ingestion/odds/quota.test.ts` | unchanged if `pickKey` lives in `oddsKeys.ts`; add `oddsKeys.test.ts` (parse/trim/dedupe/fallback, fingerprint is 8 hex and != key, most-remaining pick, tie order, null->500, last-month row->500). |
| `src/app/api/cron/workflowConfig.test.ts` | currently asserts no env lines; add `ODDS_API_KEYS: ${{ secrets.ODDS_API_KEYS }}` and keep `ODDS_API_KEY` assertion. |
| new `src/db/undefinedColumn.test.ts` | mirror undefinedTable tests (cause chain, both message forms, other column -> false). |
| `find-arbs.test.ts`, `get-opportunities.test.ts`, `book-routing.test.ts` | reference credit/status symbols; re-run, likely untouched. |

Commands: `npx vitest run src/ingestion/odds src/app/actions src/app/api/cron src/db` (quick),
`npm test` (full), `npx tsc --noEmit`. All mocked - no credits spent.

## Workflow / env files

- `.github/workflows/scrape-promos.yml:92-94` (odds:morning-observe step env): add
  `ODDS_API_KEYS: ${{ secrets.ODDS_API_KEYS }}`, keep `ODDS_API_KEY`. An unset GitHub secret expands to
  an empty string -> parser yields `[]` -> falls back to `ODDS_API_KEY` (correct).
- `.env.example`: add `ODDS_API_KEYS=` with a comment (comma-separated, falls back to `ODDS_API_KEY`) and
  the missing `ANTHROPIC_API_KEY=` line.

## Assumptions Log

| # | Claim | Risk if Wrong |
|---|---|---|
| A1 | Invalid/exhausted key returns 401 with no quota headers | Bad-key handling message may differ; refresh still fails safely without spending. |
| A2 | `gh secret set` / `vercel env add` prompt for the value interactively | Owner may need `--body`/stdin form; keep keys out of shell history either way. |
| A3 | Postgres 42703 message forms for select vs. insert as listed | Matcher accepts bare code + any message containing `key_id`, so low risk. |

## Open Questions

1. If `ODDS_API_KEYS` is set and `ODDS_API_KEY` is not, who owns legacy null rows? Recommend: first key in
   `ODDS_API_KEYS` (the owner will likely list the current key first). Document in `.env.example`.
2. Should the confirm dialog / blocked message name the key? Recommend no (fingerprints mean nothing to
   members); keep copy unchanged.

## Sources

- Codebase (read directly): files/lines cited above; `node_modules/drizzle-orm/pg-core/dialect.js:370-390`.
- https://the-odds-api.com/liveapi/guides/v4/ - `/sports` free and returns x-requests-* headers (HIGH).
- https://the-odds-api.com/manage/faqs.html - credits reset on the first of every month (HIGH).
