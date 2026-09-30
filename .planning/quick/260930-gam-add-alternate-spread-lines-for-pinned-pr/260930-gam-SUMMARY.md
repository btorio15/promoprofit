---
phase: quick-260930-gam
plan: 01
subsystem: odds-ingestion, promo-ranking
tags: [alternate_spreads, odds-api, pinned-promos]
requirements: [QUICK-260930-gam]
key-files:
  created: [src/domain/promos/altSpreads.ts, src/domain/promos/altSpreads.test.ts]
  modified:
    - src/domain/promos/selection.ts
    - src/domain/promos/selection.test.ts
    - src/domain/promos/rankPromoHedges.test.ts
    - src/ingestion/odds/client.ts
    - src/ingestion/odds/client.test.ts
    - src/ingestion/odds/refreshExtended.ts
    - src/ingestion/odds/refreshExtended.test.ts
    - src/app/actions/refresh-spreads-totals.ts
    - src/components/arb/ArbForm.tsx
    - src/components/arb/SearchSpreadsTotalsDialog.tsx
decisions:
  - "Alt markets are merged into the existing cached_extended_odds raw_response; no migration."
  - "Exact-line matching only (promo line and its exact negation); no nearby/middle lines."
  - "altLines outcome carries an extra unmatchedOutcomes count so assumption A2 mismatches are visible."
metrics:
  tasks: 3
  completed: 2026-09-30
---

# Quick 260930-gam: Alternate spread lines for pinned promo games

Promos pinned to a non-main spread line (e.g. home -6.5 while books show -7.5) now resolve against a cached `alternate_spreads` market, fetched per event (max 5, soonest first) only on the confirmed "Search spreads & totals" press, and hedge at the exact opposite line.

## Commits
- 9372a3c: pure helpers (`altSpreads.ts`) and exact-line fallback in `resolveSpread`
- b8a9cdd: `fetchEventOdds` client, capped alt fetch in `runSpreadsTotalsRefresh`, action wiring
- 51d5ed1: Arbitrage tab info banner and dialog credit note

## What changed
- `selectAltSpreadTargets` dedupes per event, skips events whose main line already covers every pin at every book, sorts by commence asc, caps at 5, reports `skippedOverLimit`. `mergeAltSpreads` is immutable and limited to allowed books.
- `resolveSpread` keeps the main-line loop unchanged, then for books without a main-line quote reads `alternate_spreads` using exact half-point matching on the promo line and its negation. Enumeration and totals untouched.
- `fetchEventOdds` hits `/sports/{sport}/events/{id}/odds`, 404 returns `event: null`, errors never leak URL or key, body validated with `OddsEventSchema`.
- Refresh: pins come only from `getActivePromos(now, user.userId)` in the action (confirmed press only; load failure falls back to no pins). Alt fetch runs after the sport loop inside the existing lock, sequentially, each in its own try/catch. Skipped when `balance - targets*ceil(books/10) < CREDIT_BLOCK_THRESHOLD`. Alt credits fold into the single `recordCreditUsage` call (with `triggeredByUserId`); `sportsFetched` stays `inSeason.length`.
- Outcome `altLines: { fetched, skippedOverLimit, skippedForCredits, failed, unmatchedOutcomes }`. ArbForm shows a neutral info banner for skips, failures and unmatched names; the dialog notes "up to 5 more credits".

## Deviations from Plan
- [Rule 2] Added `unmatchedOutcomes` to `altLines` (and `countUnmatchedAltOutcomes` helper + banner text) per the plan-checker warning on assumption A2, so a team-name mismatch is counted and shown rather than silently dropped.

## Verification
Full vitest suite: 93 files, 1400 tests pass (Odds API and DB mocked throughout). `tsc --noEmit` clean apart from the known `LayoutProps` artifact in `src/app/layout.tsx`. `fetchEventOdds` is referenced only from `client.ts` and `refreshExtended.ts` (plus tests). No migration; `schema.ts` unchanged.

## Notes
- Alt lines persist only for events fetched on the most recent press; a later press by another member replaces them.
- Assumption A2 (alt outcome names equal event home/away names) should be confirmed on the first live press; watch `altLines.unmatchedOutcomes` / the info banner.
- The hedge-line guarantee to the cent is covered by a rankPromoHedges test (boost +300 vs hedge -275 at the exact alt line: hedge $146.66, profit $3.33).

## Self-Check: PASSED
