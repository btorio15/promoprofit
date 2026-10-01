# Quick Task 261001-jbc: "Refresh promos" button — refresh only what active promos need - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Task Boundary

Replace the status-bar "Spreads & alt lines" button (quick 261001-e1j; `src/components/finder/OddsStatusBar.tsx` + shared `useSpreadsTotalsSearch` / `spreadsTotalsSearch.ts`) with a **"Refresh promos"** button that refreshes only the odds the member's active promos need, spending far fewer Odds API credits than the full spreads/totals search (~12 credits for 4 sports × 3 markets + alt lines).

The Arbitrage tab keeps its own full "Search spreads & totals" (confirm every time) unchanged. The normal "Refresh odds" (full moneyline) button stays.

</domain>

<decisions>
## Implementation Decisions (owner, 2026-10-01 — locked)

- **D-01 Scope by promo sports:** On press, determine the active promos visible to the pressing member (same set the Promos tab uses: viewer-scoped `getActivePromos(now, userId)`, excluding Done promos, spread/total/moneyline-eligible, member's books as today). Collect the set of sports those promos cover (single-game promo → its event's sport; league-wide/sport-window → its sport). Refresh main lines ONLY for those sports.
- **D-02 Markets:** For those promo sports, refresh **moneyline (h2h) + spreads + totals** in one press (owner: include moneyline so one button updates everything promos use; totals included because promos can be totals-eligible and the original ask was "spreads and totals for the active promos").
- **D-03 Alt lines — the existing shortcut:** After the main-line fetch, pick each promo's best game from the fresh main lines (existing league-wide top-1 picker `src/domain/promos/leagueWideAltTargets.ts`; single-game promos use their own event; line-pinned promos as today) and fetch `alternate_spreads` only for those games, sharing the existing 5-game cap, soonest-first, skipped count, and the credit gate (CREDIT_BLOCK_THRESHOLD) that skips alt only. Exact-opposite / half-point rules unchanged.
- **D-04 Confirm with cost:** Show a confirm dialog before spending: lists the promo sports and an estimated credit cost (e.g. "Refresh promos for NFL, NCAAF — about N credits (X left)"), same pattern as existing confirm dialogs; respects the refresh lock and low-credit block. If the member has no active promos → no fetch, friendly message ("No active promos to refresh").
- **D-05 Placement:** Replaces "Spreads & alt lines" in the status bar (stacked under "Refresh odds", same compact equal-width styling from the 2026-10-01 layout fixes). After success, Promos / Opportunities / Arbitrage refetch in place (existing recompute pattern), banners as today.
- **D-06 Cache safety:** A promo-sports refresh must not wipe or age-stamp other sports' cached odds incorrectly — merging partial results into the moneyline and extended caches must keep other sports' events, and the "Prices as of" age per row must stay honest (rows for refreshed sports show the new time; other sports keep their old time). Planner decides the merge mechanism; no DB migration unless unavoidable (then owner OK required).
- **D-07 Credits accounting:** Record one credit_usage row for the press with the real cost (triggered by the member), as existing refreshes do.

### Claude's Discretion
- Button label exactly "Refresh promos"; dialog/banner wording.
- Whether moneyline for promo sports is fetched in the same per-sport call as spreads/totals (one call, `markets=h2h,spreads,totals`) — preferred if it's one credit-cost formula.
- Server action naming; reuse vs extend `refreshSpreadsTotals` / `runSpreadsTotalsRefresh`.

</decisions>

<specifics>
- Money/ranking math unchanged; decimal.js only.
- Client calls through `safeAction`.
- Credit cost formula (The Odds API): per sport request = markets × regions (bookmakers= ≤10 counts as 1 region); per-event alt request ≈ 1 credit.
</specifics>

<canonical_refs>
- `.planning/todos/pending/2026-10-01-refresh-promos-button.md`
- `src/components/finder/OddsStatusBar.tsx`, `src/components/arb/useSpreadsTotalsSearch.ts`, `src/components/arb/spreadsTotalsSearch.ts`, `src/components/arb/SearchSpreadsTotalsDialog.tsx`
- `src/app/actions/refresh-spreads-totals.ts`, `src/app/actions/refresh-odds.ts`, `src/ingestion/odds/refreshExtended.ts`, `src/ingestion/odds/refresh.ts`, `src/ingestion/odds/store.ts`
- `src/domain/promos/altSpreads.ts`, `src/domain/promos/leagueWideAltTargets.ts`, `src/domain/promos/priceAge.ts`
- `.planning/quick/260930-gyl-*/`, `.planning/quick/260930-hor-*/`, `.planning/quick/261001-e1j-*/` SUMMARYs
</canonical_refs>
