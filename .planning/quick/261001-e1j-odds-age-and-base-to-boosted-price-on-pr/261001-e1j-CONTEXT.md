# Quick Task 261001-e1j: Odds age + base→boosted price on promo rows, and a fetch-all-odds button - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Task Boundary

Owner saw promo #20 (DK College Football 50% boost) at boosted +675 while DraftKings showed +666. Investigation: math is correct (1 + (base−1)×1.5, floor-rounded like DK); the cached DK alt-spread base was +450 from the 15:43Z extended fetch, and DK repriced to +444 ~20 min later. Promo rows give no hint of price age; only the app-wide OddsStatusBar shows the main (moneyline) cache age. `get-promos.ts` already reads `oddsFetchedAt` / `extendedOddsFetchedAt` (~line 163) but never sends them to the client; `PromoRowDTO` has no age field. Boosted price comes from `effectiveBoostedDecimal` / `decimalToAmericanDisplay` in `src/domain/hedge/profitBoost.ts`, rows built in `rankPromoHedges.ts` `evaluateBoostCandidate`.

Build:
1. **Base → boosted price on boost rows**: e.g. "DK −14.5 +450 → +675 boosted" (base American price shown next to the boosted one) on Promos rows, Opportunities rows and pair rows wherever a boosted promo leg is shown.
2. **Price age per row**: "Prices as of 9:43 AM" (Mountain time, matching the app's existing time formatting) based on the cache the row's prices came from — the moneyline cache (`cached_odds.fetched_at`) for h2h legs, the extended cache (`cached_extended_odds.fetched_at`) for spreads/totals/alternate_spreads legs; if the two legs come from different caches, use the OLDER one. (Using the bookmaker's per-market `last_update` instead is acceptable if it's already available on the event data and simpler — planner's call; must be honest about what it represents.)
3. **Stale warning**: when that age is > 15 minutes, the row is visually flagged (e.g. amber "Odds may have moved — refresh before betting" note) — it stays visible and sortable (do NOT hide it). Threshold a single named constant. Age must be computed against "now" on the client so it ticks over without a refetch (or recomputed on an interval) — a row that was fresh on load must show the warning once 15 minutes pass.
4. **Fetch-all-odds button**: in the shared status bar (`src/components/OddsStatusBar.tsx` / AppShell), directly below the existing "Refresh odds" control, add a second button (label along the lines of "Refresh spreads, totals & alt lines") that runs the SAME flow as the Arbitrage tab's "Search spreads & totals": same `refreshSpreadsTotals` server action, same confirm dialog (`SearchSpreadsTotalsDialog`, confirm every time — locked Phase 01.1 decision, ~15 credits), same credit gate / lock / alt-spread targeting, same outcome banner reporting (reuse ArbForm's banner logic or extract a shared piece). On success, Promos, Opportunities and Arbitrage data refresh in place (existing recompute/refresh pattern, no full reload). Client calls go through `safeAction`.

</domain>

<decisions>
## Implementation Decisions (locked — owner, 2026-10-01)

- Option 3 = BOTH: show base→boosted price with age on each row AND warn when old.
- Stale threshold: 15 minutes (owner accepted the proposal).
- Stale rows are flagged, not hidden.
- New button lives below the normal refresh in the status bar so the owner doesn't have to open the Arbitrage tab; keeps the existing confirm dialog (credits).
- No change to the boost math (verified correct).
- Added 2026-10-01 (owner): the per-member "Your cap" field (YourCapField from 261001-dhn) also appears on Opportunities rows — single boost rows and each boosted leg of pair rows — same instant save, no confirm, no reload.
- No new DB tables / migrations expected. If one seems necessary, stop and ask.

### Claude's Discretion
- Exact copy/wording and placement within the row; phone-width layout must stay clean (no horizontal scroll).
- Whether the Arbitrage tab's own button is refactored to share the new component.

</decisions>

<canonical_refs>
## Canonical References

- `src/app/actions/get-promos.ts`, `src/app/actions/get-opportunities.ts`, `src/db/feedContext.ts`
- `src/domain/promos/rankPromoHedges.ts`, `src/domain/hedge/profitBoost.ts`, `src/domain/promos/dto.ts`, `src/domain/promos/promoRowDto.ts`, `pairRowDto.ts`
- `src/components/OddsStatusBar.tsx`, `src/components/AppShell.tsx`, `src/components/arb/ArbForm.tsx`, `src/components/arb/SearchSpreadsTotalsDialog.tsx`, `src/app/actions/refresh-spreads-totals.ts`
- `src/components/promos/PromoRow.tsx`, `UnprofitablePromoRow.tsx`, opportunities row/pair components
- `src/lib/safeAction.ts`

</canonical_refs>
