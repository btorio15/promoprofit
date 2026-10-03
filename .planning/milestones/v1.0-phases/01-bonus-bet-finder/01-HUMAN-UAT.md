---
status: complete
phase: 01-bonus-bet-finder
source: [01-VERIFICATION.md]
started: 2026-09-25T23:20:52Z
updated: 2026-09-25T23:24:58Z
---

## Current Test

[complete]

## Tests

### 1. Live refresh after WR-03 refresh_lock migration
expected: With migration 0001 (refresh_lock) applied, pressing "Refresh odds" in the finder (or running `npm run odds:refresh -- --yes`) completes with status "ok" — odds age resets, credits drop by about the in-season sport count, results recompute — rather than the generic "Couldn't refresh odds" error.
result: passed — live refresh at 2026-09-25T23:27:43Z, 3 credits, 487 remaining, lock released

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
