---
phase: quick-260927-pcc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/test/fixtures/promos/draftkings-promos-2026-09-27.json
  - src/ingestion/promos/exclusions.ts
  - src/ingestion/promos/exclusions.test.ts
  - src/ingestion/promos/sportHints.ts
  - src/ingestion/promos/books/draftkings.ts
  - src/ingestion/promos/books/draftkings.test.ts
autonomous: true
requirements: [QUICK-260927-pcc]

must_haves:
  truths:
    - "DraftKings promo 1126403 ('LA Rams @ DEN Broncos 50% Profit Boost') shows up as a kept profit_boost candidate for that one game instead of being dropped as 'unrecognized'"
    - "DraftKings promo 1127153 ('Sunday Night Football Super Boost', a Waddle/Adams receiving-yards prop) is skipped with reason 'prop', not 'unrecognized'"
    - "No 'unrecognized' skips remain for the 2026-09-27 DraftKings capture, so a scrape of that feed no longer counts as a parser regression"
    - "Every other entry in the new fixture, and every entry in the existing DK/Bally/FanDuel fixtures, is classified exactly as before"
    - "The two 'NFL 50% Profit Boost' entries (1123723, 1126385) stay two separate candidates (merging near-duplicates is deferred)"
  artifacts:
    - path: "src/test/fixtures/promos/draftkings-promos-2026-09-27.json"
      provides: "Live DK capture (23 entries) committed as a test fixture"
    - path: "src/ingestion/promos/exclusions.ts"
      provides: "PROP_RE widened to player-stat wording"
      contains: "Receiving"
    - path: "src/ingestion/promos/sportHints.ts"
      provides: "sportFromTeamPair(away, home) team-name sport inference"
      exports: ["sportFromText", "sportFromTags", "sportFromTeamPair"]
    - path: "src/ingestion/promos/books/draftkings.ts"
      provides: "GAME_SCOPE_RE single-game phrase parsing, event-scoped candidate"
      contains: "GAME_SCOPE_RE"
  key_links:
    - from: "src/ingestion/promos/books/draftkings.ts parse loop"
      to: "sportHint.kind === 'unknown' -> 'unrecognized' branch (currently line ~309)"
      via: "branch now lets a promo through when GAME_SCOPE_RE matches"
      pattern: "GAME_SCOPE_RE"
    - from: "DK candidate teamsText (length 2)"
      to: "src/domain/promos/matcher.ts matchPromo -> matchGameNamed"
      via: "teamsText non-empty routes to game-named matching, which already accepts sportKeyHint null"
      pattern: "teamsText"
---

<objective>
Fix two DraftKings misclassifications found in the live 2026-09-27 capture:

1. A single-game profit boost (1126403, "LA Rams @ DEN Broncos 50% Profit Boost") is dropped as "unrecognized" because its text never says "NFL" and the scope regex only understands "for all <sport> games on <date>". It is a real, usable boost and should become a kept, event-scoped candidate.
2. A player-prop Super Boost (1127153, "Bet Waddle & Adams to record 40+ Receiving Yards each") is also dropped as "unrecognized". Skipping it is correct, since the odds API can't hedge player props, but the reason should be "prop".

Purpose: "unrecognized" skips mark a scrape run as failed (run.ts leaves unrecognized out of LEGITIMATE_SKIP_REASONS), and a real, profitable single-game boost is currently missing from the feed.
Output: the committed fixture, a wider PROP_RE, team-based sport inference, DK single-game scope parsing, and table-driven tests pinning the full keep/skip map.

Out of scope (owner deferred this): merging near-duplicate promos. 1123723 and 1126385 must stay two separate candidates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/ingestion/promos/books/draftkings.ts
@src/ingestion/promos/books/draftkings.test.ts
@src/ingestion/promos/exclusions.ts
@src/ingestion/promos/sportHints.ts

<root_cause>
The "unrecognized" label for BOTH entries comes from the same place: the parse loop in src/ingestion/promos/books/draftkings.ts, the `if (sportHint.kind === "unknown") { skipped.push(skippedEntry("unrecognized", ...)) }` branch (around line 309). Neither entry's title or stripped terms says NFL/MLB/etc., so sportFromText returns unknown.
- 1127153 gets fixed upstream. With a wider PROP_RE, classifyExclusion (which runs first) returns "prop" before the sport gate is reached.
- 1126403 gets fixed at that branch. When the new GAME_SCOPE_RE matches, the promo is let through with teams, and its sport is inferred from the team names (null if they can't be resolved).
</root_cause>

<current_behavior>
Measured by running the current parser on the new fixture (now = 2026-09-27T12:00Z), found = 23:
- Kept: 1123723 (nfl, window 2026-09-27T04:00:00.000Z -> 2026-09-28T03:59:59.999Z), 1126385 (nfl, window 2026-09-27T15:45:00.000Z -> 2026-09-28T03:15:00.000Z)
- Skipped: 1118611 new_customer, 1098873 new_customer, 1127153 unrecognized, 1116571 not_a_promo, 1124647 sgp, 1126403 unrecognized, 1126395 sgp, 1126078 futures, 1123721 not_a_promo, 1098879 not_a_promo, 1001646 not_a_promo, 1020206 not_a_promo, 882364 new_customer, 1119078 futures, 782037 new_customer, 861287 not_a_promo, 1107235 new_customer, 1114582 not_a_promo, 1119017 not_a_promo, 600295 not_a_promo, 779769 new_customer

Target: identical, except 1127153 -> prop, and 1126403 moves to kept (3 candidates, 20 skipped, found 23).

Wording collision scan (done during planning): "Receiving Yards", "to record" and "to each have" appear ONLY in draftkings-promos-2026-09-27.json, not in any Bally/FanDuel/old-DK fixture. The phrase "for the <A> @ <B> game on" appears only in 1126403. The other " game on " hits in both DK fixtures read "end of the final NFL game on 9/27/2026" and must NOT match the new regex.
</current_behavior>

<interfaces>
From src/ingestion/promos/sportHints.ts:
  export type SportHint = { kind: "supported"; sportKey: string } | { kind: "unsupported"; label: string } | { kind: "unknown" };
  export function sportFromText(text: string): SportHint;

From src/domain/promos/aliases.ts (ingestion may import domain; draftkings.ts already imports @/domain/promos/etTime):
  export const TEAM_ALIASES: Record<sportKey, Record<canonicalName, aliases[]>>;  // keys: americanfootball_nfl, basketball_nba, baseball_mlb (no ncaaf/ncaab tables)
  export function resolveTeam(text: string, knownTeams: readonly { sportKey: string; name: string }[], sportKey: string | null): string[];
  // With knownTeams = [], it does an alias lookup plus the abbreviation+nickname split. "LA Rams" -> ["Los Angeles Rams"] and "DEN Broncos" -> ["Denver Broncos"] under americanfootball_nfl.

From src/domain/promos/etTime.ts:
  export function slateWindow(dateText: string, expiresAt: string | null): { start: string; end: string } | null;  // "9/27/2026" -> ET-day window, end extended to expiresAt if <=12h past day end
  export function parseEtDateTime(text: string): string | null;  // "9/27/2026 at 08:20 PM ET" -> ISO UTC

From src/ingestion/promos/promoText.ts:
  export function splitTeams(scopeText: string): [string, string] | null;  // delimiters " vs. ", " vs ", " @ ", " at "

From src/domain/promos/scraped.ts ScrapedPromoSchema: teamsText must be [] or exactly 2 non-empty strings; windowStart < windowEnd; money fields are decimal strings.

From src/domain/promos/matcher.ts: matchPromo routes teamsText.length > 0 to matchGameNamed, which calls buildPool(..., sportKeyHint) and resolveTeam(..., sportKeyHint). Both accept null (null = search all sports). No matcher change needed.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
<name>Task 1: Commit the fixture and classify player-stat Super Boosts as "prop"</name>
<files>src/test/fixtures/promos/draftkings-promos-2026-09-27.json, src/ingestion/promos/exclusions.ts, src/ingestion/promos/exclusions.test.ts</files>
<behavior>
- classifyExclusion({ title: "Sunday Night Football Super Boost", text: "Bet Waddle & Adams to record 40+ Receiving Yards each boosted to +100!" }) returns "prop".
- Also returns "prop" for each of these one-liners: "Rushing Yards", "Passing Yards", "5+ Receptions", "8+ Strikeouts", "10+ Rebounds", "10+ Assists", "Points + Rebounds + Assists", "to each have 40+ Receiving Yards", "to record 2+ hits".
- Negative cases return null (unchanged): the DK terms "Profit Boost Token only applies to a NFL Single, Parlay, SGP, or SGPx bet." and "Total bet odds must be -200 or longer"; Bally "Any Wager" game-named copy ("LA Rams vs. DEN Broncos ... Any Wager"); a spread/total line such as "Broncos -3.5 points" and "Over 45.5 total points"; and generic copy containing the word "record" not followed by a number and "+" (for example "keep a record of your bets").
- The existing exclusions.test.ts cases all still pass, including "classifies a title-level Parlay signal over an incidental Scorer/prop mention" (the title-level parlay check stays ahead of PROP_RE).
</behavior>
<action>
First commit the untracked fixture src/test/fixtures/promos/draftkings-promos-2026-09-27.json exactly as it is (do not edit it), in its own commit: "test(quick-260927-pcc): add live DraftKings 2026-09-27 promo fixture".

RED: add the behavior cases above to exclusions.test.ts as a table-driven `it.each` block (a positive table and a negative table), then run it and confirm the positive cases fail.

GREEN: widen PROP_RE in src/ingestion/promos/exclusions.ts. Keep the existing alternatives (scorer, player prop, anytime touchdown) and add player-stat wording:
- `(receiving|rushing|passing) yards`
- `receptions?`
- `strikeouts?`
- `rebounds`
- `assists`
- "to record" or "to each have" ONLY when followed by a number and "+". Suggested shape: `\bto (?:each )?(?:record|have)\s+\d+\+`. Bare "to record" is not enough, because Bally/FanDuel terms are not boilerplate-stripped the way DK's are.

Do NOT add a bare "points" alternative, since spreads and totals say "points". Keep word boundaries and the `i` flag. Add a short comment above PROP_RE explaining that these are player-stat wordings from the DK "Super Boost" rows (real fixture 1127153), and why the "to record/have" alternative requires "N+".

PROP_RE stays where it is in classifyExclusion's order (after title-level SGP/parlay, outright and futures). Do not move it.

Then run the full promo ingestion test suite to prove nothing else moved. The Bally, FanDuel and old DK fixture tests must pass unchanged. Do not edit their expectations.
</action>
<verify>
<automated>npx vitest run src/ingestion/promos</automated>
</verify>
<done>The fixture is committed. The new exclusions.test.ts tables pass. Every pre-existing test under src/ingestion/promos passes with no expectation edits. classifyExclusion returns "prop" for 1127153's title+terms.</done>
</task>

<task type="auto" tdd="true">
<name>Task 2: Parse DraftKings single-game "for the A @ B game on <date>" boosts as event-scoped candidates</name>
<files>src/ingestion/promos/sportHints.ts, src/ingestion/promos/books/draftkings.ts, src/ingestion/promos/books/draftkings.test.ts</files>
<behavior>
New describe block in draftkings.test.ts that loads draftkings-promos-2026-09-27.json (add a second fixture path constant and parse helper next to the existing ones; now = 2026-09-27T12:00:00.000Z):
- found === 23; candidates.length === 3; the kept externalIds (sorted) are ["1123723", "1126385", "1126403"]. 1123723 and 1126385 stay separate (no dedupe).
- Pin the FULL skip map as a table (`it.each` or a single toEqual on a Record<externalId, reason>): 1118611 new_customer, 1098873 new_customer, 1127153 prop, 1116571 not_a_promo, 1124647 sgp, 1126395 sgp, 1126078 futures, 1123721 not_a_promo, 1098879 not_a_promo, 1001646 not_a_promo, 1020206 not_a_promo, 882364 new_customer, 1119078 futures, 782037 new_customer, 861287 not_a_promo, 1107235 new_customer, 1114582 not_a_promo, 1119017 not_a_promo, 600295 not_a_promo, 779769 new_customer. No "unrecognized" or "schema_invalid" appear.
- 1126403 field-by-field: promoType "profit_boost"; boostPercent "50.00"; maxStake "25.00"; minOddsAmerican -200; teamsText ["LA Rams", "DEN Broncos"]; sportKeyHint "americanfootball_nfl" (inferred from team names); scopeText "LA Rams @ DEN Broncos game on 9/27/2026 at 08:20 PM ET"; windowStart "2026-09-27T04:00:00.000Z"; windowEnd "2026-09-28T03:59:59.999Z"; expiresAt "2026-09-28T03:59:00.000Z"; claimRequired "opt_in"; winningsCapKind "boost_extra"; the window contains the 8:20 PM ET kickoff (2026-09-28T00:20:00.000Z); passes ScrapedPromoSchema.
- 1123723 and 1126385 keep exactly their current fields (teamsText [], sportKeyHint "americanfootball_nfl", windows as listed in <current_behavior>).
- Key link: matchPromo(1126403 candidate, { moneyline: [one synthetic NFL event, away "Los Angeles Rams" / home "Denver Broncos", commence_time "2026-09-28T00:20:00Z"], extended: [] }, { now: 2026-09-27T12:00Z }) returns status "matched". Build the OddsEvent shape the same way src/domain/promos/matcher.test.ts builds its events. Add a second case with sportKeyHint forced to null, which still matches.
- Synthetic cases using the existing buildSyntheticBody helper:
  (a) a game phrase whose teams resolve to no known sport (for example "for the Boise State Broncos @ Colorado State Rams game on 9/27/2026") is kept with sportKeyHint null and teamsText of length 2, not "unrecognized";
  (b) a game phrase without the "at HH:MM PM ET" suffix still parses;
  (c) terms with neither "for all <sport> games" nor "for the A @ B game" and no sport word are still skipped as "unrecognized" (the regression guard stays in place);
  (d) terms saying "end of the final NFL game on 9/27/2026" never produce teamsText.
- All existing draftkings.test.ts tests (old fixture: 2 candidates, full skip list, 1123723/1125805 fields) pass unchanged.
</behavior>
<action>
RED first: add the tests above and run them to confirm the 1126403 and synthetic (a)/(b) cases fail.

In src/ingestion/promos/sportHints.ts, add and export `sportFromTeamPair(teamA: string, teamB: string): SportHint`. It imports TEAM_ALIASES and resolveTeam from @/domain/promos/aliases. For each sportKey in TEAM_ALIASES, the sport qualifies when `resolveTeam(teamA, [], sportKey).length === 1` and `resolveTeam(teamB, [], sportKey).length === 1`. If exactly one sportKey qualifies, return { kind: "supported", sportKey }. Otherwise return { kind: "unknown" }. It never guesses. There are no ncaaf tables, so college games return unknown, which is fine because the matcher resolves teams against cached events.

In src/ingestion/promos/books/draftkings.ts:
- Add GAME_SCOPE_RE next to SCOPE_RE, with a doc comment quoting the real 1126403 terms. Suggested shape: `/for the ([^\n@!]+?) (?:@|vs\.?) ([^\n@!]+?) game on (\d{1,2}\/\d{1,2}\/\d{4})(?: at (\d{1,2}:\d{2}\s*[AP]M) ET)?/i`. The team groups can't cross a newline, "@" or "!". The phrase must start with "for the", so "end of the final NFL game on" can never match.
- Add a small pure helper `parseGameScope(text)`. It returns null or { teams: [away, home] (trimmed), dateText, timeText | null, scopeText }. scopeText is `${away} @ ${home} game on ${dateText}` plus ` at ${timeText} ET` when a time is present, truncated to 200.
- In the parse loop, replace the unknown-sport branch. When sportHint.kind === "unknown", call parseGameScope(text). If it returns null, keep the existing "unrecognized" skip unchanged. Otherwise fall through to buildCandidate. The unsupported-sport check stays before this and is untouched.
- In buildCandidate: when SCOPE_RE (the sport-wide phrase) does not match but parseGameScope does, then:
  - set teamsText to the two teams
  - set scopeText from the helper
  - set the window to slateWindow(dateText, expiresAt), the same ET-day window helper the sport-wide path uses
  - if a time was parsed, check that parseEtDateTime(`${dateText} at ${timeText} ET`) falls inside that window, and if not, use the existing startDate/expirationDate fallback
  - keep the existing startDate/expiresAt fallback when slateWindow returns null
  - set sportKeyHint: if sportFromText already gave a supported sport, use it; otherwise use sportFromTeamPair(away, home) when that is supported; otherwise null.
- The sport-wide path (SCOPE_RE match) must stay byte-for-byte the same in behavior. SCOPE_RE wins if both phrases match.
- Every other field (boostPercent via Decimal toFixed(2), maxStake/maxWinnings/minOdds via finePrint, claimRequired, rawText, finePrintNote) still comes from the existing code. Money stays in decimal strings, and no native float math is added.
- Update the file's header doc comment with one short paragraph on single-game scope handling.

Run the full test suite, then typecheck and lint.

Commit in TDD order: test(quick-260927-pcc) for RED, then feat(quick-260927-pcc) for GREEN.
</action>
<verify>
<automated>npx vitest run src/ingestion/promos src/domain/promos && npx tsc --noEmit && npx eslint src/ingestion/promos</automated>
</verify>
<done>The new-fixture keep/skip map matches exactly (3 kept, 20 skipped, zero unrecognized). 1126403's pinned fields all match, and it matches a synthetic Rams/Broncos event with or without a sport hint. All old DK/Bally/FanDuel fixture tests and the matcher/run tests pass unchanged. tsc and eslint are clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DraftKings public JSON -> parser | Untrusted scraped text is parsed with regexes into promo candidates that drive stake math |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pcc-01 | Tampering | GAME_SCOPE_RE team capture | mitigate | Team groups are limited to `[^\n@!]+?`, the phrase must start with "for the", and the candidate still has to pass ScrapedPromoSchema (teamsText exactly 2, window order). Unresolvable teams leave the matcher "unmatched" (goes to review), never a wrong game. |
| T-pcc-02 | Denial of Service | New regexes on multi-KB terms | mitigate | Lazy quantifiers over a negated character class with no nested quantifiers, so there is no catastrophic backtracking. DK terms are already boilerplate-stripped before matching. |
| T-pcc-03 | Tampering | Widened PROP_RE over-matching real game boosts | mitigate | "to record/have" requires "N+", there is no bare "points", and negative tests plus the unchanged Bally/FanDuel/DK fixture suites pin every existing classification. |
</threat_model>

<verification>
- `npx vitest run` (whole suite) passes.
- The new-fixture parse has zero "unrecognized" skips, and 1126403 is kept with the Rams/Broncos teams.
- `git log` shows the fixture commit, then the test/feat commits for each task.
</verification>

<success_criteria>
- 1126403 becomes a kept profit_boost candidate: boostPercent "50.00", maxStake "25.00", minOddsAmerican -200, teamsText ["LA Rams", "DEN Broncos"], windowStart 2026-09-27T04:00:00.000Z, windowEnd 2026-09-28T03:59:59.999Z.
- 1127153 is skipped as "prop".
- The full keep/skip map for the new fixture is pinned in tests, and every other entry is unchanged.
- The existing DK/Bally/FanDuel fixture tests pass without expectation edits.
- 1123723 and 1126385 remain two separate candidates.
</success_criteria>

<output>
Create `.planning/quick/260927-pcc-draftkings-single-game-boosts-and-super-/260927-pcc-SUMMARY.md` when done.
</output>
