# Quick 261016-1hh: Multi-game promo parser (Part 3) Summary

Scrapers (DraftKings, FanDuel, Bally Bet) and the AI reader now recognise promos limited to 2-12 named games in one league and save them with the `games` scope. No code path can turn multi-game wording into a league-wide promo.

## Commits
- 8bc456e: gamesText contract, `splitGames`/`mentionsSeveralGames`, `matchGamesNamed` (runs before the sport-wide branch), report script prints gamesText
- 3868104: DK/FD/Bally parsers emit gamesText; unsplittable several-game text becomes an "unrecognized" skip with evidence (Needs a look)
- 7f60683: reader `games` field, prompt version 2026-10-16.1, reviewTriage carries gamesText, reconcile never-widen rules

## Behavior
- Matcher: every listed game must resolve to exactly one event in the window and one league; otherwise unmatched with null guess. One distinct event collapses to a normal single-game scope. Pinned selection or >12 games fails.
- Reconcile: rescue/merge only accept reader games at high confidence, verbatim in the text. A would-be sport-wide result is blocked (review) when the text names several games or the reader reported games; new review reason `multi_game_scope`. Existing gamesText is never replaced.

## Deviations
- [Rule 2] `splitGames` additionally rejects pieces whose team names exceed 4 words or contain "or"/"and" (a sentence fragment such as "Raiders prime-time matchup of the week" was otherwise accepted as a team and slipped past the review guard).
- [Rule 2] Sport-wide candidate also demotes to review when reader reported games that could not be verified (not only when text shows 2+ matchups).
- No existing fixture tripped `mentionsSeveralGames`; no test loosened.
- Added no reviewTriage unit test (covered indirectly through reconcile rescue tests).

## Verification
vitest: 131 files / 1882 tests pass. tsc: only pre-existing LayoutProps error in src/app/layout.tsx. eslint clean. No migration, no db commands run, no drizzle changes.
