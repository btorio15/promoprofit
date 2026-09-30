# Quick Task 260930-gam: Add alternate spread lines for pinned promo games - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Task Boundary

For promos pinned to a spread market/line (e.g. "Steelers -6.5") whose line is not the main spread, fetch The Odds API `alternate_spreads` market via the per-event endpoint `/v4/sports/{sport}/events/{eventId}/odds` (regions `us,us2` for the Colorado books), cache it in Postgres like the existing odds cache, and let the promo hedge ranking use the exact pinned line (and its matching opposite line at hedge books) instead of only the main spread. Today only `h2h`/`spreads`/`totals` are fetched (`src/ingestion/odds/refreshExtended.ts:45` `EXTENDED_MARKETS`).

</domain>

<decisions>
## Implementation Decisions

### When to fetch
- ONLY on the user-triggered spreads/totals Refresh button path (`src/app/actions/refresh-spreads-totals.ts` and whatever it calls). Not on the morning scrape job, not on page view, not on a schedule.
- Must go through the existing refresh lock, credit gate and credit meter (triggeredByUserId attribution) like the current spreads/totals refresh.

### Credit cap
- At most 5 games (events) per refresh press (~2 credits each with regions us,us2 → ~10 credits).
- Only events that have at least one active pinned spread promo visible to the refreshing member are candidates; dedupe per event.
- When more than 5 qualify, fetch the 5 with the soonest commence time and report how many were skipped (surface this in the refresh outcome the UI already shows).
- If the remaining-credit gate would be crossed, skip the alt-line fetch rather than the main refresh.

### Hedge line matching
- Exact opposite line only: a promo pinned to Team A −6.5 hedges only with Team B +6.5 (same absolute point, opposite side) at hedge books. No nearby/"middle" lines, no approximation. Guaranteed profit must stay exact to the cent.

### Scope
- Spreads only. Alternate totals are OUT of scope for this task (owner did not select it).

### Claude's Discretion
- Cache table/shape (extend existing extended-odds cache vs new table) — if a new table is needed it is an additive migration that requires the owner's explicit OK before it is applied to the live Neon DB; generating the migration file is fine, applying it is not (make that a human checkpoint).
- How the ranking merges alt-line outcomes with main-line spreads (e.g. merged market list keyed by point).
- UI wording for "N games' alt lines skipped (limit 5)".

</decisions>

<specifics>
## Specific Ideas

- Promo 19 (FanDuel, Steelers @ Browns Oct 1 2026) is an example of a pinned-game promo; spread pins look like "Spread +3.5 - {team}" in the review vocabulary.
- decimal.js for all money math; strict zod validation of the per-event API response.

</specifics>

<canonical_refs>
## Canonical References

- https://the-odds-api.com/sports-odds-data/betting-markets.html — `alternate_spreads` is per-event only ("additional markets need to be accessed one event at a time using the /events/{eventId}/odds endpoint"), US sports and selected bookmakers only, 1-minute update interval.
- https://the-odds-api.com/liveapi/guides/v4/ — credit-cost formula (per-event: markets × regions).

</canonical_refs>
