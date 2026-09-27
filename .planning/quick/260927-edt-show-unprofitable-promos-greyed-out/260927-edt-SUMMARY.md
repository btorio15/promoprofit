---
phase: quick-260927-edt
plan: 01
subsystem: promos
tags: [decimal.js, vitest, next.js, hedge-engine, promos-tab]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: rankPromoHedges, calculateProfitBoostHedge, getPromos/getPromos DTOs, PromoRow, PromosScreen
provides:
  - calculateProfitBoostHedgeUnfiltered (informational "best available" boost solver, never used for stakes)
  - findUnprofitablePromos (additive per-promo best/null guaranteed profit for every promo rankPromoHedges excludes)
  - UnprofitablePromoRowDTO + unprofitableRows on every getPromos ok response
  - UnprofitablePromoRow (greyed, non-expandable row) + shared FlagMatchButton component
affects: [promos-tab, promo-scraping-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unfiltered variant of a hedge solver (calculateProfitBoostHedgeUnfiltered) that shares the eligibility gate but drops the profit>0 display filter, for informational-only 'best available' reporting"
    - "Extracted shared interactive sub-component (FlagMatchButton) out of a row component so a second row kind can reuse it"

key-files:
  created:
    - src/components/promos/FlagMatchButton.tsx
    - src/components/promos/UnprofitablePromoRow.tsx
  modified:
    - src/domain/hedge/profitBoost.ts
    - src/domain/hedge/profitBoost.test.ts
    - src/domain/promos/rankPromoHedges.ts
    - src/domain/promos/rankPromoHedges.test.ts
    - src/domain/promos/describe.ts
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-promos.test.ts
    - src/components/promos/PromoRow.tsx
    - src/components/promos/PromosScreen.tsx

key-decisions:
  - "calculateProfitBoostHedgeUnfiltered keeps the D-17 min-odds eligibility null-return but drops the guaranteedProfit<=0 filter; calculateProfitBoostHedge now wraps it with that filter, so its own behavior (and rankPromoHedges' output) is byte-for-byte unchanged."
  - "findUnprofitablePromos is purely additive: it re-runs rankPromoHedges internally to get the profitable-id set, then re-evaluates every remaining promo's candidates with allowNonPositive=true and keeps the max guaranteedProfit (or null if nothing was evaluable). Never derives stakes."
  - "Zero profitable rows + at least one unprofitable promo now returns emptyVariant null with unprofitableRows populated instead of the 'no-active' empty state; 'no-books' still wins over showing the greyed rows."
  - "FlagMatchButton renders its own error <p> absolutely-positioned below the button inside a relative inline-flex wrapper, so it stays inline in a row's badge line without disrupting flex layout (plan explicitly anticipated and authorized this instead of the exact prior sibling-paragraph placement)."

patterns-established:
  - "Row-DTO threat mitigation via omission: UnprofitablePromoRowDTO has no stake/hedge/selection fields at all, so a losing bet can structurally never be rendered as actionable instructions."

requirements-completed: [QUICK-260927-edt]

# Metrics
duration: ~12min
completed: 2026-09-27
---

# Quick Task 260927-edt: Show unprofitable promos greyed out Summary

**Active promos whose best hedge isn't strictly profitable now render as muted, non-expandable rows after the profitable ones on the Promos tab, each showing the exact best guaranteed profit (or "No eligible bets right now") instead of silently vanishing.**

## Performance

- **Duration:** ~12 min (env setup ~10:25, first commit 10:29, last commit 10:35)
- **Started:** 2026-09-27T10:25:00-06:00 (approx)
- **Completed:** 2026-09-27T10:35:19-06:00
- **Tasks:** 3 completed
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments
- Added `calculateProfitBoostHedgeUnfiltered` to profitBoost.ts: identical cap-aware solver and D-17 min-odds eligibility gate as `calculateProfitBoostHedge`, but returns the best candidate even when guaranteedProfit is zero/negative; `calculateProfitBoostHedge` now wraps it with the existing `<=0` filter (behavior unchanged, worked-example fixture verified: cents -0.65, whole -0.80)
- Added `findUnprofitablePromos` to rankPromoHedges.ts: for every promo rankPromoHedges excludes, reports the max guaranteed profit found across every candidate (or null when nothing was evaluable), sorted profit desc/nulls last/promo id asc; extracted `candidatesFor()` as a pure refactor shared by both ranking paths
- Added `UnprofitablePromoRowDTO` (rowKey/promoId/promoType/title/scopeLabel/autoMatched/bestGuaranteedProfit/note only -- no stake/hedge fields by design) and wired `getPromos` to always return `unprofitableRows`; zero profitable rows + at least one unprofitable promo now returns `emptyVariant: null` with the greyed rows instead of the prior "no-active" empty state (no-books still wins)
- Added `UnprofitablePromoRow` (plain div, opacity-60, no Collapsible/chevron) and extracted `FlagMatchButton` out of `PromoRow` so both row kinds share one flag-back implementation; `PromosScreen` now renders the row list when either `rows` or `unprofitableRows` is non-empty, with unprofitable rows always after profitable ones

## Task Commits

Each task was committed atomically:

1. **Task 1: Unfiltered boost solver + additive findUnprofitablePromos ranker** - `fd11b7f` (test, tdd)
2. **Task 2: UnprofitablePromoRowDTO + getPromos wiring and empty-state interaction** - `59196c6` (feat)
3. **Task 3: Greyed-out UnprofitablePromoRow + shared FlagMatchButton + screen wiring** - `b86f24e` (feat)

_Note: Task 1 combined its new tests and implementation into a single commit (prefixed `test(...)`) rather than separate RED/GREEN commits -- both landed together since this quick task's `tdd="true"` tag was applied at the task level, not as a full plan-level TDD gate (frontmatter `type: execute`), and the worked-example test was written and verified passing alongside the implementation in one pass._

## Files Created/Modified
- `src/domain/hedge/profitBoost.ts` - Added `calculateProfitBoostHedgeUnfiltered` (renamed body of the old solver, dropped only the `guaranteedProfit<=0` filter); `calculateProfitBoostHedge` now a thin wrapper around it
- `src/domain/hedge/profitBoost.test.ts` - Added `describe("calculateProfitBoostHedgeUnfiltered")`: worked-example exact -0.65, wrapper still null on the same inputs, still null below minOddsAmerican
- `src/domain/promos/rankPromoHedges.ts` - Exported `RankOptions`; threaded `allowNonPositive` through `evaluateCandidate`/`evaluateBoostCandidate`/`evaluateBonusCandidate`; extracted `candidatesFor()`; added `UnprofitablePromo` interface and `findUnprofitablePromos()`
- `src/domain/promos/rankPromoHedges.test.ts` - Added `describe("findUnprofitablePromos")`: worked example at cents (-0.65) and whole (-0.80), no-evaluable-candidate null case, maxStake-null (D-18) null case, mixed profitable/negative/null ordering
- `src/domain/promos/describe.ts` - Exported the existing `formatBoostPercent` helper (no behavior change)
- `src/domain/promos/dto.ts` - Added `UnprofitablePromoRowDTO`; added `unprofitableRows` to `GetPromosResponse`'s ok branch
- `src/app/actions/get-promos.ts` - Imported `findUnprofitablePromos`; added `toUnprofitablePromoRowDTO`/`unprofitablePromoTitle`/`unprofitablePromoNote`; every ok-branch return now includes `unprofitableRows`; opportunities-empty branch returns `emptyVariant: null` when unprofitable rows exist and the variant would otherwise be "no-active"
- `src/app/actions/get-promos.test.ts` - Updated the "no rows at any usable book" test to expect `emptyVariant: null` + one null-profit unprofitable row; added `unprofitableRows` assertions to the no-odds/no-books/zero-active-promos tests; added a new describe block covering the profitable+negative mix, the exact worked-example DTO shape, bonus-bet title, and boosted-price title
- `src/components/promos/FlagMatchButton.tsx` (new) - Flag-back icon button extracted verbatim from PromoRow, shared by PromoRow and UnprofitablePromoRow
- `src/components/promos/UnprofitablePromoRow.tsx` (new) - Muted, non-expandable row rendering only DTO fields
- `src/components/promos/PromoRow.tsx` - Replaced inline flag-back logic with `FlagMatchButton`; removed now-unused imports/state
- `src/components/promos/PromosScreen.tsx` - List branch condition now `rows.length > 0 || unprofitableRows.length > 0`; renders `unprofitableRows` after `rows`

## Decisions Made
- Worked example (Bally Bet 10% boost, Broncos/Rams) verified by hand and by test: cents precision best guaranteed profit is exactly -0.65, whole precision -0.80, matching the plan's fixture exactly.
- `findUnprofitablePromos` deliberately re-runs `rankPromoHedges` internally (rather than threading a shared intermediate result) to keep it a pure, independent, additive function per the plan's hard rule that rankPromoHedges' own output must stay byte-for-byte unchanged.
- FlagMatchButton's error message placement changed from a sibling `<p>` below the badge line to an absolutely-positioned `<p>` inside a `relative inline-flex` wrapper around the button -- the plan explicitly anticipated this ("if the error `<p>` placement inside the inline span is awkward... wrap in an inline-flex span with the alert below") since the button now needs to sit inline in two different row layouts.
- Reworded UnprofitablePromoRow's doc comment to avoid the literal word "Collapsible" (used "not expand/collapse capable" instead), since the plan's own grep-based verification (`grep -c -E 'Stake|hedgeStake|guaranteedProfit|Collapsible'` expected `0`) doesn't strip `/** */`-style block comments, only `//` lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a test-fixture scope mismatch in the new mixed-promo findUnprofitablePromos test**
- **Found during:** Task 1
- **Issue:** The "profitable promo is excluded; mixed [profitable, negative, null]" test's profitable promo reused `defaultPromo`'s scope (`eventScope("nfl-pinned")`) while its `pinned.eventId` pointed at a different fixture event (`"nfl-pinned-mix"`), so `getPinnedCandidates`' `eventInScope` check silently returned zero candidates and the promo showed up as unprofitable instead of profitable.
- **Fix:** Added `scope: eventScope("nfl-pinned-mix")` to the profitable promo fixture to match its pinned eventId.
- **Files modified:** src/domain/promos/rankPromoHedges.test.ts
- **Verification:** Test passes; full suite green.
- **Committed in:** fd11b7f (Task 1 commit)

**2. [Rule 1 - Bug] Reworded a doc comment to satisfy the plan's own grep-based verification**
- **Found during:** Task 3 (post-implementation verification)
- **Issue:** `grep -v '^\s*//' src/components/promos/UnprofitablePromoRow.tsx | grep -c -E 'Stake|hedgeStake|guaranteedProfit|Collapsible'` returned 1 because the JSDoc block comment (lines starting with ` * `, not `//`) contained the literal word "Collapsible" describing what the component deliberately is NOT.
- **Fix:** Reworded the doc comment to say "not expand/collapse capable" instead of "no Collapsible", preserving the same meaning without tripping the naive `//`-only comment filter.
- **Files modified:** src/components/promos/UnprofitablePromoRow.tsx
- **Verification:** `grep -c` now returns 0; typecheck/lint/tests re-run clean.
- **Committed in:** b86f24e (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bug fixes, both test/verification-only, no production logic changes beyond what the plan specified)
**Impact on plan:** No scope creep -- both fixes were needed to make the plan's own specified fixtures/verification pass correctly.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Verification Results

- `npx vitest run` (full suite) -- 652/652 passed
- `npx tsc --noEmit` -- clean
- `npx eslint src/components/promos src/domain/promos src/domain/hedge src/app/actions` -- clean
- `npx next build --webpack` -- compiled successfully, typechecked, all routes generated
- `grep -v '^\s*//' src/components/promos/UnprofitablePromoRow.tsx | grep -c -E 'Stake|hedgeStake|guaranteedProfit|Collapsible'` -- 0

## Self-Check: PASSED

- FOUND: src/domain/hedge/profitBoost.ts (modified, calculateProfitBoostHedgeUnfiltered exported)
- FOUND: src/domain/hedge/profitBoost.test.ts (modified)
- FOUND: src/domain/promos/rankPromoHedges.ts (modified, findUnprofitablePromos exported)
- FOUND: src/domain/promos/rankPromoHedges.test.ts (modified)
- FOUND: src/domain/promos/describe.ts (modified, formatBoostPercent exported)
- FOUND: src/domain/promos/dto.ts (modified, UnprofitablePromoRowDTO added)
- FOUND: src/app/actions/get-promos.ts (modified)
- FOUND: src/app/actions/get-promos.test.ts (modified)
- FOUND: src/components/promos/FlagMatchButton.tsx (created)
- FOUND: src/components/promos/UnprofitablePromoRow.tsx (created)
- FOUND: src/components/promos/PromoRow.tsx (modified)
- FOUND: src/components/promos/PromosScreen.tsx (modified)
- FOUND: commit fd11b7f (Task 1)
- FOUND: commit 59196c6 (Task 2)
- FOUND: commit b86f24e (Task 3)
