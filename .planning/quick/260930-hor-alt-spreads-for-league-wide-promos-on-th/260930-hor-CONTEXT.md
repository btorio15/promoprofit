# Quick Task 260930-hor: Alt spreads for league-wide promos on their top-1 main-line game - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Task Boundary

Follow-up to 260930-gyl (alt spreads for single-game promos). Extend alternate-spread lines to unpinned, spread-eligible promos that are NOT tied to a single game (sport-wide / date-window / any-game scopes — "league-wide"), without fetching alt lines for every game they cover.

On the confirmed "Search spreads & totals" press:
1. Fetch main spreads/totals as today.
2. For each league-wide unpinned spread-eligible boost / bonus bet visible to the pressing member, rank it on the FRESH main lines (existing `rankPromoHedges` / candidate machinery, no extra credits) and take its single best game (top 1 by guaranteed profit, honoring min odds / max stake / caps / eligible markets / hedge books).
3. Add those event ids to the alt-spread fetch targets alongside the single-game promo events from 260930-gyl (dedupe).
4. Fetch alternate_spreads for the targets (existing per-event fetch, merge, cache).
5. Ranking (page render) then lets league-wide promos use exact-opposite alt pairs on games that have cached alt lines.

Arb tab, bonus-bet finder, and the correction dropdown: UNCHANGED.

</domain>

<decisions>
## Implementation Decisions (locked — owner, 2026-09-30)

- Top 1 game per league-wide promo (owner chose "top 1" over "top 2").
- The 5-game-per-press cap is SHARED with single-game (and pinned) targets. Over the cap: soonest commence first, rest counted in the existing skipped count. (Owner accepted this in the proposal.)
- Several league-wide promos whose best game is the same → one fetch (dedupe).
- Only on the confirmed press; credit gate (CREDIT_BLOCK_THRESHOLD) skips the alt fetch only, never the main refresh; ~1 credit per game.
- Exact opposite line only, half-points only, spreads only, decimal.js money math — same rules as 260930-gyl.
- A league-wide promo with no profitable/eligible main-line game contributes no target.
- This intentionally relaxes 260930-gyl decision A1 (league-wide promos now CAN get alt candidates).

### Recommended (Claude's discretion, planner may refine)
- Ranking side: league-wide unpinned promos get alt candidates on ANY game in their scope that has cached alt lines for the promo's book (not only "their" fetched game). No need to persist a promo→game mapping; extra games fetched for other promos are a free bonus and ranking still picks max profit. Keep `enumerateScopeSelections` alt behavior opt-in so `correctionOptions.ts` stays unchanged.
- Refresh side: the best-game pick must run between the main fetch and the alt fetch inside the refresh flow (today `buildAltSpreadRequests` runs before `runSpreadsTotalsRefresh`). Planner chooses between a callback/hook in `runSpreadsTotalsRefresh` vs splitting the flow — keep refresh lock, credit accounting, `altLines` outcome shape, and per-fetch try/catch intact. A failure in the best-game pick must not fail the main refresh.
- Ordering of league-wide targets within the cap: soonest-first like others.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-SUMMARY.md` and `-PLAN.md` / `-RESEARCH.md` — what gyl built and where.
- `src/domain/promos/altSpreads.ts` — `buildAltSpreadRequests`, `selectAltSpreadTargets`, `ALT_SPREAD_EVENT_LIMIT`.
- `src/app/actions/refresh-spreads-totals.ts` — confirmed-press path.
- `src/ingestion/odds/refreshExtended.ts` — `runSpreadsTotalsRefresh`, credit gate, alt fetch.
- `src/domain/promos/rankPromoHedges.ts` (`candidatesFor`, `altSpreadBookKey` guard ~line 298) and `src/domain/promos/selection.ts` (`enumerateScopeSelections`).

</canonical_refs>
