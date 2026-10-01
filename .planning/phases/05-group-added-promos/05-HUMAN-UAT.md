---
status: complete
phase: 05-group-added-promos
source: [05-VERIFICATION.md]
started: 2026-09-30T00:00:00Z
updated: 2026-10-01T01:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Added promos stay personal across two real member sessions
expected: Member A adds a promo; A sees it in Promos (with the "Added by you" badge), in Opportunities, and in Done after marking it. Member B, logged in separately, never sees A's promo in Promos, Opportunities, or Done, and B's "profit available" total is unchanged.
result: pass

### 2. Phone-width walkthrough of add, edit, expire and delete
expected: At ~375px wide, the Add promo form (bonus bet and profit boost), game picker, expiry field and Expire/Delete dialogs are usable with no horizontal scroll; saving, editing, expiring and deleting each update the Promos list and Opportunities feed immediately.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
