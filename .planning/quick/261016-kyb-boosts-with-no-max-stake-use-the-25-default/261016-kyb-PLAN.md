---
quick_id: 261016-kyb
slug: boosts-with-no-max-stake-use-the-25-default
date: 2026-10-16
---

# Quick 261016-kyb: boosts with no max stake use the $25 default

Bug: quick 261014-u6k ("every promo at $25 unless the member sets a per-book/per-promo cap") only changed
ranking. The older D-18/CR-04 rule still held every profit boost with no readable max stake in
pending_review/caps, so it never reached the feed (live: FanDuel promos 84, 86).

## Tasks
1. `statusAfterMatch`: never require maxStake (drop it from the review fields); other unparsed caps still review.
2. Reconcile rescue: stop flagging maxStake as missing.
3. Remove the max-stake activation guards in enterPromoCaps / applyCapEntry / applyClassification; a typed max stake is still saved.
4. Add-promo form: max stake optional (blank = book cap / $25), schema + draft + copy.
5. Update tests; push; rescrape so stuck caps rows are released (decideScrapedWrite refreshes caps rows).
