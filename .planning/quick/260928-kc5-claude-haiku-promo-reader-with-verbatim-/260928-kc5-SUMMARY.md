---
phase: quick-260928-kc5
plan: 01
subsystem: ingestion
tags: [claude-haiku, anthropic-sdk, zod, decimal.js, verbatim-guard, promo-reading, vitest]

# Dependency graph
requires:
  - phase: 03 (promo ingestion/matching)
    provides: ScrapedPromoSchema, SkippedEntry/SkipEvidence, buildClassifyDraft/isReviewWorthySkip (reviewTriage.ts), runPromoScrape/BookRunOutcome, promoDedupeKey, decideClassifyWrite
  - phase: quick-260928-it1
    provides: SkipEvidence carried on every parser skip, CLEAR_SKIP_REASONS/REVIEW_SKIP_REASONS, the "classify" review-reason path
provides:
  - promoReading.ts: PromoReadingSchema (closed/structured-output schema), PROMO_READER_MODEL ("claude-haiku-4-5"), PROMO_READER_PROMPT_VERSION, PROMO_READER_SYSTEM_PROMPT, readerText, readingCacheKey
  - verbatimGuard.ts: guardReading -- pure verbatim-number guard with field-bound proof (% + "boost" word for boostPercent, "$" for money fields, signed odds with no $/% for minOdds), 80-char evidence cap, and same-source-occurrence collision dropping
  - reconcile.ts: reconcileEntry -- pure pattern-vs-reader reconciliation (agree/merged/rescued/pattern_only candidates; disagreement/guard_drop/reader_not_usable/rescue_needs_review/clear_reason_conflict review routing; agree_not_usable/pattern_only skip routing)
  - promoReader.ts: createPromoReader (cache-first, 60-call budget, 3-failure circuit breaker, typed-error fallback) + createDefaultPromoReader (null when ANTHROPIC_API_KEY unset)
  - readerCache.ts: Postgres-backed PromoReadingCache re-validating cached rows against PromoReadingSchema
  - readerPass.ts: applyPromoReader -- per-book reader pass producing a reconciled ParseResult + ReaderBookStats
  - run.ts: opts.reader wiring (default none), reader-pass exception isolation, BookRunOutcome.reader stats, buildClassifyWrites prefers a demoted candidate's own dedupeKey
  - scripts/scrape-promos.ts: --no-reader flag, ANTHROPIC_API_KEY-gated reader construction, total reader-usage/cost-estimate line
  - scripts/promo-reader-smoke.ts: opt-in live smoke script (one real API call, in-memory cache, exits 0 with no key)
  - drizzle/0007_promo_readings.sql: promo_readings content-addressed cache table (generated, not applied)
affects: [ingestion/promos, domain/promos, a future promo-reader-driven confidence/cost dashboard, the Promos-tab review queue (an existing live promo demoted by the reader is touched, not re-queued -- see Known Limitation below)]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk@0.129.0"]
  patterns:
    - "Field-bound verbatim guard: a numeric token only proves a field when it carries that field's own unit marker in the cited evidence ($ before money, % after + 'boost' word for boostPercent, signed with no $/% for odds) -- closes the cross-field mislabel hole where a boost-percent evidence string could otherwise back a maxStake value"
    - "One occurrence per field: two fields resolving to the same absolute source position (same evidence span cited twice) both drop, so a single number in the text can never double as two different fields' proof"
    - "Reconcile never silently drops a pattern-kept candidate -- every disagreement/guard-drop/reader-unusable outcome demotes to human review (with both readings visible in rawText), never to nothing"
    - "SkipEvidence.dedupeKey lets a demoted-candidate's classify write reuse promoDedupeKey(candidate) so store.ts's decideClassifyWrite 'touches' (keeps live) the promo's own existing row instead of expiring it or creating a duplicate pending_review row"
    - "Reader stats and the reconcile/guard modules are 100% pure and SDK-free (promoReading.ts/verbatimGuard.ts/reconcile.ts); only promoReader.ts touches the Anthropic client, and only readerCache.ts touches Postgres"

key-files:
  created:
    - src/ingestion/promos/promoReading.ts
    - src/ingestion/promos/promoReading.test.ts
    - src/ingestion/promos/verbatimGuard.ts
    - src/ingestion/promos/verbatimGuard.test.ts
    - src/ingestion/promos/reconcile.ts
    - src/ingestion/promos/reconcile.test.ts
    - src/ingestion/promos/promoReader.ts
    - src/ingestion/promos/promoReader.test.ts
    - src/ingestion/promos/readerCache.ts
    - src/ingestion/promos/readerPass.ts
    - drizzle/0007_promo_readings.sql
    - drizzle/meta/0007_snapshot.json
    - scripts/promo-reader-smoke.ts
  modified:
    - src/domain/promos/scraped.ts
    - src/db/schema.ts
    - drizzle/meta/_journal.json
    - src/ingestion/promos/run.ts
    - src/ingestion/promos/run.test.ts
    - src/ingestion/promos/boundary.test.ts
    - scripts/scrape-promos.ts
    - .github/workflows/scrape-promos.yml
    - package.json
    - package-lock.json

key-decisions:
  - "Used the zodOutputFormat structured-output path (client.messages.parse + zodOutputFormat(PromoReadingSchema) from @anthropic-ai/sdk/helpers/zod), not the json_schema + manual create()/safeParse fallback -- confirmed compiling cleanly against this project's zod@4.6.5 via npx tsc --noEmit before writing promoReader.ts"
  - "The verbatim guard's field-binding rules (percent-sign+boost-word, dollar-sign, signed-odds-no-$/%) are the load-bearing correctness mechanism -- without them a boost-percent evidence string could silently back a maxStake value, which the plan's checker explicitly flagged as the mislabel hole"
  - "A pattern-kept candidate can only ever be demoted to human review, never dropped, when the reader disagrees or the guard drops a field -- preserves PROMO-03's 'never silently lose a kept promo' guarantee"
  - "A reader-only rescue of a pattern skip requires high confidence, zero guard-dropped fields, a valid team count, and a full ScrapedPromoSchema pass -- anything less routes to review, never straight to active"

patterns-established:
  - "Pure guard/reconcile modules kept entirely separate from the SDK-touching promoReader.ts, so the correctness-critical number-verification logic is table-tested without ever mocking the network"
  - "createDefaultPromoReader as the single OD-3 gate: every caller (scripts/scrape-promos.ts, scripts/promo-reader-smoke.ts) either gets a real reader or null, never a half-configured one"

requirements-completed: [QUICK-260928-kc5, PROMO-03]

# Metrics
duration: ~55min
completed: 2026-09-28
---

# Quick Task 260928-kc5: Claude Haiku Promo Reader with Verbatim Guard Summary

**Claude Haiku 4.5 reads every scraped promo through structured outputs; a field-bound verbatim guard (boost % needs "%"+"boost", money needs "$", odds need a sign and neither) blocks any number the guard can't prove, and a pure reconcile module merges, rescues, or routes disagreements to human review -- all cached in Postgres so each promo text is billed at most once.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 4
- **Files created:** 13
- **Files modified:** 10

## Accomplishments

- `PromoReadingSchema` + system prompt + `readerText`/`readingCacheKey` (promoReading.ts) -- the exact contract sent to and cached against the model
- `guardReading` (verbatimGuard.ts) -- every numeric field needs a field-bound, <=80-char, verbatim evidence substring; mislabeled, malformed, wrong-sign, or double-counted numbers all drop to null
- `reconcileEntry` (reconcile.ts) -- pure pattern-vs-reader reconciliation covering agreement, disagreement, guard-drop, reader-unusable, rescue, and rescue-needs-review, all table-tested against the real DraftKings 2026-09-28 fixture
- `createPromoReader`/`createDefaultPromoReader` (promoReader.ts) -- cache-first reads, a 60-call-per-run budget, a 3-consecutive-failure circuit breaker, and typed-error-aware fallback, using the confirmed `zodOutputFormat` structured-output path
- `applyPromoReader` (readerPass.ts) + `run.ts` wiring -- candidates read first, then review-worthy skips, then the rest; a reader-pass exception (or every entry's reader.read() throwing) degrades to the unmodified pattern-parser result, never fails the book
- `--no-reader` flag, the `ANTHROPIC_API_KEY` workflow secret (scrape step only), the `@anthropic-ai/sdk` boundary guard, and an opt-in live smoke script

## Task Commits

1. **Task 1: Reading schema, verbatim guard, and the pure reconcile module** - `c64bc0f` (feat)
2. **Task 2: SDK install, the promo reader client, and the promo_readings table** - `cc6ebe5` (feat)
3. **Task 3: Per-book reader pass and run.ts wiring** - `bd47ab8` (feat)
4. **Task 4: --no-reader flag, workflow secret, boundary guard, and the live smoke script** - `022b8fc` (feat)

_No plan-metadata commit was made -- per this task's explicit constraints, STATE.md/PLAN.md/ROADMAP.md are left untouched and this SUMMARY.md is not committed._

## Files Created/Modified

- `src/ingestion/promos/promoReading.ts` - PromoReadingSchema, model/prompt-version constants, system prompt, readerText, readingCacheKey
- `src/ingestion/promos/verbatimGuard.ts` - guardReading, READER_NUMERIC_FIELDS, EVIDENCE_MAX_CHARS
- `src/ingestion/promos/reconcile.ts` - reconcileEntry, ReconcileEntry/ReconcileOutcome
- `src/domain/promos/scraped.ts` - added optional `SkipEvidence.dedupeKey`
- `src/ingestion/promos/promoReader.ts` - createPromoReader, createDefaultPromoReader, PromoReader/PromoReaderClient/PromoReadingCache types
- `src/ingestion/promos/readerCache.ts` - Postgres-backed promoReadingCache
- `src/db/schema.ts` - `promoReadings` pgTable
- `drizzle/0007_promo_readings.sql` + `drizzle/meta/0007_snapshot.json` + `drizzle/meta/_journal.json` - generated migration (not applied)
- `src/ingestion/promos/readerPass.ts` - applyPromoReader, ReaderBookStats
- `src/ingestion/promos/run.ts` - `opts.reader`, reader-pass wiring, `BookRunOutcome.reader`, dedupeKey-aware buildClassifyWrites
- `src/ingestion/promos/boundary.test.ts` - forbids `@anthropic-ai/sdk` from src/app and src/components
- `scripts/scrape-promos.ts` - `--no-reader`, reader construction/logging, total usage/cost line
- `scripts/promo-reader-smoke.ts` - opt-in live smoke script
- `.github/workflows/scrape-promos.yml` - `ANTHROPIC_API_KEY` on the scrape step only
- `package.json`/`package-lock.json` - `@anthropic-ai/sdk@0.129.0`, `promos:reader-smoke` script

## Decisions Made

- **zod-helper path:** used `zodOutputFormat` (not the JSON-schema + manual `create()`/`safeParse` fallback). Confirmed by a throwaway compile check (`npx tsc --noEmit`) against this project's `zod@4.6.5` before writing any promoReader.ts code; recorded as a header comment in promoReader.ts itself.
- Everything else followed the plan as written -- the field-binding guard rules, the reconcile rule ordering, and the readerPass priority order (candidates -> review-worthy skips -> rest) all match the plan's `<action>` blocks exactly.

## Deviations from Plan

None - plan executed exactly as written. Every table-driven case named in the plan's `<behavior>` blocks (guard mislabel/swap/same-occurrence/length cases; reconcile cases (a)-(j) including the mislabeled-rescue case (j)) has a corresponding passing test.

## Issues Encountered

None.

## Cost Estimate

Claude Haiku 4.5 pricing: $1/MTok input, $5/MTok output.

- System prompt: 2,866 characters -> ~717 tokens (measured, ~4 chars/token).
- An average entry's promo text: ~350-500 tokens.
- Output: ~250 tokens (a full structured reading).
- **Per call:** ~1,067-1,217 input tokens + ~250 output tokens -> **~$0.0023-$0.0025 per call**.
- **Worst case per run** (the 60-call cap, e.g. a first run with nothing cached): 60 x ~$0.0024 -> **~$0.14-$0.15**.
- **Expected steady state:** the content-hash cache means only a new or changed promo text is ever sent again -- with 3 scheduled runs/day across a handful of books, a typical day sees only a handful of genuinely new/changed entries (most promos repeat run-to-run and are pure cache hits), so the realistic steady-state cost is well under $1/month, a rounding error against the existing Odds API budget concern.

(No live smoke run was performed as part of this quick task -- the owner should run `npm run promos:reader-smoke` once ANTHROPIC_API_KEY is available to replace this estimate with real measured token counts.)

## Known Limitation

When the reader demotes an already-**live** promo (an existing `active`/`pending_review` row with the same dedupe key) to a "classify" review row, `SkipEvidence.dedupeKey` makes that classify write reuse the candidate's own dedupe key -- so `decideClassifyWrite` (lifecycle.ts) **touches** the existing row (keeps it live, bumps `lastSeenAt`) rather than expiring it or creating a duplicate. This is the correct, safe behavior (a live promo is never silently pulled), but it also means the disagreement/guard-drop/reader-unusable finding is **logged only** (one `console.warn` per routing, visible in the scrape job's output) -- it does **not** surface as a new item in the Promos-tab review queue UI for an already-first-seen promo. Only a genuinely **first-seen** promo (no existing row) actually lands in the visible review queue. A future plan could add a dedicated "flagged by reader" surface if this log-only signal proves insufficient in practice.

## User Setup Required

**Two manual steps, both outside this task's scope per its constraints (no live DB writes, no live API calls):**

1. **Apply migration 0007** against the production database once ready: `npm run db:migrate` (with `DATABASE_URL` set to the production Neon connection string). Until this runs, `promo_readings` doesn't exist yet -- the reader still works, but every cache read/write is caught and logged, and the reader simply runs uncached (still capped at 60 calls/run by `createDefaultPromoReader`).
2. **Add the `ANTHROPIC_API_KEY` GitHub Actions repo secret** (Settings -> Secrets and variables -> Actions) to enable the reader in the scheduled scrape job. Per OD-2, this key must never be added to `.env.local` -- it exists only as the Actions secret. Without it, the scrape step logs `promo reader: disabled (ANTHROPIC_API_KEY not set) -- pattern parsers only` and behaves exactly as it did before this quick task.

## Next Phase Readiness

The reader is fully wired but inert until both User Setup steps above are done -- the DK 2026-09-28 fixture's parsed output is byte-for-byte unchanged with no reader configured (pinned in run.test.ts), so shipping this commit changes nothing about production behavior until the owner opts in.

---
*Quick task: 260928-kc5*
*Completed: 2026-09-28*

## Self-Check: PASSED

All 13 created files verified present on disk; all 4 task commit hashes (c64bc0f, cc6ebe5, bd47ab8, 022b8fc) verified present in `git log`. Full `npx vitest run` (915 tests, 62 files), `npx tsc --noEmit` (clean apart from the pre-existing LayoutProps error), and `npm run lint` (clean) all passed as of the last commit.
