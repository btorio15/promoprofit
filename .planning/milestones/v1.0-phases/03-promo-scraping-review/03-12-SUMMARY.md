---
phase: 03-promo-scraping-review
plan: 12
subsystem: api
tags: [zod, decimal.js, promos, scraping, parsing, ballybet, vitest]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-05 scope-based ScrapedPromo/BookScraper contract and shared parsing helpers (finePrint, exclusions, sportHints, promoText, etTime)"
provides:
  - "src/ingestion/promos/books/ballybet.ts — ballybetScraper: BookScraper (listRequest, planDetails, parse) for the dx-config-service JSON API"
affects: [03-06, 03-13, 03-14, 03-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Title-level qualification runs classifyExclusion + sportFromText + a boost/bonus-keyword-and-number check before a detail is ever planned or fetched, so excluded/unsupported/non-promo cards never generate a network request (Design Implication 7 polite cadence)"
    - "parse() re-derives the same title-level skip decision independently of detailBodies contents, so a card that was never planned (e.g. WNBA/live-only) is classified identically whether or not a stray detail body happens to be supplied for it"
    - "D-18 missing-detail fallback marks only the fields the detail would have supplied (maxStake, minOdds) as unparsedCapFields; fields Bally Bet never states at all (maxWinnings) stay null without a flag, since 'unparsed' means 'the detail exists somewhere and we couldn't read it', not 'we don't know'"

key-files:
  created:
    - src/ingestion/promos/books/ballybet.ts
    - src/ingestion/promos/books/ballybet.test.ts
  modified:
    - src/ingestion/promos/exclusions.ts

key-decisions:
  - "Widened Plan 05's shared LIVE_ONLY_RE from requiring the exact phrase 'live wager(s) only' to matching bare 'live wager(s)' -- Bally Bet's own title wording is 'Live Wager Profit Boost' (no trailing 'Only'; only the detail bullet says 'Live Wagers Only'), so the original pattern let this real card pass the title-level filter and get fetched, contradicting the plan's own explicit example that it must not be fetched. No other book's fixture uses 'live wager' wording, so this is a safe, non-breaking widening of a shared helper future parsers also reuse."
  - "eligibleMarketTypes defaults to all three market types (moneyline/spread/total) in the D-18 missing-detail fallback path, since eligibleMarketTypes is not a CAP_FIELD (D-18's 'never guess' rule is scoped to maxStake/maxWinnings/minOdds) and the schema requires a non-empty array; the app still picks the actual best market/side later (Design Implication 1)."

patterns-established: []

requirements-completed: [PROMO-03]

# Metrics
duration: 15min
completed: 2026-09-27
---

# Phase 3 Plan 12: Bally Bet Parser Summary

**`ballybetScraper` (BookScraper) turns the real dx-config-service promotions list + detail JSON into exactly one validated candidate (10% LA Rams vs. DEN Broncos Profit Boost) while explaining all 18 other cards with a D-15 skip reason, fixture-tested with no network I/O.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-27T06:01:00Z (approx. — context reading)
- **Completed:** 2026-09-27T06:15:56Z (GREEN commit)
- **Tasks:** 2 completed (implemented as one combined TDD RED -> GREEN cycle — see Decisions)
- **Files modified:** 2 created, 1 modified

## Accomplishments

- `ballybetScraper.listRequest` and `planDetails` build every request exactly per 03-RECON.md's Bally Bet Scraper Contract (jurisdiction/brand/accept-language/application-type/referer/accept/user-agent headers, no session credentials) and plan a detail fetch for exactly one card against the real 19-card fixture — today's Rams-Broncos boost — capped at 6, with a synthetic-10-qualifying-card test proving the cap
- `parse()` classifies all 19 real cards: 1 candidate (Rams-Broncos, every field asserted: `boostPercent "10.00"`, `maxStake "20.00"`, `minOddsAmerican 100`, `teamsText ["LA Rams","DEN Broncos"]`, `windowStart/windowEnd` computed from the real ET claim-window prose via `parseEtDateTime`, `sportKeyHint "americanfootball_nfl"` from `promotionCta.url`, `claimRequired "claim_token"`) and 18 skips covering every D-15 reason recon documented (sgp, parlay x3, futures, live_only, unsupported_sport, not_a_promo, new_customer)
- D-18 compliance: when a planned detail is missing from `detailBodies`, the Rams-Broncos candidate is still produced from the list card alone, with `maxStake`/`minOddsAmerican` null and `unparsedCapFields: ["maxStake", "minOdds"]` — never guessed
- Every candidate is validated with `ScrapedPromoSchema.safeParse`; a synthetic invalid-window candidate is proven to drop into `skipped` as `schema_invalid` with a `console.warn`, never a throw
- A synthetic "First-Half Wagers Only" (non-"Any Wager") detail proves the parser skips unrecognized market wording (`unrecognized`) rather than guessing eligible market types

## Task Commits

Each task was implemented as one TDD RED -> GREEN cycle (both tasks share the same two files and interlocking test behavior — see Decisions/Deviations):

1. **Tasks 1 & 2: listRequest/planDetails title-level filtering + parse() candidate assembly**
   - `0471af3` (test) — RED: `ballybet.test.ts` (12 tests, all failing — module not found)
   - `f356daa` (feat) — GREEN: `ballybet.ts` + `exclusions.ts` fix (12/12 passing)

_No separate "Plan metadata" commit — SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/ingestion/promos/books/ballybet.ts` — `ballybetScraper: BookScraper` (`listRequest`, `planDetails`, `parse`)
- `src/ingestion/promos/books/ballybet.test.ts` — 12 tests: listRequest shape, planDetails title-filter/cap/malformed-input, parse() field-by-field for the real candidate, all 18 real skip reasons, WNBA/Ravens-detail-supplied invariance, D-18 missing-detail fallback, maintenance/`{}` no-throw, schema_invalid, unrecognized-market
- `src/ingestion/promos/exclusions.ts` — widened `LIVE_ONLY_RE` (see Decisions)

## Decisions Made

- Tasks 1 and 2 were implemented together in a single RED -> GREEN cycle rather than two separate cycles. Both tasks modify the exact same two files (`ballybet.ts`/`ballybet.test.ts`), and Task 2's `parse()` behavior (which titles get skipped vs. fetched) is defined by the same title-level filter Task 1's `planDetails()` uses — splitting them into two independent RED phases would have meant writing throwaway scaffolding for `planDetails` alone, then immediately rewriting it once `parse()`'s shared logic was known. Both tasks' full behavior lists were written as one failing test file, confirmed RED (module-not-found), then made GREEN together. All of Task 1's and Task 2's individual acceptance criteria (greps, exact test assertions) are independently verified and passing.
- `LIVE_ONLY_RE` in the shared `exclusions.ts` (Plan 05) was widened from `/\blive wagers? only\b|\blive[- ]only\b/i` to `/\blive[- ]wagers?\b|\blive[- ]only\b/i`. Bally Bet's real title is "Live Wager Profit Boost" (no trailing "Only" — only the detail bullet says "Live Wagers Only"), so the original pattern let this card pass Task 1's title-level filter (`classifyExclusion(title)` returned `null`), contradicting the plan's own explicit example ("...Live Wager Profit Boost' ... are not fetched"). Confirmed via `grep` that no other book's committed fixture (`draftkings-promos.json`, `fanduel-promos.json`) contains "live wager" wording, so this is a safe, non-breaking widening that every future book parser (Plans 13-14) also benefits from.
- In the D-18 missing-detail fallback, `eligibleMarketTypes` defaults to all three market types rather than being left unresolvable, since eligibleMarketTypes is not one of the three `CAP_FIELDS` D-18's "never guess" rule governs (`maxStake`/`maxWinnings`/`minOdds`) and `ScrapedPromoSchema` requires a non-empty array — the app still picks the actual best market/side later per Design Implication 1.
- Detail-derived candidates prefer `sportFromText(promotionCta.url)` over the title for `sportKeyHint`, falling back to the title only when the CTA URL doesn't resolve — matches the plan's explicit ordering and correctly resolves "americanfootball_nfl" from `/sports#sports-hub/american_football/nfl` even though the title itself names no sport.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Widened the shared `LIVE_ONLY_RE` to catch Bally's actual title wording**
- **Found during:** Task 1, first RED->GREEN pass on `ballybet.test.ts`'s "never fetches ... live-only cards" assertion
- **Issue:** `classifyExclusion({title: "30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost", text: ""})` returned `null` because the shared `LIVE_ONLY_RE` (Plan 05) required the literal phrase "live wager(s) only", and Bally's title says "Live Wager Profit Boost" with no trailing "Only" — that phrasing only appears in the detail's Offer Details bullet. This meant the title-level filter (Task 1's own explicit requirement) would have planned a detail fetch for this card, contradicting the plan.
- **Fix:** Widened `LIVE_ONLY_RE` in `src/ingestion/promos/exclusions.ts` to `/\blive[- ]wagers?\b|\blive[- ]only\b/i`, matching bare "live wager(s)" as well as the "... only" phrasing. Verified against every existing fixture (`draftkings-promos.json`, `fanduel-promos.json`) that no other book uses "live wager" wording, so this doesn't introduce a false positive elsewhere.
- **Files modified:** `src/ingestion/promos/exclusions.ts`
- **Verification:** `exclusions.test.ts`'s existing 11 tests still pass unchanged; `ballybet.test.ts`'s title-filter and skip-reason tests for the Ravens card pass.
- **Committed in:** `f356daa` (GREEN commit) — fixed before commit, not a follow-up.

---

**Total deviations:** 1 auto-fixed (1 bug in a shared Plan 05 helper, surfaced by this plan's real fixture).
**Impact on plan:** The fix is squarely within the plan's own stated behavior (the exact Bally Bet title 03-RECON.md documents) — no behavior beyond what recon found was added, and it strengthens a helper every future book parser (Plans 13-14) will also rely on.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` — symlinked all three from the primary checkout per the parallel-execution setup instructions; unlinked before returning.

## User Setup Required

None — no external service configuration required; this plan is pure/no-I/O (no network, no database, no installs, per the plan's own objective — Plan 06 does the actual fetching).

## Next Phase Readiness

- Plans 13 (DraftKings) and 14 (FanDuel) can follow the same structure (title-level qualification before planning a detail fetch, detail-driven candidate assembly with a list-only D-18 fallback) against their own Scraper Contract sections.
- Plan 06 (scraper write path) can call `ballybetScraper.listRequest`/`planDetails`/`parse` directly once it's wired into `SCRAPE_TARGET_BOOK_KEYS` (`src/config/scrapeTargets.ts` still only has `["ballybet"]` — updating it to include all three books is explicitly deferred to whichever of Plans 06/13/14 needs it next, per 03-05-SUMMARY.md, not this plan's scope).
- No blockers.

## Known Stubs

None — this plan is a pure parser with no UI or data-flow surface; nothing here renders empty/placeholder data.

## Threat Flags

None — every threat register item (T-03-12-01 schema tampering, T-03-12-02 detail fan-out DoS, T-03-12-03 credential elevation) is mitigated exactly as planned, and no new network endpoint, auth path, or schema surface was introduced beyond what 03-RECON.md's Scraper Contract already documents.

## Self-Check: PASSED

Both created files verified present on disk; both commit hashes (`0471af3`, `f356daa`) verified present in `git log --oneline --all`. Full repo test suite (`npx vitest run`, no path filter) re-run after the GREEN commit: 43 files / 476 tests, all passing — no regressions in `exclusions.test.ts` or any other shared-helper test from the `LIVE_ONLY_RE` widening.

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
