---
quick_id: 261022-hn4
slug: v1-1-audit-cleanup
status: complete
date: 2026-10-22
---

# Quick 261022-hn4 Summary

- Edit / soft-delete of a member's own promo now also clears that member's member_profit_observations rows for it (and pairs where it is the partner); ownership via EXISTS subquery, edit only while active. Tests added in addedPromos.test.ts.
- Statistics loaders split into buildDailyProfitHistoryQuery / buildFunnelPromosQuery; new profitHistory.test.ts asserts both filter `added_by_user_id is null`.
- console.error spies restored with onTestFinished; stale comments refreshed.

npm test 1981 passed; lint clean; tsc clean apart from the stale generated .next file. First commit c865962.
