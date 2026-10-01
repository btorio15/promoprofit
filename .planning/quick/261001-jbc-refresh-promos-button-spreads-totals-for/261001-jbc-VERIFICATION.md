---
phase: quick-261001-jbc
verified: 2026-10-01T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Press 'Refresh promos' in the status bar with live data"
    expected: "Dialog names promo sports, estimated credits and balance; confirm refreshes only those sports; pages update in place; no-promo member sees 'No active promos to refresh.'"
    why_human: "Visual/live UI and real Odds API/DB behavior cannot be exercised read-only"
---

# quick-261001-jbc Verification

All 7 must-have truths verified in code (not from SUMMARY):
- Button: OddsStatusBar uses usePromoRefresh, label "Refresh promos"; "Spreads & alt lines" absent; ArbForm still uses useSpreadsTotalsSearch.
- Confirm gate: runner returns confirm_required (with sportKeys, estimate = main + alt quote) before any fetch when !confirmed.
- No promos: action short-circuits (feedPromos empty) and runner returns no_promos when no in-season target; no fetch, no credit row.
- Scoped fetch: targets = inSeason filtered to scope.sportKeys, one h2h/spreads/totals call per sport; shared alt section (cap/skip/credit gate) reused.
- Cache merge: commitPromoSportsRefresh does per-sport replace + started-event purge only (no fetched_at purge); queries.ts dropped latest-batch filter, returns per-event fetchedAtByEventId and oldest-live fetchedAt; priceAge/get-promos/get-opportunities wired.
- Credit row: single recordCreditUsage in finally with refreshCost = summed quota.last, triggeredByUserId, sportsFetched = inSeason.length.
- Arbitrage unchanged: unscoped path still uses commitSpreadsTotalsRefresh; ArbForm untouched; existing tests pass.

Spot-checks: full `npx vitest run` 118 files / 1634 tests pass; `npx tsc --noEmit` clean; no drizzle migration added.

Anti-patterns: none found (no TBD/FIXME in changed core files checked).

Human verification: live UI flow above (visual, real credits).
