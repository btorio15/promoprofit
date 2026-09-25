---
status: partial
phase: 01-bonus-bet-finder
source: [01-VERIFICATION.md]
started: 2026-09-25T23:20:52Z
updated: 2026-09-25T23:20:52Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live refresh after WR-03 refresh_lock migration
expected: With migration 0001 (refresh_lock) applied, pressing "Refresh odds" in the finder (or running `npm run odds:refresh -- --yes`) completes with status "ok" — odds age resets, credits drop by about the in-season sport count, results recompute — rather than the generic "Couldn't refresh odds" error.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
