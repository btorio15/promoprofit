---
quick_id: 261021-hwm
slug: remove-extracted-from-statistics
date: 2026-10-21
type: quick
---

# Quick 261021-hwm: Remove extracted from Statistics

Owner: Statistics is site-wide profit available only; remove every extracted / marked-done figure.

## Task
- `dailyHistory.ts`: drop completions input, `extractedTotal`, per-group `extracted`, `CompletionRow`.
- `promoFunnel.ts`: drop `doneIds`, `markedDone`; "expired unused" becomes "expired".
- `get-stats.ts` / `profitHistory.ts`: stop loading completions; delete `loadCompletionRows`, `loadDonePromoIds`.
- UI: remove the Extracted profit figure, the Extracted column in group tables, Marked done and its note; scope note says site-wide profit available.
