---
phase: 03-promo-scraping-review
plan: 08
subsystem: domain
tags: [matching, aliases, lifecycle, drizzle, zod, vitest, tdd, promo-scraping]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-04: scope.ts/selection.ts/resolveSelection; 03-05: ScrapedPromo contract, statusAfterMatch stub; 03-06: run.ts/store.ts scrape pipeline, live promos from Bally Bet/DraftKings"
provides:
  - "src/domain/promos/aliases.ts: TEAM_ALIASES (32 NFL, 30 NBA, 30 MLB), normalizeTeamText, resolveTeam -- deterministic, never-fuzzy team name resolution"
  - "src/domain/promos/matcher.ts: matchPromo -- the D-10 all-signals scope certainty gate (sport/window/named-game-teams/pinned-market)"
  - "src/domain/promos/lifecycle.ts: decideScrapedWrite/ExistingPromoState -- single source of truth for skip/touch/write per scraped row"
  - "src/ingestion/promos/run.ts: matchPromo wired in per candidate; loadEvents opt (default getCachedEvents/getCachedExtendedEvents), called once per run"
  - "src/ingestion/promos/store.ts: upsertScrapedPromos now delegates every status/scope decision to decideScrapedWrite"
  - "scripts/promo-match-report.ts (npm run promos:match-report): dry-run D-10 tuning report"
  - "Live result: the two real promos from Plan 06 (Bally Bet Rams/Broncos boost, DraftKings NFL sport-wide boost) are now active/auto_matched in the shared Neon DB"
affects: [03-09, 03-10, 03-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveTeam's 4-step priority order (exact match > alias lookup > abbreviation+nickname split > unique-affix) short-circuits on the first non-empty step -- ambiguity (2+ results) is a caller-visible failure signal at every step, never silently narrowed to []"
    - "LA/NY are the only two-team-per-league alias exception (NFL Rams/Chargers + Giants/Jets, MLB Angels/Dodgers + Mets/Yankees): both teams carry the shared alias so a bare query resolves ambiguously (2 names) while a compound 'LA Rams'/'NY Jets' still resolves via the split rule's set-membership check"
    - "matchPromo is pure and injected (now/windowDays via opts, events via param) -- run.ts is the only caller that touches the clock or the DB, mirroring rankPromoHedges.ts's existing pure-domain/impure-caller split"
    - "decideScrapedWrite is the ONLY place status/scope/reviewReason logic lives for a scraped write; store.ts's job shrank to loading existing-row state, calling it, and translating the decision to SQL -- no inline lifecycle rules left in store.ts"
    - "loadEvents is memoized per run (not per book) via a lazily-created promise, called only once the first book reaches a successful parse -- avoids spending a DB round-trip when every book in a run fails"

key-files:
  created:
    - src/domain/promos/aliases.ts
    - src/domain/promos/aliases.test.ts
    - src/domain/promos/matcher.ts
    - src/domain/promos/matcher.test.ts
    - scripts/promo-match-report.ts
  modified:
    - src/domain/promos/lifecycle.ts
    - src/domain/promos/lifecycle.test.ts
    - src/ingestion/promos/run.ts
    - src/ingestion/promos/run.test.ts
    - src/ingestion/promos/store.ts
    - package.json
    - .planning/phases/03-promo-scraping-review/03-RECON.md

key-decisions:
  - "resolveTeam's abbreviation+nickname split (step 3) treats token/rest agreement as 'rest's resolved team is a member of token's resolved set' rather than requiring token to resolve to a single unambiguous team -- this is what makes a shared alias like 'LA' (registered on both Rams and Chargers) correctly resolve 'LA Rams' to just the Rams, while a bare 'LA' still surfaces as ambiguous"
  - "The unique-affix rule (step 4) returns ALL matching known teams, not just when there's exactly one -- the explicit 'Colorado' -> 2 names (Buffaloes/State Rams) test requires ambiguity to be visible in the return value itself, not silently collapsed to []; the caller's own 'length !== 1 is failure' contract handles ambiguity"
  - "Only the 'existing expired with a human-confirmed/corrected scope' write path skips refreshing cap/structured columns from the fresh parse -- every other write path (new, pending_review/match re-match, expired-without-human-scope revival) refreshes fully from the current parse, matching Plan 06's existing precedent for the same distinction"
  - "TEAM_ALIASES team names were live-verified against the shared Neon DB (cached_odds/cached_extended_odds raw_response) for americanfootball_nfl (30/32 -- missing only Atlanta Falcons and Green Bay Packers, both absent from this week's cached slate; Green Bay Packers is separately fixture-confirmed) and baseball_mlb (21/30 -- in-season roster narrowing); the remaining names (Atlanta Falcons, all basketball_nba) were sourced from well-established official franchise names since the NBA season had no cached games this session -- documented in 03-RECON.md's Matcher Tuning section rather than left implicit"

requirements-completed: [PROMO-04, PROMO-03]

# Metrics
duration: ~30min
completed: 2026-09-27
---

# Phase 3 Plan 8: Deterministic Scope Matcher, Alias Table, and Lifecycle Wiring Summary

**Curated NFL/NBA/MLB team-alias table plus a deterministic all-signals scope matcher (`matchPromo`) wired through a single lifecycle decision function (`decideScrapedWrite`) into the live scrape pipeline -- tuned against the two real promos Plan 06 scraped, both of which auto-activated on the very first live re-scrape with zero alias changes needed.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-27T00:59:00-06:00 (approx, file reads before first commit)
- **Completed:** 2026-09-27T01:16:51-06:00
- **Tasks:** 3 completed (Tasks 1 and 2 TDD RED -> GREEN, Task 3 live tuning/verification)
- **Files modified:** 12 (5 created, 7 modified)

## Accomplishments

- `aliases.ts`: `TEAM_ALIASES` covers exactly 32 NFL, 30 NBA, 30 MLB canonical Odds API team names, each with nickname/city(when league-unique)/abbreviation aliases; `resolveTeam` resolves nickname, abbreviation, city, and compound "abbrev+nickname" forms (`"LA Rams"`, `"DEN Broncos"`, `"BAL Ravens"`, `"DAL Cowboys"`) to exactly one canonical name, surfaces ambiguity as a >1-length result (`"LA"`/`"Los Angeles"` -> Rams+Chargers; NCAA `"Colorado"` -> Buffaloes+State Rams), and never fuzzy-matches (`grep -ciE "levenshtein|fuse|similarity|string-similarity"` -> 0 in both `matcher.ts` and `aliases.ts`).
- `matcher.ts`'s `matchPromo` implements the D-10 all-signals gate exactly per 03-RECON.md Design Implication 2: sport-wide promos match on sport+window alone (zero event lookups); named-game promos additionally require both teams to resolve to exactly one cached, not-yet-started, in-window event; a pinned promo additionally requires `resolveSelection` to prove the market exists as a half-point 2-way line. 18 behavior tests including the invariant "`status === "matched"` iff all four signals true," verified across every fixture in the file.
- `lifecycle.ts`'s new `decideScrapedWrite` is the single source of truth for every scraped-row outcome (skip/touch/write): dismissed rows skip (D-14); active/caps rows touch; a flagged (`auto_match_blocked`) row always touches even when newly matched (D-11); pending_review/match rows re-match on every scrape (D-19); an expired row with a human-confirmed/corrected scope revives keeping that scope and its prior caps, while one without reverts to a fresh match attempt. 17 tests cover every rule in the plan's behavior table.
- `run.ts` now computes `matchPromo` per candidate against a `loadEvents` result (default: `getCachedEvents`/`getCachedExtendedEvents` in parallel) that's loaded lazily exactly once per run, only after the first book successfully parses -- never per book, never when every book fails.
- `store.ts`'s `upsertScrapedPromos` no longer contains any inline status/scope rule -- it loads each existing row's full state (including reconstructing `humanScope`/`humanPinned` from the confirmed/corrected columns), calls `decideScrapedWrite`, and translates the decision into the matching insert/update/skip SQL.
- `scripts/promo-match-report.ts` (`npm run promos:match-report`) is a dry-run report against every live `pending_review`/`active` promo, printing the four signals and matched scope or best-guess/unresolved-team-texts per row plus per-book summary counts -- writes nothing.
- **Live tuning (Task 3):** odds cache was 6h25m old (under the plan's 12-hour refresh threshold), so `odds:refresh` was correctly skipped -- **0 credits spent**. The dry-run report found **zero false negatives** against the two real promos already live from Plan 06 (Bally Bet's `"10% LA Rams vs. DEN Broncos Profit Boost"`, DraftKings' `"NFL 50% Profit Boost"`), so no alias-table changes were needed. Ran `npm run scrape:promos` once (all three books, one polite request per book, all `ok`) and `npm run promos:check`: **both real promos are now `active`/`auto_matched=true`** with correctly resolved scopes (Bally Bet -> `event` scope, Denver Broncos vs. Los Angeles Rams; DraftKings -> `sport_window` scope, NFL, the promo's own claim window). FanDuel kept 0 promos again, same scrape-timing gap already documented in 03-06-SUMMARY.md, not a matcher issue.

## Task Commits

1. **Task 1: Curated aliases and the deterministic scope matcher** -- TDD, two commits:
   - `ed9d489` (test) -- RED: `aliases.test.ts`/`matcher.test.ts` fail with `Cannot find module`
   - `1b01a24` (feat) -- GREEN: `aliases.ts`, `matcher.ts`; 27/27 tests pass, typecheck clean
2. **Task 2: Auto-accept, re-match and flag-respecting write decisions wired into the scrape run** -- TDD, two commits:
   - `d77c588` (test) -- RED: 14 new assertions fail (`decideScrapedWrite` not a function; `loadEvents` never called; `write.match` undefined) while all 17 pre-existing tests still pass
   - `888e0e9` (feat) -- GREEN: `lifecycle.ts`, `run.ts`, `store.ts`; 31/31 tests pass, typecheck clean, `npx next build --webpack` clean
3. **Task 3: Tune the matcher on real scraped promos from all three books (D-10) and apply it live** -- `3eb82e6` (feat), live execution + doc update, no test changes needed (zero false negatives found)

## Files Created/Modified

- `src/domain/promos/aliases.ts` / `aliases.test.ts` -- `TEAM_ALIASES`, `normalizeTeamText`, `resolveTeam`
- `src/domain/promos/matcher.ts` / `matcher.test.ts` -- `MatchSignals`, `MatchResult`, `matchPromo`
- `src/domain/promos/lifecycle.ts` / `lifecycle.test.ts` -- adds `ExistingPromoState`, `ScrapedWriteDecision`, `decideScrapedWrite` alongside the existing `statusAfterMatch`
- `src/ingestion/promos/run.ts` / `run.test.ts` -- adds `LoadPromoMatchEvents`, `loadEvents` opt, per-candidate `matchPromo` call
- `src/ingestion/promos/store.ts` -- `upsertScrapedPromos` rewritten around `decideScrapedWrite`; adds `humanScopeFrom`/`humanPinnedFrom`/`scopeColumnsFrom`/`pinColumnsFrom` helpers
- `scripts/promo-match-report.ts` -- new dry-run CLI; `package.json` gains `"promos:match-report"`
- `.planning/phases/03-promo-scraping-review/03-RECON.md` -- new `## Matcher Tuning (D-10)` section

## Decisions Made

- **resolveTeam's split-rule agreement check uses set membership, not equality** -- `<token>`'s resolved set only needs to *contain* `<rest>`'s uniquely-resolved team, not resolve to it alone. This is what lets a legitimately shared alias ("LA" on both Rams and Chargers) still disambiguate correctly once paired with a nickname, while a bare query surfaces the ambiguity.
- **The unique-affix rule returns every matching team, not just a lone match** -- ambiguity must be visible in the return value's length (per the explicit "Colorado" -> 2 test), not swallowed to `[]`; the caller's own "length !== 1 is failure" contract is where ambiguity actually gets rejected.
- **Only the expired-with-human-scope write path skips refreshing cap/structured columns from the fresh parse** -- every other write path refreshes fully, consistent with Plan 06's existing precedent that a human-confirmed row's revival keeps its own known data rather than re-trusting a possibly-different re-scrape of the same identity.
- **TEAM_ALIASES sourcing was partially live-verified, partially not, and this is documented rather than glossed over** -- NFL (30/32 live) and MLB (21/30 live) team names came from a one-off `select distinct ... from cached_odds/cached_extended_odds` query against the shared Neon DB; the rest (all NBA, 2 remaining NFL teams) came from well-known official franchise names since no NBA games were cached this session. Recorded explicitly in 03-RECON.md's Matcher Tuning section per the plan's own instruction to "record in the SUMMARY which names were verified live."

## Deviations from Plan

None -- plan executed exactly as written. Both TDD tasks followed the RED -> GREEN protocol literally (implementation files were physically moved out and `Cannot find module` / assertion failures were confirmed genuine before each RED commit, then restored for the GREEN commit). Task 3 found zero false negatives on the first dry run against real data, so no alias additions or matcher-logic fixes were needed -- the plan anticipated this could happen ("tuning means growing the alias table and hardening window logic" when needed) and it simply wasn't needed this session for the two real promos available.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` -- symlinked all three from the primary checkout per the parallel-execution setup instructions; unlinked before returning, never committed.
- A one-off `tsx` script querying live team names from `cached_odds`/`cached_extended_odds` was run from a temporary path inside `scripts/` (never committed) to live-verify as many `TEAM_ALIASES` entries as the current cache supports; deleted immediately after use.
- FanDuel kept 0 promos on this session's live re-scrape too (same timing gap as Plan 06 -- see 03-06-SUMMARY.md) -- not a matcher/alias issue, no action taken.

## User Setup Required

None -- no external service configuration required. The live scrape used the existing `DATABASE_URL` already configured in `.env.local`; no Odds API refresh was triggered (cache was fresh enough), so 0 credits were spent this session.

## Next Phase Readiness

- Plan 09 (member "Correct"/flag-back actions) can build directly on `decideScrapedWrite`'s `ExistingPromoState`/`autoMatchBlocked` contract -- D-11's flag-respecting rule is already enforced end-to-end.
- Plan 10 and the Promos tab's "Auto-matched" badge (Plan 03/15 scaffold) now have real live data to render: both currently-active promos have `auto_matched=true`.
- `scripts/promo-match-report.ts` is available for any future re-tuning session without spending Odds API credits or making sportsbook requests.
- No blockers. FanDuel's continued 0-kept state is a known scrape-timing gap (documented in 03-06-SUMMARY.md), expected to resolve itself once a new promo rotates onto FanDuel's feed -- no code changes anticipated.

## Known Stubs

None -- every value this plan writes (scope, pinned selection, best guess, auto_matched) is real, computed data; nothing here renders a hardcoded/placeholder value.

## Self-Check: PASSED

- FOUND: src/domain/promos/aliases.ts
- FOUND: src/domain/promos/aliases.test.ts
- FOUND: src/domain/promos/matcher.ts
- FOUND: src/domain/promos/matcher.test.ts
- FOUND: scripts/promo-match-report.ts
- FOUND (modified): src/domain/promos/lifecycle.ts
- FOUND (modified): src/domain/promos/lifecycle.test.ts
- FOUND (modified): src/ingestion/promos/run.ts
- FOUND (modified): src/ingestion/promos/run.test.ts
- FOUND (modified): src/ingestion/promos/store.ts
- FOUND (modified): package.json
- FOUND (modified): .planning/phases/03-promo-scraping-review/03-RECON.md
- FOUND commit: ed9d489
- FOUND commit: 1b01a24
- FOUND commit: d77c588
- FOUND commit: 888e0e9
- FOUND commit: 3eb82e6

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
