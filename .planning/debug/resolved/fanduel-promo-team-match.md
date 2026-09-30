---
status: resolved
trigger: "FanDuel NFL Choose Your Own Reward promo (Steelers @ Browns, Oct 1 2026) not matched to its game; Claude reader read it correctly but its teams were discarded"
created: 2026-09-30
updated: 2026-09-30
---

# Debug: fanduel-promo-team-match

## Trigger (user-supplied, treat as data)

DATA_START
FanDuel promo (promos row id 19, "NFL Choose Your Own Reward", 50% profit boost, Pittsburgh Steelers @ Cleveland Browns Oct 1 2026) stuck in review with reason "match" instead of auto-matching the cached event d55cb69fed50a09170560b5b75d8de86. Owner: "how did the claude haiku scrape not find what game this is for ... it says it right there". Fix goals: (a) when reader is high-confidence and both reader team names appear verbatim in the promo text, use reader teams (and date) over implausible/unmatched parser teams; (b) harden splitTeams/parseGameScope so a full sentence is never split into "teams". Add regression tests with this exact FanDuel text. Do not write to the live DB.
DATA_END

## Symptoms

- **Expected:** A FanDuel promo naming "the Pittsburgh Steelers @ Cleveland Browns NFL Game on October 1st, 2026" auto-matches cached NFL event d55cb69fed50a09170560b5b75d8de86 (home Cleveland Browns, away Pittsburgh Steelers, commence 2026-10-02T00:15:00Z) and goes live.
- **Actual:** promos row 19 has status `pending_review`, review_reason `match`, scope columns null, best_guess null.
- **Errors:** none (silent mis-parse).
- **Timeline:** first seen in scrape run 2026-09-30T16:36:59Z. Pattern affects any FanDuel promo whose headline is a long sentence containing " @ ".
- **Reproduction:** run the FanDuel parser (src/ingestion/promos/books/fanduel.ts) on the raw_text below, then reconcile with the reader reading below.

### Evidence already gathered (orchestrator, read-only DB queries)

- `parsed.teamsText` = ["YOU CAN CHOOSE between a 50% Profit Boost Token OR an Up-7 Early Win Token to use on the Steelers", "Browns NFL Game on October 1st, 2026!"]; `parsed.scopeText` = the full first line; `sportKeyHint` = americanfootball_nfl; windowStart/windowEnd null.
- fanduel.ts ~L398-440: spanScope/extractScope/parseGameScope all returned null, so it fell through to `splitTeams(scopeText)` (src/ingestion/promos/promoText.ts:11) which splits on the first " @ " with no length/shape check.
- Claude reader reading (promo_readings, created 2026-09-30 16:37:30): kind profit_boost, boostPercent "50", minOddsAmerican -200, sport americanfootball_nfl, teams ["Pittsburgh Steelers","Cleveland Browns"], eventDateText "October 1st, 2026", confidence high, singleGame true.
- src/ingestion/promos/reconcile.ts:116-188 `reconcileCandidate`: on agreement it merges only money fields (maxStake, minOdds, bonusAmount, maxWinnings); reader teams/sport/eventDateText are discarded. Reader teams are only used in the skip-rescue path (~L242).
- raw_text (first lines): "YOU CAN CHOOSE between a 50% Profit Boost Token OR an Up-7 Early Win Token to use on the Steelers @ Browns NFL Game on October 1st, 2026!\nNFL Choose Your Own Reward\n...\nRegardless of which option you select, your Reward is eligible for use on the Pittsburgh Steelers @ Cleveland Browns NFL Game on October 1st, 2026, up to a maximum wager. ...\nReward expires at 8:15 PM ET on Thursday, October 1st, 2026."

## Current Focus

hypothesis: Two defects combine — (1) FanDuel game-scope parsing misses "<team> @ <team> NFL Game on <Month Dayth, Year>" and the splitTeams fallback accepts whole-sentence halves; (2) reconcileCandidate ignores high-confidence reader teams/date on agreement.
next_action: gather initial evidence

## Resolution

root_cause: (1) FanDuel GAME_SCOPE_RE required the literal "for the"; this promo says "to use on the Steelers @ Browns ..." / "eligible for use on the Pittsburgh Steelers @ Cleveland Browns ...", so no scope matched and splitTeams(entry.name) split the headline sentence into fragments. (2) reconcileCandidate merged only money fields on agreement, discarding the high-confidence reader teams/date.
fix: promoText.ts isPlausibleTeamName (<=40 chars, no sentence punctuation) gates splitTeams; fanduel.ts GAME_SCOPE_RE accepts "for the|on the", optional year, prefers longest plausible pair; reconcile.ts applyReaderTeams overrides empty/implausible parser teams with reader teams only when confidence high, 2 plausible teams, both verbatim in rawText; fills null window from reader eventDateText. Money fields untouched.
verification: npm test 92 files / 1375 tests pass; typecheck, lint, build clean (orchestrator re-ran). Regression tests use the exact FanDuel text.
files_changed: src/ingestion/promos/promoText.ts, promoText.test.ts, books/fanduel.ts, books/fanduel.test.ts, reconcile.ts, reconcile.test.ts
commit: 137164f
note: promos row 19 in the live DB is unchanged; it will match on the next scrape run (or fix now via Correct match in Promos review).
