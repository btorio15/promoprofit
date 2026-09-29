---
phase: quick-260929-gcn
verified: 2026-09-29T00:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Quick 260929-gcn Verification

Verified against code on main (not SUMMARY claims).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | LONHLPBT0929 window 2026-09-29T04:00Z..2026-10-01T03:59:59.999Z | VERIFIED | fanduel.ts buildCandidate multiDay branch uses etDayBounds(start).start / etDayBounds(end).end with no expiry extension; fanduel.test.ts asserts the exact values on a live-capture fixture; tests pass |
| 2 | Non-explicit/ambiguous dates stay null; single-date and single-game branches unchanged | VERIFIED | parseEtDateSpan null => falls through; existing extractScope/parseGameScope branches retained verbatim; existing tests pass unedited |
| 3 | maxStake still null, unparsedCapFields has maxStake | VERIFIED | Asserted in test; verbatimGuard/reconcile/finePrint/sportHints show no diff |
| 4 | Through selector in review UI, default same day | VERIFIED | ThroughDaySelect rendered in QueueItemCard and ClassifyQueueCard; scopeInputFromValue(eventValue, throughValue) used at save |
| 5 | Server recomputes bounds, rejects end<start/impossible/past-window, stale only on end day | VERIFIED | memberScope.ts diff: etDayBounds on both, string compare, stale on endBounds.end, window check on both starts; zod etEndDate regex within strictObject; actions pass it through |
| 6 | Single-day payload unchanged | VERIFIED | etEndDate key only spread when defined; single-day messages preserved; existing tests unedited |
| 7 | Prefill from scraped window | VERIFIED | scrapedWindow in dto/get-promos; prefillSportDay called in both cards |

## Checks
- Vitest on domain/promos, fanduel, actions: 27 files / 469 tests passed (verifier run); orchestrator full suite 1016 passed, tsc exit 0.
- No TBD/FIXME/XXX markers in modified source files.
- git diff of verbatimGuard.ts, reconcile.ts, finePrint.ts, sportHints.ts: empty.

## Not verified (non-blocking)
- Visual layout of the Through selector was not checked in a browser (code wiring only). Lint was not re-run by the verifier.

## Gaps
None.
