# Quick 260929-igk: Mark-done snapshots, Done tab, total profit extracted

Marking a promo done now saves a server-recomputed frozen snapshot and exact-cent profit; a new Done tab renders only from snapshots; "Total profit extracted" sits beside "Total profit possible".

**Migration 0009 (`drizzle/0009_done_snapshots.sql`) is generated and committed but NOT applied. The orchestrator must run `npm run db:migrate` after merge.**

## Commits
- a85add2: schema + migration 0009, doneSnapshot module + tests, shared row mapper (promoRowDto.ts), getPromoCompletions / markPromoDone
- 7c53be7: computeMemberPromoState, mark-done/undo actions, getPromos done split + totalExtracted, tests (incl. parity)
- 79bff9c: Active/Done tabs, DonePromoRow, Mark done button, ProfitSummary, `used` flag removed

## Deviations
- [Rule 2/plan-checker] `DonePromoTerms` includes `title` (display title via `promoTitle`, e.g. "10% profit boost") so hedge snapshots carry a proper title; legacy Done rows use parsed.title, else `promoTitle` from promo term columns (getPromoCompletions also selects boostPercent / boostedOddsAmerican / bonusAmount), else "Promo #id".
- Mark done / Undo buttons use `min-h-10` (size sm is 28px).
- Doc comments containing "Mark used" reworded so the Task 3 grep passes honestly.
- The plan's Task 2 grep `markPromoUsed(` also matches the retained `unmarkPromoUsed(`; the removed `markPromoUsed` function itself has no callers.

## Verification
vitest: 70 files / 1089 tests pass; `npx tsc --noEmit` clean (after `npx next typegen`); `npm run lint` clean.

## Known Stubs
None.

## Self-Check: PASSED
