---
phase: quick-260930-gyl
verified: 2026-09-30
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Press 'Search spreads & totals' once live (confirmed) with a single-game promo active"
    expected: "altLines reports fetched games and unmatchedOutcomes stays 0 (alt outcome names match team names)"
    why_human: "Requires live Odds API call and credits; not permitted in verification"
---

# Quick 260930-gyl Verification

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unpinned boost on one game ranks best alt pair | VERIFIED | selection.ts opt-in altSpreadBookKey (L294-345); rankPromoHedges.ts L298 passes promo.bookKey; rank tests (5.30 / 7.00) pass |
| 2 | Bonus bet same | VERIFIED | same path; 30.30 test passes |
| 3 | Min odds gates deep-favorite alt | VERIFIED | evaluateCandidate unchanged; -200 vs null tests pass |
| 4 | Sport-window / any get no alt candidates | VERIFIED | guard `scope.kind === "event"` at rankPromoHedges.ts:298; A1 tests pass |
| 5 | correctionOptions unchanged | VERIFIED | option defaults off; file not modified in diff; leak test added |
| 6 | Confirmed press fetches alt for scoped games (max 5, soonest, credit gate alt-only) | VERIFIED | buildAltSpreadRequests (altSpreads.ts:51-72) called in confirmed-only try block of refresh-spreads-totals.ts:37; refreshExtended.ts:266 uses requests, selectAltSpreadTargets; tests pass |
| 7 | Arb tab / bonus finder unchanged; pinned cleanup done | VERIFIED | no diff to rankArbs, rankBonusBetHedges, pairPromos, schema, drizzle; 0 `altSpreadPins` in src; 0 "pinned" in src/components/arb |

Gates run by verifier: full `npx vitest run` = 93 files / 1415 tests pass. No TBD/FIXME/XXX markers in modified source. D-18 (boost without maxStake) and A1 handled in builder.

## Human verification
1. Live confirmation that alternate-spread outcome names match team names (unmatchedOutcomes counter) — requires a real credit-spending press.

Not run by verifier: tsc and lint (executor reported clean apart from known LayoutProps artifact).
