---
phase: 03-promo-scraping-review
plan: 14
subsystem: ingestion
tags: [zod, decimal.js, promos, scraping, parsing, fanduel, vitest]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-05 ScrapedPromoSchema/BookScraper contract and shared parsing helpers (finePrint, exclusions, sportHints, promoText, etTime)"
provides:
  - "src/ingestion/promos/books/fanduel.ts — fanduelScraper: BookScraper (list + detail requests, planDetails, parse)"
affects: [03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Title-level classification shared between planDetails and parse via one classifyFanduelEntry function, so the entries fetched for detail are exactly the entries that become candidates"
    - "A book-specific 'names a boost/bonus token' gate (profit boost / odds boost / boost token / bonus bet(s) / PBT wording) runs before the sport-support check — an entry that never names one of these tokens is not_a_promo regardless of its tags"
    - "Degraded list-only fallback path (no detail body fetched) hardcodes maxStake and minOdds as always-unparsed, distinct from the with-detail path's per-field CapParse result — FanDuel's list one-liner never states either field, so the app must not guess even by omission"

key-files:
  created:
    - src/ingestion/promos/books/fanduel.ts
    - src/ingestion/promos/books/fanduel.test.ts
  modified:
    - src/ingestion/promos/exclusions.ts
    - src/ingestion/promos/finePrint.ts

key-decisions:
  - "classifyFanduelEntry checks FanDuel-specific new-customer signals (acq tag substring, 'first wager'/'new customers'/'new user' wording) before the shared classifyExclusion, since classifyExclusion's own new-customer regex doesn't cover 'first wager' — needed to correctly route ACQB5G50BB921 to new_customer instead of falling through to the boost-token-name gate"
  - "The boost/bonus-token-name gate runs after classifyExclusion but before the sport-support check, so a title-level exclusion (e.g. LOGOLFPBT0924's Presidents Cup outright wording) always wins over the entry's own sport tag, and a title with no boost/bonus wording at all (LORTCTST26, FACEOFFPROMO4, MLBPHSTATIC0901, APVTNFSTATIC0917) is classified not_a_promo even when its tags would otherwise resolve to a supported sport"

patterns-established:
  - "Pattern: when a plan's two tasks share the same output files (fanduel.ts + fanduel.test.ts for both Task 1 and Task 2), commit as test(RED) -> fix(shared-helper bugs, if any) -> feat(GREEN) once, rather than forcing two separate RED/GREEN pairs against files that were authored together"

requirements-completed: [PROMO-03, PROMO-04]

# Metrics
duration: 32min
completed: 2026-09-27
---

# Phase 3 Plan 14: FanDuel Parser Summary

**FanDuel's real logged-out promo API (list + detail JSON) parses into one validated sport-wide profit-boost candidate — the College Football Profit Boost token — with its hidden max wager routed to the cap-review queue, and correctly classifies all 11 other list entries (new-customer offers, an outright golf token, an unsupported soccer token, and six non-promo/static entries) via a single shared classification function reused by both `planDetails` and `parse`.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-09-27T00:02:00-06:00 (session start / symlink setup)
- **Completed:** 2026-09-27T00:15:21-06:00 (last task commit)
- **Tasks:** 2 completed (both TDD RED -> GREEN, delivered as one test/fix/feat commit sequence since both tasks share the same two files)
- **Files modified:** 2 created, 2 modified

## Accomplishments

- `fanduelScraper` (`BookScraper`, `bookKey: "fanduel"`, `maxDetailRequests: 6`) issues a verbatim GET to the Contract's promotions list URL with exactly the Contract headers (`x-sportsbook-region: CO`, `accept`, `referer`, a real desktop Chrome UA) and `body: null` — no PerimeterX header is ever sent or forged (D-09, T-03-14-03), verified by an acceptance-criteria grep that finds zero matches for `x-px`/`cookie`/`authorization`/`password`/`merchandising` in the file
- `classifyFanduelEntry`, shared verbatim by `planDetails` and `parse`, classifies all 12 real FanDuel list entries exactly per 03-RECON.md: the CFB boost token survives as the sole candidate; `LOSOCCERPB0925` -> `unsupported_sport`; `LOGOLFPBT0924` -> `outright`; `ACQPECBB1G100ST`/`ACQB5G50BB921` -> `new_customer`; the remaining six (`CFBPICKFTPST0923`, `BPNEPSEAST0902`, `LORTCTST26`, `FACEOFFPROMO4`, `RAF092126STAT`, `MLBPHSTATIC0901`, `APVTNFSTATIC0917`) -> `not_a_promo`
- `planDetails` fetches details only for the surviving entry (one real request), and a synthetic 10-boost-token list confirms the 6-request polite cadence cap (Design Implication 7)
- `parse` builds the CFB candidate field-by-field from the real detail fixture: `boostPercent "50.00"`, `minOddsAmerican -200` (from `"-200 or Longer"`), `maxStake null` with `unparsedCapFields ["maxStake"]` (FanDuel's real "up to a maximum wager. Log in for more details." text, D-18), `sportKeyHint "americanfootball_ncaaf"`, `scopeText` containing `"College Football Games on September 26th, 2026"`, `windowStart`/`windowEnd`/`expiresAt` matching the recon-derived slate window (extended to the 2:00 AM ET expiry via `slateWindow`), and `claimRequired "claim_token"`
- A degraded list-only fallback (no detail body fetched) still recovers `boostPercent` and the scope/window from the list `.name` one-liner, but always marks both `maxStake` and `minOdds` unparsed — FanDuel's list text never states either field, so the app must not guess even by omission
- A forced-invalid synthetic candidate (a boost token with no parseable percentage) is skipped as `schema_invalid` with a `console.warn`, never thrown

## Task Commits

Both tasks share the same two output files (`fanduel.ts`, `fanduel.test.ts`), so they were delivered as one RED -> fix -> GREEN sequence rather than two separate task-scoped commit pairs:

1. `fd97c39` (test) — RED: `fanduel.test.ts` — 20 test cases covering both tasks' behavior lists (Task 1: request shape, classification via skipped reasons, detail-plan cap, malformed-input handling; Task 2: field-by-field CFB assertions, list-only fallback, forced schema_invalid)
2. `9a1d406` (fix) — two pre-existing bugs in Plan 05's shared helpers, surfaced by real FanDuel fixture text (see Deviations)
3. `a316e2c` (feat) — GREEN: `fanduel.ts` — `fanduelScraper` implementation; all 20 tests pass

## Files Created/Modified

- `src/ingestion/promos/books/fanduel.ts` — `fanduelScraper`, `FANDUEL_MAX_DETAIL_REQUESTS`
- `src/ingestion/promos/books/fanduel.test.ts` — 20 tests across both tasks
- `src/ingestion/promos/exclusions.ts` — widened `NOT_A_PROMO_RE`'s pick'em pattern to accept a curly apostrophe (bug fix)
- `src/ingestion/promos/finePrint.ts` — `isMaxWinningsMention` now defers to a max-stake mention on the same line (bug fix)

## Decisions Made

- `classifyFanduelEntry` checks FanDuel-specific new-customer signals (an "acq" tag substring, or "first wager"/"new customers"/"new user" wording) *before* the shared `classifyExclusion`, because `classifyExclusion`'s own new-customer regex doesn't cover "first wager" — without this, `ACQB5G50BB921` (whose title has no "new customer" wording, only "Place your first wager now!") would have fallen through to the boost/bonus-token-name gate and been misclassified as a genuine candidate (it does contain "Bonus Bets" wording).
- The boost/bonus-token-name gate (`profit boost` / `odds boost` / `boost token` / `bonus bet(s)` / `pbt`) runs after `classifyExclusion` but before the sport-support check. This ordering is required by the real fixture data: `LOGOLFPBT0924` (Golf, tagged `golf` which is unsupported) must classify as `outright` (its title-level exclusion), not `unsupported_sport` — exclusion wins. Conversely, `MLBPHSTATIC0901` and `APVTNFSTATIC0917` carry *supported* sport tags (`mlb`, `nfl`) but name no boost/bonus token at all — the token-name gate must catch these as `not_a_promo` even though their sport tag alone would otherwise let them through.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug, blocking] `exclusions.ts`'s pick'em pattern didn't match FanDuel's real curly apostrophe**
- **Found during:** Task 1, first RED->GREEN pass classifying `CFBPICKFTPST0923` ("College Football Pick'em", using U+2019 RIGHT SINGLE QUOTATION MARK, not a straight `'`)
- **Issue:** `NOT_A_PROMO_RE`'s `\bpick\s*'?em\b` only allowed an optional *straight* apostrophe between "pick" and "em"; FanDuel's real title text uses the curly variant, so the regex silently failed to match and the entry fell through to the boost/bonus-token-name gate (where it also has no boost/bonus wording in its title, so it would have still resolved to `not_a_promo` by coincidence via that gate — but the plan's behavior list requires this specific case to be a `classifyExclusion`-driven `not_a_promo`, and relying on the token-name gate instead would have been the wrong reason path if the title ever gained boost-shaped wording).
- **Fix:** Widened the apostrophe character class to `['’]?` so both straight and curly apostrophes match.
- **Files modified:** `src/ingestion/promos/exclusions.ts`
- **Verification:** All 12 existing `exclusions.test.ts` cases still pass (curly-apostrophe case wasn't previously tested there); FanDuel's `CFBPICKFTPST0923` now classifies as `not_a_promo` via `classifyExclusion` directly.
- **Committed in:** `9a1d406`

**2. [Rule 1/3 - Bug, blocking] `finePrint.ts`'s `isMaxWinningsMention` false-positived on FanDuel's real cap sentence**
- **Found during:** Task 2, first RED->GREEN pass on the CFB boost's field-by-field assertions
- **Issue:** `isMaxWinningsMention` matched any line containing both a "max" keyword and a winnings/payout/profit keyword. FanDuel's real detail sentence — `"Profit Boost Token is valid for use on ANY wager, -200 or Longer, for any College Football Games on September 26th, 2026, up to a maximum wager. Log in for more details."` — contains "Profit" (from the token's own name) *and* "maximum wager" (the actual stake-cap statement) in the same sentence, so `parseMaxWinnings` incorrectly returned `"unparsed"`, pushing a spurious `"maxWinnings"` into `unparsedCapFields` alongside the expected `"maxStake"`.
- **Fix:** `isMaxWinningsMention` now returns `false` when the same line already matches `isMaxStakeMention` — a "maximum wager/bet/stake" statement always takes priority over an incidental winnings-word match in the same sentence. No observed book (Bally/DraftKings/FanDuel, per 03-RECON.md's Max-Winnings Semantics section) states a real winnings-dollar cap sharing a sentence with a real stake cap, so this ordering never drops a genuine winnings-cap statement.
- **Files modified:** `src/ingestion/promos/finePrint.ts`
- **Verification:** All 20 existing `finePrint.test.ts` cases still pass; `unparsedCapFields` for the CFB candidate is now exactly `["maxStake"]` as required.
- **Committed in:** `9a1d406`

---

**Total deviations:** 2 auto-fixed (2 pre-existing bugs in Plan 05's shared helpers, both surfaced only by real FanDuel fixture text this task exercises for the first time — no scope creep, no architectural change, no behavior beyond what 03-RECON.md documents was added).
**Impact on plan:** Both fixes were required to satisfy this plan's own explicit behavior list; neither changes the shared helpers' documented contract, and both were verified against the full pre-existing `finePrint.test.ts`/`exclusions.test.ts` suites (no regressions) plus the full repo test suite (473/473 passing after the fixes).

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` — symlinked all three from the primary checkout per the parallel-execution setup instructions (never committed; removed before returning).
- No pre-existing typecheck error was found at this plan's base commit (unlike the `LayoutProps` issue noted in 03-05-SUMMARY.md, which appears to have been resolved by an earlier merged plan) — `npm run typecheck` is clean.
- Plans 12/13 (Bally Bet, DraftKings parsers) likely run in parallel worktrees this same wave and may touch the same shared helper files (`exclusions.ts`, `finePrint.ts`) if they hit similar real-fixture edge cases — the orchestrator's merge step should watch for overlapping hunks in those two files specifically.

## User Setup Required

None — no external service configuration required; this plan is pure/no-I/O (no network calls are made; the scraper only builds request specs and parses fixture bodies, per the plan's own objective and the "no network requests to sportsbooks" constraint for this task).

## Next Phase Readiness

- Plan 06 (scraper write path) can call `fanduelScraper.listRequest`/`planDetails`/`parse` directly once wired into `SCRAPE_TARGET_BOOK_KEYS` (still `["ballybet"]` in `src/config/scrapeTargets.ts` as of this plan — updating it to include `"fanduel"` was explicitly deferred to whichever of Plans 06/12/13 first needs it, per 03-05-SUMMARY.md, and remains out of this plan's declared file scope).
- No blockers for downstream plans. The two shared-helper fixes in this plan are backward-compatible (verified against the full existing test suites) and should only help Plans 12/13 if they hit the same real-world text shapes (curly apostrophes, "profit"-adjacent max-wager sentences) in Bally Bet's or DraftKings' own fixtures.

## Known Stubs

None — this plan is a pure parser/helpers plan with no UI or data-flow surface; nothing here renders empty/placeholder data.

## Threat Flags

None — this plan's surface (parsing untrusted third-party JSON into `ScrapedPromo` candidates) was already covered by the plan's own `<threat_model>` (T-03-14-01 through T-03-14-04); no new network endpoints, auth paths, or schema changes were introduced beyond what that register anticipated.

## Self-Check: PASSED

- `src/ingestion/promos/books/fanduel.ts` — FOUND
- `src/ingestion/promos/books/fanduel.test.ts` — FOUND
- `src/ingestion/promos/exclusions.ts` — FOUND (modified)
- `src/ingestion/promos/finePrint.ts` — FOUND (modified)
- Commit `fd97c39` — FOUND in `git log --oneline --all`
- Commit `9a1d406` — FOUND in `git log --oneline --all`
- Commit `a316e2c` — FOUND in `git log --oneline --all`
- Full repo test suite: 473/473 passing; `npm run typecheck` clean; `npx eslint` clean on all four touched files.

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
