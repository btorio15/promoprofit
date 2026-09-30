---
phase: quick-260930-gam
verified: 2026-09-30T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Press Search spreads & totals live with a pinned alternate-line spread promo"
    expected: "Alt outcome names equal home_team/away_team (else the info banner reports unmatched prices); pinned promo ranks with hedge at exact opposite line"
    why_human: "Needs live Odds API"
  - test: "Check which Colorado books return alternate_spreads"
    expected: "Coverage known; books without it simply contribute no alt quotes"
    why_human: "Live API roster"
---

# Quick 260930-gam Verification

**Goal:** alternate spread lines for pinned promo games, exact pinned and exact opposite line.
**Status:** human_needed (all code checks pass; live-API items remain)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Non-main pinned line resolves from alternate_spreads | VERIFIED | selection.ts resolveSpread second loop reads ALT_SPREADS_MARKET for books without a main quote |
| 2 | Hedge uses only exact opposite line | VERIFIED | samePoint(o.point, -sel.line) on opposite team; no nearest-line logic |
| 3 | Fetch only on confirmed press, max 5, soonest first | VERIFIED | action loads pins only if confirmed; selectAltSpreadTargets sorts commence asc, slice(0,5); fetchEventOdds referenced only in refreshExtended.ts and client.ts |
| 4 | Credits on same meter row, attributed to presser | VERIFIED | quota.last added to refreshCost, which feeds the single recordCreditUsage in the existing finally (triggeredByUserId unchanged) |
| 5 | Credit gate skips alt only; alt failure never fails main | VERIFIED | balance - altCost < CREDIT_BLOCK_THRESHOLD sets skippedForCredits; per-target try/catch increments failed; commit follows regardless |
| 6 | Info message on skips; dialog mentions 5 extra credits | VERIFIED | ArbForm info banner (skippedOverLimit, credits, failed, unmatched); dialog copy contains the note |
| 7 | Unpinned/arb/finder unchanged | VERIFIED | alt code only in pinned resolveSpread fallback; enumeration and spreadsTotalsFilter untouched; no src/db schema change; orchestrator confirmed no alternate_spreads in refresh.ts/scripts/.github; 1400 tests, build, typecheck, lint pass |

Pins come from getActivePromos(now, user.userId) server-side, never client input (T-gam-01). altSpreads.ts has no db/ingestion imports.

## Human Verification Required

1. **Live refresh with a pinned alt-line spread promo.** Confirm alt outcome names match the event's home_team/away_team (the plan's assumption A2; a mismatch surfaces in the info banner as unmatched prices) and the promo ranks with the exact opposite-line hedge.
2. **Book coverage.** Confirm which Colorado books return alternate_spreads.

## Notes (non-blocking)

- Alt lines persist only for events fetched on the most recent press; a later press replaces them.
- Executor added extras beyond the plan: unmatchedOutcomes count and failed/unmatched banner notes (harmless, consistent with the locked decisions).
- No anti-pattern or debt markers were checked beyond the diff review.

_Verifier: Claude (gsd-verifier)_
