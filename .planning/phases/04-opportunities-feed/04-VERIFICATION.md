---
phase: 04-opportunities-feed
verified: 2026-09-29T00:00:00Z
status: passed
score: 4/4 roadmap success criteria verified (plus all spot-checked owner decisions)
overrides_applied: 0
---

# Phase 4: Opportunities Feed Verification Report

**Phase Goal:** The main screen shows opportunities auto-computed from current promos and cached odds, ranked by profit, filtered to the user's books, including competing-promo tandem opportunities.
**Status:** passed. The owner's 8-step phone check is already approved, so no further human items are open.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Feed is computed automatically from promos and cached odds (promo, hedge book, stakes, profit, ROI) | VERIFIED | `get-opportunities.ts` calls `loadMemberFeedContext`, `rankPromoHedges`, `findPairCandidates`/`selectPairs` and `rankArbs`. It imports no Odds API client, so viewing spends 0 credits. Sources are promos, pairs and arbs. |
| 2 | Sort by profit and by ROI/conversion % | VERIFIED | `SortSwitch` and `pickTop(items, sort)` in `OpportunitiesScreen`. The sort choice persists via `usePersistentString(STORAGE_KEYS.sortMode)`. Items carry `profit`, `pct` and `pctLabel`. |
| 3 | Promo side and hedge side filtered to the user's books | VERIFIED | D-16: rows with `!hasPromoBook` are filtered out. D-17: `rankOpts.hedgeBookKeys` holds only the member's books. D-18: pairs use `memberBookKeys` and arbs use `hedgeBookKeys`. |
| 4 | Tandem pair shown next to separate-hedge profit, with each leg's mechanics and caps applied | VERIFIED | `pairPromos.ts` builds boost+boost and boost+bonus legs with max stake, winnings cap and min odds. It keeps a pair only when `guaranteedProfit > singleA + singleB` (D-08 strict gate, line 291). The gate is applied at the promo-pair level. `toPairRowDTO` carries the separate profits. |

## Owner Decisions Spot-Checked

- **Pair math exactness:** `pairMath.ts` uses decimal.js with a local clone, no native float money math, and cent-floored payouts. The breakpoint solver has a `pairMath.oracle.ts` brute-force oracle and seeded oracle property tests (whole dollars, and cents) in `pairMath.test.ts`.
- **D-08 gate:** strict `gt(singleSum)`, plus a pruning bound `bound.lte(singleSum)`.
- **D-09:** bonus+bonus pairs are skipped.
- **D-10:** `selectPairs` uses an exact bitmask DP per connected component. The tie-break is deterministic (greater gain, fewer pairs, smaller id list). See WR-03 below for the large-component caveat.
- **D-12:** `sumPortfolioProfit` counts a pair once and excludes both of its single profits. Pairs with a done promo are skipped.
- **D-21:** `OPPORTUNITIES_ARB_TOTAL_STAKE = "100.00"`, used for `rankArbs` regardless of the Arbitrage tab.
- **D-11:** `markPairDone` does one multi-row INSERT with no ON CONFLICT, which is atomic on neon-http. The server recomputes the pair, compares it to the client's numbers (D-23) and returns `odds_changed` on mismatch. The session user is the only actor. `unmarkPairDone` removes both rows in one DELETE, from either promo id. The parity test is `memberPairState.test.ts` "D-11 parity: server recompute equals the feed pair".
- **D-01/D-06 tabs:**
  - `AppShell` has four top-level tabs, Opportunities | Arbitrage | Promos | Tools. It defaults to `opportunities`, and every panel stays mounted.
  - `PromosScreen` has Active | Done | Review sub-tabs.
  - `ToolsScreen` has bonus and signup sub-tabs.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| DASH-01 | SATISFIED | Truths 1 and 2 |
| DASH-03 | SATISFIED | Truth 3 |
| DASH-05 | SATISFIED | Truth 4 |
| CALC-07 | SATISFIED | `pairMath.ts` and `pairPromos.ts` |

No orphaned requirements. REQUIREMENTS.md still shows these four IDs as `[ ]`/Pending, which is a documentation-tracking item for the orchestrator to tick.

## Anti-Patterns

No TBD/FIXME/XXX markers in the phase's pair, feed or action files.

## Advisory (04-REVIEW, not blockers)

- **WR-01:** A thrown server action leaves the confirm dialog stuck open with no message.
- **WR-02:** A concurrent double submit reports a failure although the pair was saved.
- **WR-03:** The greedy fallback for large pair components silently breaks the D-10 exact-matching guarantee. The exact solver is used for small components.
- **WR-04:** `PromosScreen` makes a duplicate fetch on every mutation.

## Orchestrator-Supplied Evidence (not re-run)

- 80 test files and 1214 tests pass on main.
- `tsc --noEmit`, lint, and the schema/migration check are clean.
- The owner's phone check was approved.

I did not re-run the tests, `tsc` or lint myself. I read the source and confirmed the test names and locations above.

## Human Verification Required

None outstanding.

_Verifier: Claude (gsd-verifier)_
