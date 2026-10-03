---
phase: 03-promo-scraping-review
plan: 06
subsystem: api
tags: [drizzle, decimal.js, promos, scraping, scrape-runs, github-actions, vitest]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-05 ScrapedPromo/BookScraper contract, promoDedupeKey, statusAfterMatch; 03-12/13/14 ballybetScraper/draftkingsScraper/fanduelScraper"
provides:
  - "src/ingestion/promos/fetchPage.ts — fetchRequest (plain fetch, 30s timeout, 5MB cap, no cookies/auth/proxy/anti-bot headers)"
  - "src/ingestion/promos/store.ts — recordScrapeRun, upsertScrapedPromos (D-19 dedupe/lifecycle), expireMissingPromos, promoStore"
  - "src/ingestion/promos/run.ts — runPromoScrape orchestrator (per-book try/catch isolation, D-08; >=2s polite cadence across the whole run)"
  - "src/ingestion/promos/books/index.ts — BOOK_SCRAPERS registry (ballybet, draftkings, fanduel)"
  - "src/config/scrapeTargets.ts — SCRAPE_TARGET_BOOK_KEYS now all three D-09 http books"
  - "scripts/scrape-promos.ts — CLI entry (npm run scrape:promos)"
  - ".github/workflows/scrape-promos.yml — first workflow in the repo, scheduled 8am/noon/5pm America/Denver + manual dispatch"
  - "src/ingestion/promos/boundary.test.ts — permanent scraper/app-router + no-playwright/puppeteer + no-cookie/x-px-context guard"
  - "First real scrape landed in Neon: 2 live pending_review promos (Bally Bet, DraftKings)"
affects: [03-07, 03-08, 03-09, 03-10, 03-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Polite cadence is run-wide, not per-book: run.ts shares one requestCount across every target so the gap holds between the last request of one book and the first request of the next, not just within a single book's own list+detail sequence"
    - "Per-book try/catch wraps the ENTIRE book body (fetch, planDetails, parse, store calls) so a failure at any point in that book's pipeline is isolated (D-08) without needing a separate catch per step"
    - "store.ts's revive-from-expired path deliberately does NOT refresh cap/structured columns from the new parse (unlike the active/pending_review refresh path, which does) -- an expired promo that reappears keeps its prior known caps rather than trusting a possibly-different re-scrape of the same identity; only status/reviewReason/unparsedCapFields (via statusAfterMatch on the row's own stored fields) and last_seen_at change"

key-files:
  created:
    - src/ingestion/promos/fetchPage.ts
    - src/ingestion/promos/store.ts
    - src/ingestion/promos/run.ts
    - src/ingestion/promos/run.test.ts
    - src/ingestion/promos/books/index.ts
    - src/ingestion/promos/boundary.test.ts
    - scripts/scrape-promos.ts
    - .github/workflows/scrape-promos.yml
  modified:
    - src/config/scrapeTargets.ts
    - package.json
    - src/app/actions/get-promos.test.ts

key-decisions:
  - "books/index.ts (BOOK_SCRAPERS registry) was created in Task 1 rather than Task 2 as the plan's file list assigns it: run.ts's own documented default parameter (scrapers = BOOK_SCRAPERS) requires that module to exist for Task 1's own npm run typecheck to pass. Task 2 left the file untouched (matches the plan's intended final content) and only added its scrapeTargets.ts/CLI/workflow/boundary-test half of the registration story."
  - "store.ts's expired-promo revival path does not re-copy cap/structured fields from the new parse (only the active/pending_review refresh branch does) -- read literally from the plan's own wording ('set status from statusAfterMatch(row fields)' vs. the active/pending_review branch's explicit 'from the new parse'), and consistent with D-19's framing of revival as 'keeping' prior data rather than re-trusting a fresh scrape of the same identity."

patterns-established:
  - "Pattern: a plan task whose own documented interface references a file nominally owned by a later task in the same plan gets that file pulled forward to the earlier task (with a doc-comment/deviation note), rather than stubbing it or splitting the import -- avoids a fake intermediate state that would never itself be committed."

requirements-completed: [PROMO-03]

# Metrics
duration: 38min
completed: 2026-09-27
---

# Phase 3 Plan 6: Promo Scrape Pipeline, Scheduled Workflow, First Live Scrape Summary

**Polite plain-HTTP fetch -> D-19 dedupe/lifecycle Postgres writer -> per-book isolated orchestrator, wired to all three owner-cleared books (Bally Bet, DraftKings, FanDuel) and a GitHub Actions schedule, then run twice for real against the live Neon DB: 2 real pending_review promos landed (a 10% Bally Bet Rams-Broncos boost, a 50% DraftKings NFL boost), with zero duplicate rows on the second run.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-09-27T00:26:00-06:00 (worktree setup)
- **Completed:** 2026-09-27T00:41:00-06:00 (live scrape verification)
- **Tasks:** 3 completed (Task 1 TDD RED->GREEN, Task 2 straight auto, Task 3 live run)
- **Files modified:** 8 created, 3 modified

## Accomplishments

- `fetchPage.ts`'s `fetchRequest` is the scraper's only network call: plain global `fetch`, 30s `AbortSignal.timeout`, a 5,000,000-char response cap, and a file that contains zero occurrences of `cookie`/`authorization`/`proxy`/`x-px` outside comments (verified by the plan's own acceptance grep) -- D-09 enforced structurally, not just by convention.
- `store.ts` implements the full D-19 lifecycle in one `db.batch` transaction per call: new dedupe keys insert `pending_review/match`; `dismissed` rows are skipped and counted, never revived (D-14); `active`/`pending_review` rows always advance `last_seen_at`, and refresh `expires_at`+every structured/cap column+the raw `parsed` payload from the new parse *only* when `cap_entered_by_user_id` is null (a member-entered cap is never silently overwritten); `expired` rows revive, keeping their prior scope only when a human confirmed/corrected it (otherwise clearing scope/pin columns back to `pending_review/match`).
- `run.ts`'s `runPromoScrape` runs `SCRAPE_TARGET_BOOK_KEYS` sequentially, each book in its own try/catch (D-08 isolation covers fetch throwing, `planDetails` throwing, `parse` throwing, and the store throwing), with one shared `politeFetch` wrapper enforcing >=2000ms between every HTTP request across the *entire* run (not just within one book), a defensive re-cap of `planDetails`' output at `scraper.maxDetailRequests`, duplicate-dedupe-key collapse within a run, and truthful `ok`/`failed` `scrape_runs` recording (a `recordScrapeRun` failure is logged and never masks the outcome). 11/11 behavior cases from the plan pass.
- `BOOK_SCRAPERS` registers all three Plan 12-14 parsers; `SCRAPE_TARGET_BOOK_KEYS` now targets `["ballybet", "draftkings", "fanduel"]` with a doc comment recording why every other Colorado book is `skip` (BetRivers loyalty-store dead end, BetMGM/theScore login-gated, Caesars 403, Fanatics app-only, Hard Rock not found).
- `scripts/scrape-promos.ts` (CLI, `npm run scrape:promos`) loads `.env.local` via `dotenv.config()` (a no-op when absent, unlike `tsx --env-file` which errors on a missing file -- CI never has one) and exits 1 if any book failed.
- `.github/workflows/scrape-promos.yml` -- the first workflow in the repo -- schedules `cron: "0 8,12,17 * * *"` with `timezone: "America/Denver"` (DST-correct without a manual offset flip) plus `workflow_dispatch`, installs no browser, and only reads `secrets.DATABASE_URL` (zero Odds API credits, D-07). Not enabled/pushed this plan -- Plan 11 owns that owner-approved step.
- `boundary.test.ts` permanently guards: (1) no file under `src/app`/`src/components` imports `cheerio`/`playwright(-extra)`/`puppeteer`/`@/ingestion/promos`; (2) root `package.json` never depends on `playwright`/`puppeteer`; (3) no non-test file under `src/ingestion/promos/books` contains `cookie` or `x-px-context` (locks in D-09).
- **First real scrape (Task 3):** ran `npm run scrape:promos` once against the three live APIs and the live Neon DB, then again to prove dedupe (D-19) -- both owner-approved, logged-out, sequential, >=2s apart, well under the 6-detail-request cap per book. Results:

  | Book | Run 1 (found/kept) | Run 2 (found/kept) | Detail reqs | Skip reasons |
  |---|---|---|---|---|
  | Bally Bet | 19 / 1 | 19 / 1 | 1 | not_a_promo:10, parlay:3, sgp:1, futures:1, live_only:1, unsupported_sport:1, new_customer:1 |
  | DraftKings | 20 / 1 | 20 / 1 | 0 | new_customer:6, not_a_promo:10, sgp:2, futures:1 |
  | FanDuel | 12 / 0 | 12 / 0 | 0 | new_customer:2, not_a_promo:8, unsupported_sport:1, outright:1 |

  All three books recorded `ok` both times (`promos:check`: 6 `scrape_runs` rows total, 2 `pending_review` promos, unchanged across both runs -- confirming D-19 dedupe live). The two kept promos match 03-RECON.md's Observed Promos shapes exactly: Bally Bet's `"10% LA Rams vs. DEN Broncos Profit Boost"` (game-wide, `boostPercent "10.00"`, `maxStake "20.00"`, `minOddsAmerican 100`, `unparsedCapFields: []`, matching Observed Promos row 1) and DraftKings' `"NFL 50% Profit Boost"` (sport-wide, `boostPercent "50.00"`, `maxStake "25.00"`, `minOddsAmerican -200`, matching Observed Promos row 4). FanDuel's `kept: 0` is not a parser bug: 03-RECON.md's Observed Promos row 6 recorded the CFB boost token's `combinedEndDate` as `2026-09-27T06:00:00Z`, and this run happened at `06:38:31Z` -- 38 minutes after that exact token expired and was presumably rotated out of FanDuel's live feed. `run.ts`'s own "found>0, kept=0 is still `ok`" behavior (D-08) is exactly what should happen here.

## Task Commits

Each task was committed atomically:

1. **Task 1: Polite HTTP fetch, persistence with dedupe/expiry lifecycle, per-book run orchestration** (TDD)
   - `c31e754` (test) -- RED: `run.test.ts` (11 tests, failing on missing modules)
   - `706984a` (feat) -- GREEN: `fetchPage.ts`, `store.ts`, `run.ts`, plus `books/index.ts` pulled forward from Task 2 (see Decisions); 11/11 passing
2. **Task 2: Register the three books, CLI entry, scheduled workflow, import/dependency boundary guard**
   - `2a8e13a` (feat) -- `scrapeTargets.ts`, `scripts/scrape-promos.ts`, `package.json`, `.github/workflows/scrape-promos.yml`, `boundary.test.ts`; also fixes `get-promos.test.ts` (see Deviations)
3. **Task 3: First real scrape of all three books against the live APIs and live database**
   - No commit -- pure execution/verification (`npm run scrape:promos` x2, `npm run promos:check`), no code changes required. Results captured above and verified against the live Neon DB.

_No separate "Plan metadata" commit yet -- SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/ingestion/promos/fetchPage.ts` -- `fetchRequest`/`FetchRequest`/`FetchResult`
- `src/ingestion/promos/store.ts` -- `recordScrapeRun`, `upsertScrapedPromos`, `expireMissingPromos`, `promoStore`, `PromoWrite`/`PromoStore`/`ScrapeRunRow`/`UpsertOutcome`
- `src/ingestion/promos/run.ts` -- `runPromoScrape`, `BookRunOutcome`
- `src/ingestion/promos/run.test.ts` -- 11 tests covering the full behavior list
- `src/ingestion/promos/books/index.ts` -- `BOOK_SCRAPERS`
- `src/ingestion/promos/boundary.test.ts` -- 3 permanent guard tests
- `src/config/scrapeTargets.ts` -- `SCRAPE_TARGET_BOOK_KEYS` now all three books
- `scripts/scrape-promos.ts` -- CLI entry
- `.github/workflows/scrape-promos.yml` -- scheduled + manual workflow
- `package.json` -- adds `"scrape:promos"` script (one line, no dependency changes)
- `src/app/actions/get-promos.test.ts` -- two assertions updated for the real three-book `scrapeStatus` shape (see Deviations)

## Decisions Made

- `books/index.ts` was authored in Task 1, not Task 2, because `run.ts`'s own plan-documented default parameter (`scrapers = BOOK_SCRAPERS`) requires the module to exist for Task 1's own `npm run typecheck` gate to pass -- there's no way to satisfy Task 1's stated interface without it. Task 2 left the file's content exactly as it already was.
- `store.ts`'s expired-promo revival path does not refresh cap/structured columns from the new parse, unlike the active/pending_review refresh branch. The plan's action text explicitly says the active/pending_review branch updates "from the new parse", but doesn't repeat that phrase for the expired-revival branch ("set status from statusAfterMatch(row fields)") -- read literally, "row fields" means the row's own already-stored values, not the incoming parse. This also matches D-19's own framing of revival as "keeping a prior human-confirmed scope" (preserving, not re-trusting a fresh scrape of the same identity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `books/index.ts` created in Task 1 instead of Task 2**
- **Found during:** Task 1, writing `run.ts`'s documented default parameters
- **Issue:** The plan's own interfaces block specifies `run.ts`'s defaults as `scrapers = BOOK_SCRAPERS`, but `books/index.ts` is in Task 2's file list, not Task 1's. Task 1's own verification (`npm run typecheck`) cannot pass without that module existing.
- **Fix:** Created `books/index.ts` (registering `ballybetScraper`/`draftkingsScraper`/`fanduelScraper`, already committed from Plans 12-14) as part of Task 1's GREEN commit. Task 2 made no further changes to this file.
- **Files modified:** `src/ingestion/promos/books/index.ts`
- **Verification:** `npm run typecheck` and `npx vitest run src/ingestion/promos/run.test.ts` both pass at the end of Task 1.
- **Committed in:** `706984a` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking issue] `get-promos.test.ts` hardcoded a single-book `scrapeStatus` shape**
- **Found during:** Task 2, `npx vitest run` (full suite) after widening `SCRAPE_TARGET_BOOK_KEYS` to three books
- **Issue:** Two assertions in `get-promos.test.ts` (not in this plan's `files_modified` list) expected `result.scrapeStatus` to contain exactly one entry (`ballybet`), a leftover from when `SCRAPE_TARGET_BOOK_KEYS` was `["ballybet"]` only (Plan 03). `getPromos`'s own production code (`get-promos.ts`) was already correct -- it maps over every book in `COLORADO_BOOKS` filtered by `SCRAPE_TARGET_BOOK_KEYS` and sorted by `sortOrder`, so widening the target list to three books correctly produced three `scrapeStatus` entries (ordered `draftkings`, `fanduel`, `ballybet` per `config/books.ts`'s `sortOrder`), which the test's stale two-book-unaware assertions then failed on.
- **Fix:** Updated both assertions to the real three-book, `sortOrder`-ordered shape; the second assertion switched from a brittle `scrapeStatus[0]` index lookup to `.find((line) => line.bookKey === "ballybet")` so it stays correct regardless of book ordering.
- **Files modified:** `src/app/actions/get-promos.test.ts`
- **Verification:** Full suite (517/517) passes; `npm run typecheck`, `npm run lint`, and `npx next build --webpack` all green.
- **Committed in:** `2a8e13a` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues, both direct consequences of this plan's own file-list/target-list changes). No scope creep, no architectural change.
**Impact on plan:** Both fixes were required for this plan's own stated tasks to compile and pass; neither changes production behavior beyond what the plan itself specifies.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` -- symlinked all three from the primary checkout per the parallel-execution setup instructions; unlinked before returning, never committed.
- FanDuel's live scrape kept 0 candidates both runs -- investigated by reading the two persisted rows directly from the live Neon DB (no extra sportsbook network requests) rather than making a third live FanDuel request, per this plan's strict network budget (own-run only, no ad-hoc probing). Concluded it's timing (the recon-captured CFB boost token's `combinedEndDate` had passed 38 minutes before this run), not a parser bug -- see Accomplishments.

## User Setup Required

None -- this plan makes no GitHub secrets changes and does not push/enable the workflow (explicitly owner-approved and deferred to Plan 11). The live scrape used the existing `DATABASE_URL` already present in `.env.local`; no new external service configuration was needed.

## Next Phase Readiness

- Plan 07 (`describe.ts`) and Plans 08-10 (matcher, review actions, flag-back) have two real `pending_review/match` promos in the live DB to work against end-to-end, in addition to whatever fixtures they already have.
- Plan 11 (owner-approved GitHub push + secrets) can push `.github/workflows/scrape-promos.yml` as-is and set `DATABASE_URL` as a repo secret -- this plan intentionally made no git-remote or secrets changes.
- The Promos tab's scrape-status panel (Plan 03/15) now has real, truthful per-book freshness to show for all three books instead of just Bally Bet.
- No blockers. FanDuel's current 0-kept state is expected to change on the next real (recurring) scrape once new promos rotate onto its feed -- no code changes are needed for that.

## Known Stubs

None -- this plan is a pure ingestion-pipeline/infra plan with no UI or partially-wired data-flow surface.

## Self-Check: PASSED

- `src/ingestion/promos/fetchPage.ts` -- FOUND
- `src/ingestion/promos/store.ts` -- FOUND
- `src/ingestion/promos/run.ts` -- FOUND
- `src/ingestion/promos/run.test.ts` -- FOUND
- `src/ingestion/promos/books/index.ts` -- FOUND
- `src/ingestion/promos/boundary.test.ts` -- FOUND
- `scripts/scrape-promos.ts` -- FOUND
- `.github/workflows/scrape-promos.yml` -- FOUND
- Commit `c31e754` -- FOUND in `git log --oneline`
- Commit `706984a` -- FOUND in `git log --oneline`
- Commit `2a8e13a` -- FOUND in `git log --oneline`
- Full repo test suite: 517/517 passing; `npm run typecheck`, `npm run lint`, `npx next build --webpack` all clean.
- Live DB verified via `npm run promos:check`: 6 `scrape_runs` rows (3 books x 2 runs, all `ok`), 2 `pending_review` promos, unchanged row count across both runs (D-19 dedupe confirmed).

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
