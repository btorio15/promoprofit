---
status: resolved
trigger: "the 3 bet pairs are not showing"
created: 2026-10-03
updated: 2026-10-03
---

# Debug: three-bet pairs not showing

## Symptoms

<!-- DATA_START -->
- **Expected:** On the live Opportunities feed (https://betmargin.vercel.app), the DraftKings 50% boost (cap $20) and FanDuel 30% boost (cap $10) on opposite sides of the same NCAAF game appear as one pair, with a third "Ordinary bet (no promo)" leg (owner case from quick task 261003-fxf: $5.20 whole / $5.43 cents vs $5.18 singles).
- **Actual:** No pair at all. DK and FD boosts show as two separate single opportunities.
- **Errors:** None on screen; page loads normally.
- **Timeline:** Feature shipped in 261003-fxf (pushed, main at be3a925, auto-deployed). First live check today (2026-10-03); never seen working live.
- **Reproduction:** Owner pressed "Refresh promos" in the status bar, then opened Opportunities.
<!-- DATA_END -->

## Context

- Quick task docs: .planning/quick/261003-fxf-three-bet-boost-pairs-with-ordinary-top-/ (PLAN, SUMMARY, VERIFICATION)
- Unit tests for the owner case pass (per SUMMARY); the live feed does not pair them, so suspect pair-eligibility filtering / matching (e.g. same game/market/opposite sides, pair candidate gating, two-bet pair returning nothing so three-bet never considered) or live data shape differing from fixtures.
- Production DB is live Neon; do NOT run migrations or write to DB. Do NOT push (push = production deploy) — owner approves pushes.

## Current Focus

- hypothesis: CONFIRMED - D-08 strict gate (pair profit must exceed the two promos hedged separately) correctly rejects the pair; singles sum is larger on live data
- next_action: none — closed

## Evidence

- 2026-10-03: read-only run against live Neon (temp scripts, deleted). Owner = user 1 (books DK+FD, DK promo #36 50% cap $20, FD promo #39 30% cap $10, both unpinned NCAAF). Wiring (get-opportunities -> findPairCandidates -> selectPairs) is intact.
- Live singles (hand-checked): #36 = DK California -12.5 at +545, boosted +817, hedge FD UNLV +12.5 at -530, stake 20/154, profit $9.05 (whole). #39 = FD UNLV ML boosted +118, hedge DK California +100, profit $0.81. Sum $9.86.
- Best pair found with the gate disabled: #36/#39 on spread line 3.5, three bets (FD top-up), profit $5.55 whole / $5.57 cents on $63 staked. ML pair from the owner case solves to $5.00 whole / $5.23 cents. All below $9.86, so the D-08 gate drops them. Feature works; it is just beaten by a long-shot alt-spread single from extended odds (fetched 2026-10-01).

## Eliminated

## Resolution

root_cause: not a code defect. The pair is correctly suppressed because DK promo #36's best single (a +545 alt-spread long shot, $9.05) plus FD's single ($0.81) beats the best pair ($5.55). The owner-case $5.18 singles figure predates alt-spread odds being cached.
fix: none applied (changing the gate is an owner product decision)
files_changed: []
decision: 2026-10-03 owner chose to keep the D-08 rule (rank by guaranteed dollars; pair shown only when it beats the singles). No code change.
