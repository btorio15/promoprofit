---
status: awaiting_human_verify
trigger: "the promos in review do not need to be there. The parser cant tell what game this is? 50% profit boost · Georgia @ Alabama College Football game on October 10th, 2026"
created: 2026-10-08
updated: 2026-10-08
---

# Debug: Georgia @ Alabama boosts stuck in match review

## Symptoms

<!-- DATA_START -->
- **Expected:** A promo naming one specific game ("Georgia @ Alabama", 10/10/2026) is matched to that game and goes live (or only asks for a missing cap).
- **Actual:** DraftKings #54 (50%, $25 max) and FanDuel #57 (50%, max stake not on the page) both sit in the review queue with review_reason = match.
- **Errors:** none.
- **Timeline:** first seen 2026-10-08 23:33 UTC scrape.
- **Reproduction:** scrape with NCAAF events cached that include several "Georgia ..." teams.
<!-- DATA_END -->

## Evidence

- Parser output is correct for DK: teamsText ["Georgia", "Alabama"], window 2026-10-10T04:00Z..2026-10-11T03:59Z, 50%, $25, min -200.
- FanDuel teamsText is ["Georgia", "Alabama College Football"]: splitTeams keeps the sport words from "Georgia @ Alabama College Football game on ...".
- The game IS cached: cached_odds 59f8c98d... Alabama Crimson Tide vs Georgia Bulldogs, 2026-10-10T23:30Z.
- TEAM_ALIASES has no americanfootball_ncaaf table, so resolveTeam falls to affixMatch: "georgia" -> Georgia Tech Yellow Jackets, Georgia Southern Eagles, Georgia Bulldogs (ambiguous, 3); "alabama" -> Alabama Crimson Tide (1). Ambiguity => unresolvedTeamTexts => match review.
- lifecycle.decideScrapedWrite re-runs the match for pending_review/match rows on re-scrape (unless autoMatchBlocked), so a fixed matcher clears both rows on the next scrape.

## Resolution

root_cause: (1) College school names ("Georgia") prefix-match several teams and the matcher fails any team text that resolves to more than one team, even when only one of those teams actually plays the other named team. (2) FanDuel scope phrase leaves "College Football" on the second team name.
fix: (1) matcher.matchGameNamed: when a team text resolves to 2+ teams, narrow both sides to the team pairs that actually meet in a cached game (inside the promo's window when it has a valid one); accept only if exactly one pair remains, else still fail as ambiguous. (2) promoText.splitTeams: strip trailing sport words (College Football, NFL, MLB, ...) from team names.
verification: Full suite 1677/1677 pass (6 new: 3 matcher, 1 FanDuel parser, 2 splitTeams), typecheck clean, eslint clean on touched files. Live: after push, dispatch a promo-only scrape (skip_morning_observe=true, 0 Odds API credits); expect #54 to go active and #57 to move to caps review (max stake not on FanDuel's page).
also_fixed: src/app/api/cron/workflowConfig.test.ts still asserted a single schedule; it had been failing since 8844ab8 (afternoon passes). Updated to the three schedules plus a check that only the 15:37 backup runs the already-ran check and odds observe.
files_changed: [src/domain/promos/matcher.ts, src/domain/promos/matcher.test.ts, src/ingestion/promos/promoText.ts, src/ingestion/promos/promoText.test.ts, src/ingestion/promos/books/fanduel.ts, src/ingestion/promos/books/fanduel.test.ts, src/app/api/cron/workflowConfig.test.ts]
