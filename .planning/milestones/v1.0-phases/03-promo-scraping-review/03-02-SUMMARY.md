---
phase: 03-promo-scraping-review
plan: 02
subsystem: domain
tags: [decimal.js, hedge-math, profit-boost, bonus-bet, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-bonus-bet-finder
    provides: americanToDecimal, calculateBonusBetHedge, arbMath.ts's StakePrecision type and candidate-search discipline
provides:
  - "profitBoost.ts: pure decimal.js profit-boost hedge solver (calculateProfitBoostHedge, effectiveBoostedDecimal, decimalToAmericanDisplay) with cap-aware stake optimization for net_winnings/total_payout/boost_extra winnings caps, D-17 min-odds eligibility, and D-03 published-price-wins-over-boost-% precedence"
  - "bonusBet.ts: optional precision field (StakePrecision, default cents) so bonus-bet hedges can round to whole dollars for the Promos tab while every existing caller's behavior is unchanged"
affects: [03-04-promos-tab, 03-07, 03-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "profitBoost.ts as its own module next to bonusBet.ts/arbMath.ts -- no shared 'generic hedge' abstraction or stake-returned boolean flag between promo types (03-RESEARCH.md Pitfall 3)"
    - "Cap-binding stake optimization generalizes arbMath.ts's discrete-candidate-search discipline: evaluate maxStake plus the winnings-cap kink stake (floor/ceil to the active unit, clamped to (0, maxStake]), pick the comparator-best after cent-floor payouts"
    - "decimalToAmericanDisplay avoids Math.round/floor/ceil and Number()/parseFloat entirely -- uses decimal.js's own .toDecimalPlaces()/.negated() plus parseInt() on a fixed-point string to produce the display-only integer"

key-files:
  created:
    - src/domain/hedge/profitBoost.ts
    - src/domain/hedge/profitBoost.test.ts
  modified:
    - src/domain/hedge/bonusBet.ts
    - src/domain/hedge/bonusBet.test.ts

key-decisions:
  - "capBound is determined purely by whether the winnings-cap kink stake S* is less than the floored maxStake -- independent of which stake candidate the comparator ultimately picks. This matters for B4 (total_payout cap): S=50 (maxStake) turns out unprofitable in isolation (guaranteed loss after cent-flooring), so the comparator picks S=45 (the kink) as the winner, but capBound still correctly reports max_winnings because the kink existed and bound below maxStake, not because of which candidate won."
  - "decimalToAmericanDisplay uses parseInt() on a decimal.js fixed-point string rather than Number()/Math.round/floor/ceil, both to honor the plan's acceptance-criteria grep and because a literal '.toNumber()' call would itself match the banned 'Number\\(' substring pattern"
  - "Symlinked node_modules, .env.local, and .next from the primary checkout into this worktree (none committed) -- the worktree had no build artifacts and `npm run typecheck` needs Next.js 16's generated .next/types/*.d.ts (e.g. the global LayoutProps type) to pass cleanly"

requirements-completed: [CALC-02, CALC-03]

# Metrics
duration: ~50min
completed: 2026-09-27
---

# Phase 3 Plan 02: Profit-Boost Hedge Engine Summary

**Cap-aware profit-boost hedge solver (`profitBoost.ts`) built test-first against 11 hand-derived known-answer fixtures, plus optional whole-dollar precision added to the existing bonus-bet hedge solver.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-27T03:16:00Z (approx, worktree branch setup)
- **Completed:** 2026-09-27T04:05:13Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Built and fixture-tested `calculateProfitBoostHedge` (CALC-02, CALC-03): published-vs-derived boosted price precedence (D-03), cap-optimal stake selection across all three max-winnings wording conventions (D-18), D-17 min-odds eligibility and unprofitable-boost rejection, and D-05 precision.
- Every hand-derived expected value in the plan's `<behavior>` block (B1, B1w, B2, B2p, B3, B4, B5, B6, B7 x2, non-binding cap) matched the implementation on the first test run -- no expectation was edited to match code, and no disagreement was found between my own hand re-derivation and the plan's numbers.
- Added optional `precision?: StakePrecision` to `calculateBonusBetHedge` (default `"cents"`) so the Promos tab can request whole-dollar bonus-bet hedges; `rankBonusBetHedges.ts` and every finder caller are untouched and their behavior is byte-for-byte unchanged.

## Task Commits

Both tasks followed the plan's TDD (RED → GREEN) protocol:

1. **Task 1: Profit-boost solver with cap-aware stake optimization**
   - `3889429` - `test(03-02): add failing profit-boost known-answer fixtures` (RED)
   - `bec15c8` - `feat(03-02): profit-boost hedge solver with cap-aware stake optimization` (GREEN)
2. **Task 2: Whole-dollar precision option for bonus-bet hedges**
   - `9c62512` - `test(03-02): add failing bonus-bet whole-dollar precision cases` (RED)
   - `757f6ca` - `feat(03-02): optional whole-dollar precision for bonus-bet hedges` (GREEN)

## Files Created/Modified

- `src/domain/hedge/profitBoost.ts` - Pure decimal.js profit-boost hedge solver: `effectiveBoostedDecimal`, `calculateProfitBoostHedge`, `decimalToAmericanDisplay`, `WinningsCapKind`/`WinningsCap` types
- `src/domain/hedge/profitBoost.test.ts` - 27 tests: 11 known-answer fixtures (B1-B7, non-binding cap), `effectiveBoostedDecimal` precedence, 7 validation cases, 7 `decimalToAmericanDisplay` cases
- `src/domain/hedge/bonusBet.ts` - Added optional `precision?: StakePrecision` (default `"cents"`) to `BonusBetHedgeInput`; hedge-stake candidates now round to the active unit (whole dollar or cent) instead of always cents
- `src/domain/hedge/bonusBet.test.ts` - Added 3 precision test cases (`"whole"`, explicit `"cents"`, omitted)

## Decisions Made

- **capBound reporting is independent of the winning candidate.** capBound is set to `"max_winnings"` as soon as the winnings-cap kink stake S* is found to be less than the floored maxStake -- this is computed once, before the candidate search runs, not derived from which stake the comparator eventually picks. B4's fixture is the proof: the maxStake candidate (S=50) is actually unprofitable once cent-flooring is applied to its capped payout, so the kink candidate (S=45) wins on guaranteed profit, but `capBound` is still `"max_winnings"` for the structural reason (a cap existed and bound), not because the winner happens to equal the kink.
- **`decimalToAmericanDisplay` avoids any literal `Number(`-shaped substring**, including `.toNumber()`. The plan's acceptance criteria grep for `parseFloat|Number\(|Math\.(round|floor|ceil)\(` as a literal substring match, and `.toNumber()` contains `Number(` as a substring -- a call to it would fail that acceptance check even though it isn't native float parsing. Used `parseInt()` on a decimal.js fixed-point string instead, which satisfies both the letter and the spirit of the ban.
- **Worktree environment setup:** symlinked `node_modules`, `.env.local`, and `.next` from the primary checkout (per the parallel-execution instructions) rather than running a fresh `npm install`/`next build` inside the worktree. `.next` was needed in addition to the two mentioned in the harness instructions because Next.js 16's `LayoutProps<"/">` global type (used in `src/app/layout.tsx`, untouched by this plan) is generated into `.next/types/` and `npm run typecheck` failed without it -- this is a pre-existing environment gap, not a defect introduced by this plan's changes.

## Deviations from Plan

None - plan executed exactly as written. Every hand-derived fixture value in the plan's `<behavior>` block matched on the first implementation attempt; no re-derivation disagreement occurred, so nothing was flagged per the plan's "STOP and report" instruction.

## Issues Encountered

- `npm run typecheck` initially failed on `src/app/layout.tsx` (`Cannot find name 'LayoutProps'`) -- a pre-existing, out-of-scope issue caused by the fresh worktree lacking a `.next/types` directory (never built in this worktree). Resolved by symlinking `.next` from the primary checkout (an environment-setup step, not a code change); typecheck then passed cleanly with zero errors across the whole project, confirming this plan's own files introduced no type errors.

## User Setup Required

None - no external service configuration required. This plan is pure domain-layer math with no I/O, DB, or API surface.

## Next Phase Readiness

- `profitBoost.ts` and `bonusBet.ts`'s new `precision` option are ready for Plan 04 (Promos tab) to consume for ranking boost and bonus-bet promo opportunities.
- The `WinningsCapKind` interpretation ("net_winnings" vs "total_payout" vs "boost_extra") is a book-text-dependent choice per 03-RESEARCH.md Pitfall 4/Assumption A2 -- whichever plan wires promo data into `calculateProfitBoostHedge` must set the correct kind from 03-RECON.md's actual scraped/entered promo text, never guess it.
- No blockers identified for downstream plans consuming this module.

## Self-Check: PASSED

- FOUND: src/domain/hedge/profitBoost.ts
- FOUND: src/domain/hedge/profitBoost.test.ts
- FOUND: src/domain/hedge/bonusBet.ts (modified)
- FOUND: src/domain/hedge/bonusBet.test.ts (modified)
- FOUND commit: 3889429
- FOUND commit: bec15c8
- FOUND commit: 9c62512
- FOUND commit: 757f6ca

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
