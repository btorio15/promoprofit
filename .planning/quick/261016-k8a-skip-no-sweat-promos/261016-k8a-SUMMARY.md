---
quick_id: 261016-k8a
status: complete
date: 2026-10-16
---

# Quick 261016-k8a: skip no-sweat promos — Summary

- New clear skip reason `no_sweat` (`SKIP_REASONS`, `CLEAR_SKIP_REASONS`). `classifyExclusion` returns it for
  "no sweat"/"no-sweat" in title/text or a DraftKings "No Sweat" category, right after the deposit check.
- Being a clear reason, the AI reader can never rescue it into a bonus_bet candidate (a `not_a_promo` skip could be).
- Reader prompt lists no-sweat offers as not_usable; PROMO_READER_PROMPT_VERSION -> 2026-10-16.2 (re-reads cached promos once).
- Fixture change: DK 1127122 (racing "Bet Back", category "No Sweat") moves not_a_promo -> no_sweat.
- Tests: 1917 pass; tsc clean outside stale `.next`; eslint clean.
- Not done: live pending row 94 (DK NFL London No Sweat) still needs dismissing in the app (DB write was not permitted from the CLI).
