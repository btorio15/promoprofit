---
phase: quick-261003-fxf
verified: 2026-10-03T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Open the feed with real DK/FD boost promos (owner case) and view PairCard, PairDetails, then mark done and open the Done tab"
    expected: "Third 'Ordinary bet' line appears on all three surfaces with correct book/odds/stake; pair appears in feed with profit above sum of singles"
    why_human: "Live UI rendering and real data; no live DB access in this verification"
---

# Quick 261003-fxf Verification

**Goal:** Boost+boost pairs may add one ordinary top-up hedge; D-08 gate unchanged; third leg through UI and snapshot; old snapshots parse.
**Status:** human_needed (all automated checks pass)

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Solver picks best of {none, top-up B, top-up A} | VERIFIED | `solveBoostBoostPairWithTopUp` in pairMath.ts: plain candidate, `solveTopUpOnSecond(legA,legB)` and mirrored `(legB,legA)`, picks highest profit, ties prefer plain |
| 2 | Owner case beats singles | VERIFIED | topUp tests pass (oracle-checked); SUMMARY: $5.20 whole / $5.43 cents vs $5.18 |
| 3 | No-top-up results identical to 2-bet | VERIFIED | winner defaults to unmodified `plain` object, topUp key absent; existing pairMath/pairPromos tests unchanged and green |
| 4 | D-08 gate unchanged; bound/prune never drop winning pair | VERIFIED | `if (!result.guaranteedProfit.gt(singleSum)) continue; // D-08 strict gate` retained; bound = max over applicable candidates (valid: other-side stakes only reduce the promo-side-wins net); prune relaxed only when top-up could arb |
| 5 | Rounded stakes keep both outcomes >= stated profit | VERIFIED | profit = min(both nets) computed from floored payouts; tests assert both nets >= profit |
| 6 | Third leg on PairCard/PairDetails/DonePairRow, in snapshot, stakeC compared, old snapshots parse | VERIFIED | legC rendered in all 3 components; `legC` optional+nullable in PairRowSnapshotSchema (version stays 1); `isSamePairDisplay` compares `stakeC ?? "0"` vs `legC?.stake ?? "0"`; `expectedStakeC` in mark-pair-done; snapshot tests include old 2-leg fixture |

## Spot-checks run in this verification

- `npx vitest run`: 119 files, 1659 tests pass.
- `npx tsc --noEmit`: no output shown (clean in this check).
- No TBD/FIXME/XXX markers in the changed domain files.
- Commits 8a59a60, 345ff15, c6a57a2 present on main.

## Findings

- INFO: Pre-existing 2-bet solver suboptimality (oracle $16.00 vs solver $15.99 for DK -150/100% cap 24 vs +130/100% cap 16). `solveBoostBoostPairUnfiltered` intentionally unchanged; not a gap for this task.
- INFO: `next build` and `npm run lint` not re-run here (SUMMARY reports lint clean; build failed only due to worktree symlink). Orchestrator should confirm `next build` on main.

## Human verification required

1. Live feed check of the owner case (DK 50% cap $20 / FD 30% cap $10): confirm a three-bet pair shows on PairCard, PairDetails Step 3, and Done tab after marking done; confirm mark-done succeeds and rejects if odds change.

## Gaps

None.
