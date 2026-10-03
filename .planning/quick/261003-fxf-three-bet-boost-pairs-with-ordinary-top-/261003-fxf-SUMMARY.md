---
phase: quick-261003-fxf
plan: 01
subsystem: pair-solver
tags: [boost-pairs, hedge-math, top-up-bet, CALC-07]
requirements: [CALC-07]
key-files:
  created:
    - src/domain/hedge/pairMath.topUp.test.ts
  modified:
    - src/domain/hedge/pairMath.ts
    - src/domain/hedge/pairMath.oracle.ts
    - src/domain/promos/pairPromos.ts
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/pairRowDto.ts
    - src/domain/promos/pairSnapshot.ts
    - src/domain/promos/reviewInput.ts
    - src/app/actions/mark-pair-done.ts
    - src/components/opportunities/PairCard.tsx
    - src/components/opportunities/PairDetails.tsx
    - src/components/opportunities/MarkPairDoneButton.tsx
    - src/components/promos/DonePairRow.tsx
metrics:
  tasks: 3
  completed: 2026-10-03
---

# Quick 261003-fxf: Three-bet boost pairs with an ordinary top-up bet

A boost + boost pair may now add ONE ordinary (unboosted) top-up bet on either side, at the member's best hedge book for that side, so the boost with the larger cap can use its full stake when the other cap binds. The solver picks the best of {no top-up, top-up on B's side, top-up on A's side}; the D-08 strict gate (pair must beat the two singles) is unchanged.

## Owner case (DK 50% cap $20 on Baylor +154, FD 30% cap $10 on ASU -172, min -200, top-up at -172)

Singles total: $5.18 ($4.33 + $0.85).

| Precision | Today's 2-bet pair | 3-bet guaranteed profit | Stakes (DK / FD / ordinary ASU) | Beats $5.18 |
|-----------|--------------------|-------------------------|---------------------------------|-------------|
| whole     | $1.80              | $5.20                   | $20 / $8 / $33                  | yes (+$0.02) |
| cents     | $2.25              | $5.43                   | $19.97 / $9.98 / $30.72         | yes (+$0.25) |

The whole-dollar figure equals the brute-force oracle optimum exactly. Cents is never worse than whole, never worse than the whole-dollar oracle, and a local +/- 2 cent scan finds nothing better. (The plan's orientation figure of "2-bet $3.27" was for exact unrounded stakes; the solver's own 2-bet numbers at these precisions are the ones above.)

## Commits

- 8a59a60 feat(261003-fxf): three-bet boost pair solver with ordinary top-up
- 345ff15 feat(261003-fxf): top-up-aware pair discovery
- c6a57a2 feat(261003-fxf): show and record the third bet

## What changed

- pairMath.ts: `solveBoostBoostPairWithTopUp`, `TopUpQuote`, optional `PairResult.topUp`. Bounded search: for every (stake A, stake B) in the seed windows the balancing top-up stake is recomputed and scored at +/- 1 unit. 2-bet results are byte-identical (no `topUp` key); existing pairMath tests untouched.
- pairPromos.ts: top-up book is the best quote across `hedgeBookKeys` per side (`bestHedgeQuote`, now exported); prune relaxed only when a top-up could make an arb; pre-solver bound is the max over applicable candidates (proof in a code comment), so nothing profitable is pruned. `PairCandidate.topUp` is optional.
- DTO/snapshot: `legC` (optional + nullable in zod, version stays 1, old 2-leg snapshots parse and give `legC: null`); `isSamePairDisplay` compares `stakeC`; `MarkPairDoneInputSchema` accepts optional `expectedStakeC`.
- UI: third line on PairCard, Step 3 and a table row in PairDetails, third line in the Done tab.

## Deviations from Plan

- [Test adjustment] The oracle-agreement test requires exact equality with the oracle only when a top-up strictly beats the best 2-bet; otherwise it requires equality with the existing 2-bet solver. Reason: a pre-existing 2-bet limitation was exposed by a random case (DK -150/100% cap 24 vs +130/100% cap 16: existing solver $15.99 vs whole-grid oracle $16.00). The existing `solveBoostBoostPairUnfiltered` is unchanged per the plan ("exactly as today"); noted for follow-up, not fixed.
- [Fixture] The pairRowDto "2-bet legC null" test uses a boost + bonus pair, since the shared boost + boost fixture legitimately produces a top-up now.

## Known Stubs

None.

## Verification

- `npx vitest run`: 119 files, 1659 tests pass (existing pairMath/pairPromos tests unmodified).
- `npx tsc --noEmit`: only the pre-existing `LayoutProps` error in src/app/layout.tsx.
- `npm run lint`: clean.
- `next build`: fails in the worktree only because of the node_modules symlink (Turbopack: "Symlink [project]/node_modules is invalid"); orchestrator should build on main.
- No migrations, no DB writes, no Odds API calls, no new packages.

## Self-Check: PASSED
