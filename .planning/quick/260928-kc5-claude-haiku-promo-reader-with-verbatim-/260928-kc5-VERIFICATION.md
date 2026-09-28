---
phase: quick-260928-kc5
verified: 2026-09-28T15:35:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Quick Task 260928-kc5: Claude Haiku Promo Reader Verification Report

**Goal:** Add a Claude Haiku 4.5 (model `claude-haiku-4-5`) promo reader to the scrape job, with structured outputs, a field-bound verbatim guard, pure reconciliation against the pattern parsers (never silently dropping a kept promo), a Postgres cache keyed by hash+prompt version, a 60-call/run budget with a circuit breaker, safe fallback on any failure, a `--no-reader` flag, a workflow secret, an SDK boundary guard, and byte-identical DK 2026-09-28 fixture output with no reader.

**Verified:** 2026-09-28
**Status:** passed
**Re-verification:** No — initial verification

## Method

Read every source file claimed in SUMMARY.md line-by-line (not just grepped for names), traced the guard's field-binding logic and the reconcile rule ordering by hand against the plan's table-driven behavior spec, cross-checked the SDK-usage checklist against `promoReader.ts`, ran the full test suite plus `tsc --noEmit` and `lint` myself, and ran the opt-in smoke script with no API key to confirm it never makes a live call. No live DB or API calls were made during verification.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every scraped entry read by claude-haiku-4-5 at most once per (prompt version, model, book, normalized text); cache hit makes no API call | VERIFIED | `readingCacheKey` (promoReading.ts:123-127) hashes `[PROMPT_VERSION, MODEL, bookKey, whitespace-normalized text]`. `promoReader.ts` read() checks `opts.cache.get(contentHash)` first and returns `{source:"cache"}` immediately on a schema-valid hit, before any budget/circuit-breaker check or `client.messages.parse` call (lines 96-113). |
| 2 | Field-bound verbatim guard: boost % needs "%"+boost word, money needs "$", odds sign-bound, no shared source occurrence, evidence ≤80 chars | VERIFIED | Traced `verbatimGuard.ts` `checkField()` line-by-line: boostPercent requires unsigned token, `followedByPercent()`, and `normEvidence.includes("boost")` (111-117); money fields require `precededByDollar()` (120-126); minOddsAmerican requires signed-token match, not followed by %, not preceded by $ (128-134); `EVIDENCE_MAX_CHARS=80` enforced before token-scan (85); same-position collision detection drops both fields (176-189). Table-driven tests cover mislabel/swap/same-occurrence/length cases exactly per plan (verbatimGuard.test.ts). `run.test.ts`'s disagreement case additionally proves this against the *real* DK fixture text end-to-end (a fabricated boostPercent="40.00" cannot be rescued by a guard-backed "50", it disagrees). |
| 3 | Money disagreement routes to review with both readings shown; a pattern-kept promo is never silently dropped | VERIFIED | `reconcile.ts` `reconcileCandidate()`: `reader_not_usable` and `guard_drop` both return `review` before disagreement is even checked; a promoType/money/int mismatch returns `review(disagreement)` (135-149). Every review path builds `buildReviewSkip` whose `rawText` embeds both `fmtParserEntry` and `fmtReader` (buildSummaryLine, lines 71-74). There is no code path in `reconcileCandidate` that drops a candidate outright — every non-agree/merge branch returns `review`, never `skip`. |
| 4 | Reader-only rescue becomes a candidate only at high confidence, every field guard-backed, and only after a ScrapedPromoSchema pass; CR-04 max-stake rule still applies | VERIFIED | `reconcileSkip()` gate: `reading.confidence === "high" && reading.droppedFields.length === 0 && teamsOk && sportOrTeams` before `ScrapedPromoSchema.safeParse` (248-253); anything failing returns `review(rescue_needs_review)`. Test case (j) (reconcile.test.ts:249-280) proves a mislabeled evidence citation ("Profit Boost: 50%" backing maxStake) is guard-dropped and never rescues. `unparsedCapFields.add("maxStake")` when a rescued profit_boost has null maxStake (reconcile.ts:240-242) feeds the pre-existing `statusAfterMatch`/`decideScrapedWrite` (lifecycle.ts) CR-04 enforcement, which routes a boost with no max stake to `pending_review/caps`, never `active` — confirmed by reading lifecycle.ts's existing (unmodified) CR-04 logic. |
| 5 | Missing key, `--no-reader`, API error, refusal, max_tokens, unparsed output, call cap, or any exception falls back to the pattern-parser result and never fails the job | VERIFIED | `createDefaultPromoReader` returns `null` when `ANTHROPIC_API_KEY` unset (promoReader.ts:176-181). `scripts/scrape-promos.ts` checks `--no-reader` before ever calling `createDefaultPromoReader` (35-44). `promoReader.ts` read() converts every failure mode (budget, circuit_open, api_error via catch, refusal, max_tokens, parsed_output null) into `{source:"fallback", reason:...}`, never throwing. `readerPass.ts applyPromoReader` wraps each entry in try/catch, falling back to `patternOnlyOutcome`. `run.ts` wraps the whole `applyPromoReader` call in try/catch, degrading to the unmodified `parseResult` with stats `fallbacks = entry count` (run.ts:290-317). `scrapeExitCode` (verified by reading scrape-promos.ts:86) never inspects reader stats. |
| 6 | DK 2026-09-28 fixture outcomes identical with no reader | VERIFIED | Ran `npx vitest run` myself: `run.test.ts`'s PIN test captures the baseline (candidate `1125873` only, `promosFound: 23`), and a second test asserts an always-fallback reader produces `commitScrapedPromos` args `toEqual` the no-reader baseline plus `reader.fallbacks === 23` (all 23 entries). Both tests pass. |
| 7 | Readings cached in `promo_readings`, keyed by hash + prompt version | VERIFIED | `src/db/schema.ts:284-291` defines `promoReadings` pgTable with `content_hash` PK, `book_key`, `model`, `prompt_version`, `reading` jsonb, `created_at`. `drizzle/0007_promo_readings.sql` matches; `readerCache.ts` implements get/put against it via `getDb()`; migration confirmed generated but not run (per plan constraint — not part of git-tracked `applied` state; owner step documented). |
| 8 | At most 60 calls/run with a circuit breaker; SDK boundary kept out of src/app and src/components | VERIFIED | `promoReader.ts`: `callCount >= maxCalls` → fallback "budget" (108-110, default 60); `consecutiveFailures >= circuitBreakAfter` → fallback "circuit_open" (111-113, default 3), reset to 0 on success (142). `boundary.test.ts` FORBIDDEN_IMPORT_RE includes `@anthropic-ai\/sdk` and `@\/ingestion\/promos`, scanning all of `src/app` and `src/components` (line 28, 32). Test passes. |

**Score:** 8/8 truths verified

### SDK Usage Checklist (promoReader.ts)

| Check | Status | Evidence |
|---|---|---|
| Model string exactly `"claude-haiku-4-5"` | VERIFIED | `promoReading.ts:20`: `export const PROMO_READER_MODEL = "claude-haiku-4-5";` used directly in the `parse()` call (promoReader.ts:120). |
| Call is `messages.parse` with `output_config.format` = `zodOutputFormat` | VERIFIED | promoReader.ts:118-127: `opts.client.messages.parse({..., output_config: { format: zodOutputFormat(PromoReadingSchema) }}, { timeout: timeoutMs })`, `zodOutputFormat` imported from `@anthropic-ai/sdk/helpers/zod`. |
| `parsed_output` null-guarded | VERIFIED | promoReader.ts:137-140: `if (response.parsed_output === null) { ...return fallback "parse_failed" }` before using it. |
| `stop_reason` refusal/max_tokens treated as failure | VERIFIED | promoReader.ts:129-136: both checked and converted to fallback before reading `parsed_output`. |
| No `thinking`/`effort` params | VERIFIED | Neither key appears anywhere in the `parse()` call object (lines 118-127). |
| Typed error handling | VERIFIED | `describeError()` (promoReader.ts:55-66) checks `Anthropic.RateLimitError`, `Anthropic.APIConnectionError`, `Anthropic.APIError` most-specific-first, falls to generic `Error`, then `"unknown error"`; every catch path (cache.get, cache.put, the parse call) routes through it, logging only class name + status + a 200-char-truncated message, never the key. |
| Timeout in ms | VERIFIED | `DEFAULT_TIMEOUT_MS = 30_000` (promoReader.ts:49) passed as the second `parse()` argument `{ timeout: timeoutMs }` (line 126) and to `new Anthropic({ timeout: DEFAULT_TIMEOUT_MS, maxRetries: 2 })` (line 179) — both are millisecond values per the plan's `claude_api_rules`. |

All seven SDK-usage checks verified by direct code reading, not by trusting SUMMARY.md's claim.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/ingestion/promos/promoReading.ts` | Schema/prompt/cache-key contract, contains `claude-haiku-4-5` | VERIFIED | Present, matches contract exactly (strict schema, no `.min/.max`, system prompt interpolates SPORT_KEYS/SKIP_REASONS, `readerText`/`readingCacheKey` as specified). |
| `src/ingestion/promos/verbatimGuard.ts` | `guardReading`, `READER_NUMERIC_FIELDS` | VERIFIED | Both exported; field-binding logic traced and correct. |
| `src/ingestion/promos/reconcile.ts` | `reconcileEntry` | VERIFIED | Exported; rule ordering matches plan exactly (usable check → guard_drop → disagreement → merge/agree for candidates; unusable/clear/rescue for skips). |
| `src/ingestion/promos/promoReader.ts` | `createPromoReader` | VERIFIED | Exported; cache-first, budget, circuit breaker, typed fallback all present and correct. |
| `src/ingestion/promos/readerCache.ts` | `promoReadingCache` | VERIFIED | Thin Postgres translation via `getDb()`, `onConflictDoNothing` on insert, no self-catching (by design — promoReader.ts catches). |
| `src/ingestion/promos/readerPass.ts` | `applyPromoReader` | VERIFIED | Priority ordering (candidates → review-worthy skips → rest) implemented; per-entry try/catch; stats bookkeeping matches spec. |
| `drizzle/0007_promo_readings.sql` | Table migration, not run | VERIFIED | Generated SQL matches schema.ts exactly; migration not applied (owner step documented in SUMMARY and PLAN's `user_setup`). |
| `scripts/promo-reader-smoke.ts` | Opt-in live smoke run | VERIFIED | Exits 0 with skip message when `ANTHROPIC_API_KEY` unset (confirmed by running it myself with `env -u ANTHROPIC_API_KEY`); uses in-memory cache, never touches `readerCache.ts`/DB. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `run.ts` | `readerPass.ts` | `applyPromoReader(...)` called after successful parse when `opts.reader` set | WIRED | run.ts:291-318, inside its own try/catch, before `skippedByReasonOf` and every later use of `parseResult`. |
| `readerPass.ts` | `verbatimGuard.ts` + `reconcile.ts` | `guardReading` then `reconcileEntry` per entry | WIRED | readerPass.ts:149-152: `guardReading(result.reading, text)` then `reconcileEntry(bookKey, entry, guarded, fallbackSourceUrl)`. |
| `scripts/scrape-promos.ts` | `promoReader.ts` | `createDefaultPromoReader` gated on key + `--no-reader` | WIRED | scrape-promos.ts:35-44. |
| `.github/workflows/scrape-promos.yml` | `ANTHROPIC_API_KEY` secret | env on scrape step only | WIRED | Confirmed secret present only on the `npm run scrape:promos` step (line 59), absent from the `odds:morning-observe` step. |
| `run.ts buildClassifyWrites` | `SkipEvidence.dedupeKey` | demoted candidate keeps its own dedupe key | WIRED | run.ts:116: `const dedupeKey = skip.evidence?.dedupeKey ?? promoDedupeKey(draft);` — confirmed by the disagreement test asserting the classify write's dedupeKey equals `promoDedupeKey` of the original real candidate. |

### Behavioral Spot-Checks / Tests Run

| Behavior | Command | Result | Status |
|---|---|---|---|
| New reader test files pass | `npx vitest run src/ingestion/promos/{promoReading,verbatimGuard,reconcile,promoReader,run,boundary}.test.ts src/domain/promos` | 20 files, 297 tests passed | PASS |
| Full repo test suite (regression) | `npx vitest run` | 62 files, 915 tests passed | PASS |
| Type-check | `npx tsc --noEmit` | Clean apart from pre-existing LayoutProps error | PASS |
| Lint | `npm run lint` | No output, clean | PASS |
| Smoke script with no key (no live calls) | `env -u ANTHROPIC_API_KEY npx tsx scripts/promo-reader-smoke.ts` | Printed "ANTHROPIC_API_KEY not set -- skipping live smoke", exit 0 | PASS |
| Debt-marker scan | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on all 9 new/modified reader files | No matches | PASS |

No live DB or API calls were made at any point during this verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| QUICK-260928-kc5 | 260928-kc5-PLAN.md | This quick task's own scope | SATISFIED | All 8 must-have truths verified above. |
| PROMO-03 | 260928-kc5-PLAN.md | Promo ingestion/matching (reader augments this) | SATISFIED | Reader integrates into the existing PROMO-03 pipeline without changing its default (no-reader) behavior, confirmed by the pinned fixture test. |

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, no empty stub implementations, no hardcoded-empty data paths in any of the 9 reader-related source files. The one documented "Known Limitation" (a demoted candidate for an already-live promo is logged but not re-queued in the UI) is an explicit, intentional design decision recorded in both reconcile.ts's comments and the SUMMARY, not a stub.

### Human Verification Required

None. All must-haves are verifiable by code inspection, unit tests, and safe (no-key, no-DB) script execution. The two remaining owner action items (apply migration 0007 against production Neon; add the `ANTHROPIC_API_KEY` GitHub Actions secret) are explicitly out-of-scope manual deployment steps documented in both the PLAN's `user_setup` and the SUMMARY's "User Setup Required" section — they do not block this quick task's own goal, which is that the reader code exists, is correct, and is inert (falls back to pattern parsers) until those two steps are done.

### Gaps Summary

No gaps found. Every observable truth, artifact, and key link traced directly against the source code (not just SUMMARY.md's narrative) holds up. The guard's field-binding rules were read line-by-line and confirmed to implement the exact boost-%/money-$/odds-sign/no-shared-occurrence/80-char rules required. The reconcile module's rule ordering matches the plan's spec precisely, including the subtle case (j) mislabeled-rescue guard that the plan calls out as "the checker's blocker" — a dedicated test proves the guard fires before reconcile even sees a shot at rescuing. The SDK-usage checklist (model string, messages.parse + zodOutputFormat, null-guarded parsed_output, refusal/max_tokens-as-failure, no thinking/effort, typed error handling, millisecond timeout) is fully satisfied by direct inspection. The DK fixture's identical-output claim is proven by an actual passing regression test, not just asserted. The full test suite (915 tests), tsc, and lint all pass as run directly by this verifier.

---

_Verified: 2026-09-28_
_Verifier: Claude (gsd-verifier)_
