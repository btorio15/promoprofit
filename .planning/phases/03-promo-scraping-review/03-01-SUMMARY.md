---
phase: 03-promo-scraping-review
plan: 01
subsystem: infra
tags: [scraping, sportsbook-api, ballybet, draftkings, fanduel, recon, anti-bot]

# Dependency graph
requires: []
provides:
  - "Scraper Contract (03-RECON.md) with per-book JSON API endpoints, headers, and JSON paths for ballybet, draftkings, fanduel"
  - "D-09 per-book anti-bot decisions: http for ballybet/draftkings/fanduel, skip for the other 4 covered books"
  - "8-row Observed Promos table, each verified present in a committed test fixture, for Plan 05's parser tests"
  - "Resolved RESEARCH.md Open Questions 1-4 (target pages, BetMGM, Hard Rock, max-winnings cap wording)"
affects: [03-05-parser, 03-06-scraper-workflow, 03-matcher]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promo data lives behind plain-JSON backend APIs, not the rendered HTML/SPA page — probe API-shaped endpoints (dx-config-service, api.draftkings.com, api.sportsbook.fanduel.com) before assuming Playwright is needed"
    - "render_mode=http (fetch, no cheerio, no Playwright, no stealth) for all three target books this phase — no scrapers/browser/ package needed"

key-files:
  created: []
  modified:
    - .planning/phases/03-promo-scraping-review/03-RECON.md
    - .planning/phases/03-promo-scraping-review/03-RESEARCH.md

key-decisions:
  - "D-09: ballybet=http, draftkings=http, fanduel=http; betrivers/betmgm/williamhill_us/fanatics/espnbet/hardrockbet=skip (owner decision, verbatim in 03-RECON-OWNER-INPUT.md)"
  - "Scope expanded from plan's single first-target book to three target books this phase, per owner request (\"go ahead with all three books\")"
  - "winnings_cap_kind classified as boost_extra for all three books: none states an independent max-winnings dollar cap, only a max-stake cap; boost % applies to winnings only, never to stake"
  - "fallback_book_key = none: BetRivers (the plan's documented fallback) confirmed a dead end (loyalty Bonus Store only), not promoted to fallback status"

patterns-established:
  - "Scraper Contract can cover multiple target books in one document: shared keys table + one full subsection per book (endpoints, headers, JSON paths, exclusion rules, fixture filenames)"

requirements-completed: [PROMO-03]

# Metrics
duration: ~20min (Task 3 only; Tasks 1-2 ran in a prior session)
completed: 2026-09-27
---

# Phase 3 Plan 01: Scraper Reconnaissance Summary

**Finalized a 3-book Scraper Contract (Bally Bet, DraftKings, FanDuel) — all reachable via plain logged-out JSON APIs, no Playwright needed — and resolved all 4 RESEARCH.md Open Questions from real recon evidence.**

## Performance

- **Duration:** ~20 min (this continuation, Task 3 only)
- **Completed:** 2026-09-27T05:13:19Z
- **Tasks:** 1 (Task 3 — Tasks 1 and 2 were completed in a prior session/agent)
- **Files modified:** 2

## Accomplishments
- Finalized `03-RECON.md`'s Scraper Contract with a full per-book subsection (endpoint URLs, HTTP method, required headers, JSON paths for title/terms/boost %/max stake/min odds/scope/start-end, exclusion rules, fixture filenames) for `ballybet`, `draftkings`, and `fanduel` — zero "TBD" remaining
- Filled "D-09 Decisions" quoting the owner's verbatim per-book anti-bot choices
- Filled "Max-Winnings Semantics" and "Design Implications for Downstream Plans" sections carrying the owner's recon findings (game-wide/sport-wide promo scope, matcher adaptation, exclusion filters, opt-in handling, FanDuel's hidden cap) into the contract Plans 05/06 will consume
- Filled "Observed Promos" with 8 rows across all three books (3 Bally Bet, 2 DraftKings, 3 FanDuel), each cross-checked with `grep` against its fixture and marked present
- Resolved all 4 of `03-RESEARCH.md`'s Open Questions, renaming the heading to `## Open Questions (RESOLVED)` and appending a `**RESOLVED:**` line under each

## Task Commits

1. **Task 3: Finalize 03-RECON.md and the Scraper Contract from the owner's answers** - `3b60c2d` (docs)

_Tasks 1 and 2 were completed and committed in a prior session: Task 1 `1c3df6a` (docs, automated probes/Bluesky/draft recon), Task 2 resolved via owner input `03-RECON-OWNER-INPUT.md` with fixtures committed in `6d484a9`._

**Plan metadata:** this SUMMARY's own commit (below)

## Files Created/Modified
- `.planning/phases/03-promo-scraping-review/03-RECON.md` - Owner Browser Pass, D-09 Decisions, Max-Winnings Semantics, Design Implications, and the per-book Scraper Contract, plus 8-row Observed Promos table
- `.planning/phases/03-promo-scraping-review/03-RESEARCH.md` - Open Questions section renamed to `(RESOLVED)` with a `**RESOLVED:**` line under each of the 4 questions, pointing to 03-RECON.md

## Decisions Made
- **D-09 (owner, verbatim):** `ballybet=http, draftkings=http, fanduel=http`; all other covered books (`betrivers`, `betmgm`, `williamhill_us`, `fanatics`, `espnbet`, `hardrockbet`) = `skip`. No browser rendering, no stealth, no proxies → no `scrapers/browser/` package needed this phase.
- **Scope change:** owner asked to target all three feasible books this phase ("go ahead with all three books... target all three (ballybet, draftkings, fanduel)") rather than the plan's single first-target framing. `SCRAPE_TARGET_BOOK_KEYS = ["ballybet", "draftkings", "fanduel"]`.
- **`winnings_cap_kind = boost_extra`:** none of the three books states an independent max-winnings dollar cap — only a max-stake cap. The boost % is described as applying only to winnings/profit (DraftKings explicit: "excluding original bet amount"; FanDuel's own worked example: $100 winnings × 50% → $150), so the closest of the three enum values is `boost_extra` (the boost is the extra amount added, not a total-payout ceiling).
- **`fallback_book_key = none`:** the plan's documented BetRivers fallback was confirmed a dead end (Kambi offering API reachable, but the promotions page is a loyalty Bonus Store with `rewards.json` returning `{"groupRewards":[]}` and no boost markers) — not promoted to fallback status since all three primary targets already succeeded.
- **X (twitter.com) check skipped by owner decision** ("not needed — official JSON feeds are structured and better"); Bluesky was already a dead end from Task 1's automated probe (no official Bally Bet account; BetRivers's account has zero posts). `social_media_verdict`: not a viable promo source for any of the three target books.

## Deviations from Plan

### Auto-fixed Issues (Rule 2 — scope expansion carried forward, not authored by this executor)

**1. [Rule 2 — carried owner decision] Scraper Contract restructured for 3 books instead of 1**
- **Found during:** Task 3 (reading `03-RECON-OWNER-INPUT.md`, produced during the already-resolved Task 2 checkpoint)
- **Issue:** The plan's Scraper Contract template assumed a single first-target book (`target_book_key`, `target_url`, etc. as scalar values) and fixture filenames `ballybet-promos.(html|json)` / `betrivers-promos.(html|json)`. The owner's actual recon covered three feasible books (Bally Bet, DraftKings, FanDuel) with a different fallback outcome (BetRivers confirmed skip, not fallback) and different fixture filenames (`ballybet-promos.json`, `ballybet-promo-detail-*.json`, `draftkings-promos.json`, `fanduel-promos.json`, `fanduel-promo-detail-cfb-boost.json`, committed in `6d484a9` prior to this task).
- **Fix:** Restructured "## Scraper Contract" into a shared-keys table (covering values true for all three books: `render_mode=http`, `stealth=no`, `winnings_cap_kind=boost_extra`, `cron_hours_mountain`, `fallback_book_key=none`, `social_media_verdict`) followed by one full subsection per book with its endpoint(s), method, required headers, and JSON paths for title/terms/boost %/max stake/min odds/scope/start/end and exclusion rules. Documented the scope change explicitly at the top of `03-RECON.md` and in this deviation entry.
- **Files modified:** `.planning/phases/03-promo-scraping-review/03-RECON.md`
- **Commit:** `3b60c2d`

**2. [Rule 1 — bug/inconsistency fix] Removed stale "Owner Browser Pass (pending)" placeholder and outdated `render_mode=browser` claim**
- **Found during:** Task 3
- **Issue:** `03-RECON.md` (from Task 1) contained a blank "Owner Browser Pass (pending)" placeholder section with unanswered questions, and a "Refined finding" paragraph asserting Bally Bet's `render_mode` was "very likely `browser`" based on probing the wrong URL (`play.ballybet.com/sports`, a JS-only app shell). Leaving both in the finalized doc would contradict the resolved Scraper Contract (`render_mode=http` for all three books) and leave a dangling unanswered section.
- **Fix:** Removed the blank placeholder section (superseded by the filled "## Owner Browser Pass" section). Added a note directly after the "Refined finding" paragraph clarifying it is superseded — the owner's Task 2 pass found each book's promo data behind a separate plain-JSON backend API, not the rendered page probed in Task 1, so `render_mode=http` (not `browser`) is correct.
- **Files modified:** `.planning/phases/03-promo-scraping-review/03-RECON.md`
- **Commit:** `3b60c2d`

---

**Total deviations:** 2 (both Rule 1/2, both carrying forward an already-owner-approved scope decision, not a new unilateral change)
**Impact on plan:** No scope creep beyond what the owner explicitly requested in the Task 2 checkpoint response. The restructuring was necessary for the doc to remain internally consistent and usable by Plan 05/06.

## Issues Encountered

None. All fixture files referenced in the Scraper Contract were confirmed to exist and to contain the exact team names, boost percentages, and fine print quoted in the Observed Promos table (verified via targeted `grep`/JSON-path inspection of each fixture during this task, not assumed).

## User Setup Required

None - no external service configuration required. No network requests were made during this task; all findings were sourced from `03-RECON-OWNER-INPUT.md` and the already-committed fixture files.

## Next Phase Readiness

- Plan 05 (parsers) has everything it needs: three books' endpoints, headers, JSON paths, and exclusion rules, plus real fixtures with verified-present promo data to write known-answer parser tests against.
- Plan 06 (scraper workflow/cron) can skip the `scrapers/browser/` (Playwright) package entirely this phase — all three target books are `render_mode=http`.
- FanDuel's hidden max-stake cap (logged out) means Plan 05/06 must route FanDuel promos to the review queue with caps unknown by default (D-18), not attempt to guess or parse a cap that isn't present in the logged-out response.
- No blockers. RESEARCH.md's Open Questions are now fully resolved, so no outstanding research gaps remain for this phase's scraping design.

## Known Stubs

None. This plan produced documentation and fixtures only — no application code or UI was written.

## Self-Check: PASSED

- `.planning/phases/03-promo-scraping-review/03-RECON.md` — FOUND
- `.planning/phases/03-promo-scraping-review/03-RESEARCH.md` — FOUND
- `src/test/fixtures/promos/ballybet-promos.json` — FOUND
- `src/test/fixtures/promos/ballybet-promo-detail-rams-broncos.json` — FOUND
- `src/test/fixtures/promos/ballybet-promo-detail-wnba.json` — FOUND
- `src/test/fixtures/promos/ballybet-promo-detail-ravens-cowboys-live.json` — FOUND
- `src/test/fixtures/promos/ballybet-promo-detail-profit-boost-terms.json` — FOUND
- `src/test/fixtures/promos/draftkings-promos.json` — FOUND
- `src/test/fixtures/promos/fanduel-promos.json` — FOUND
- `src/test/fixtures/promos/fanduel-promo-detail-cfb-boost.json` — FOUND
- Commit `3b60c2d` — FOUND (`git log --oneline --all | grep 3b60c2d`)
- Commit `1c3df6a` (Task 1, prior session) — FOUND
- Commit `6d484a9` (Task 2 fixtures, prior session) — FOUND

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
