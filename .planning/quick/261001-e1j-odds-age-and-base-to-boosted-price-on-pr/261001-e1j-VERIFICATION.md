---
phase: quick-261001-e1j
verified: 2026-10-01T00:00:00Z
status: human_needed
score: 9/9 must-haves verified (code level)
human_verification:
  - test: "Open Promos, Opportunities and a pair row on a phone-width screen"
    expected: "Base -> boosted price, 'Prices as of' line, status-bar second button and Your cap field fit without overflow; typing in Your cap does not open/close the row"
    why_human: "Visual layout / touch behavior"
  - test: "Leave a page open with fresh prices for 15+ minutes"
    expected: "Row flips to the amber 'Odds may have moved - refresh before betting' note without refetch; row stays put"
    why_human: "Real-time behavior (30s client tick)"
  - test: "Press 'Refresh spreads, totals & alt lines' in the status bar (confirm dialog only; cancel unless spending credits is intended)"
    expected: "Confirm dialog appears every press; confirming recomputes Promos/Opportunities/Arbitrage in place"
    why_human: "Spends real Odds API credits; not run by verifier"
---

# Quick 261001-e1j Verification Report

**Goal:** base->boosted price + price age on promo rows/pair legs, stale flag ticking on client, status-bar spreads/totals button sharing ArbForm flow, Your cap on Opportunities boost rows and pair legs; no boost-math change, no migrations.
**Status:** human_needed (all automated checks pass)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Base -> boosted shown on boost rows (Promos/Opportunities) and boosted pair legs; bonus legs single price | VERIFIED | PromoRow.tsx renders `base -> boosted` when profit_boost and baseOddsAmerican != null; PairCard LegLine does the same for "Boost" legs; DTOs set base only for boosts (promoRowDto.ts, pairRowDto.ts) |
| 2 | Boosted price unchanged (no boost-math change) | VERIFIED | Diff touches rankPromoHedges/pairPromos only to add pass-through `promoBaseOddsAmerican` / `baseOddsA/BAmerican`; no changes under src/domain/hedge; rowPrices.test.ts covers +450 -> +675 |
| 3 | "Prices as of" from the right cache, older-of-two for mixed pairs | VERIFIED | priceAge.ts `oddsSourceFor` / `pricesAsOfFor` (min of the legs' cache times, null if unknown); wired in get-promos.ts, get-opportunities.ts via buildPriceAgeContext with oddsFetchedAt/extendedOddsFetchedAt; toPairRowDTO uses both selections |
| 4 | >15 min shows amber note, row not hidden/re-sorted | VERIFIED | isPriceStale strictly > 15 min; PriceAgeNote renders amber note only; no filtering/sort changes in the diff |
| 5 | Fresh row turns stale on client without refetch | VERIFIED (code) | PriceAgeNote setInterval 30s, now read after mount; timing itself is human item |
| 6 | Status-bar button below Refresh odds, confirm dialog every press, only confirm spends credits | VERIFIED | OddsStatusBar.tsx second Button in same column; startSearch -> runSpreadsTotalsSearch("start") (confirmed:false); only SearchSpreadsTotalsDialog confirmSearch calls "confirm" (confirmed:true) |
| 7 | After success, Promos/Opps/Arb recompute in place; same banners | VERIFIED | useSpreadsTotalsSearch -> reduceSearchOutcome.recompute -> onSearched = onRefreshed (AppShell bumpRecompute); SpreadsTotalsSearchBanners rendered in status bar and ArbForm; ArbForm refactored onto the same hook |
| 8 | Thrown action -> "Couldn't reach the database" message | VERIFIED | runSpreadsTotalsSearch wraps in safeAction, returns ACTION_FAILED_MESSAGE; unit-tested in spreadsTotalsSearch.test.ts |
| 9 | Your cap on Opportunities boost rows and boosted pair legs, instant save, unique ids | VERIFIED | OpportunitiesScreen passes capEditable + capFieldIdPrefix="opp-your-cap"; PairCard LegLine renders YourCapField with per-row idPrefix and onChanged; yourCapFor only for boosts with known cap; YourCapField idPrefix prop added |

**Score:** 9/9

## Spot-checks

| Check | Result |
|-------|--------|
| `npx vitest run src/domain/promos src/components/arb src/app/actions` | 859 passed |
| `npx tsc --noEmit` | no errors |
| Migrations/schema/hedge-math files changed | none (git diff stat) |

## Anti-patterns
None found in changed files (no TBD/FIXME/stubs; new DTO fields optional for snapshot compatibility).

## Human Verification Required
1. Phone-width layout of new elements; typing in Your cap must not toggle the row.
2. Amber flip after 15 min on an open page.
3. Real confirmed spreads/totals refresh (spends credits) - not executed by verifier.

_Verifier: Claude (gsd-verifier)_
