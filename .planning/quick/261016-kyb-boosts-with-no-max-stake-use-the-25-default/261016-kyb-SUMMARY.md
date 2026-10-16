---
quick_id: 261016-kyb
status: complete
date: 2026-10-16
---

# Quick 261016-kyb — Summary

- `statusAfterMatch` drops "maxStake" from the fields that hold a promo in review; a boost with no max stake goes
  active and is ranked at the member's book cap or the $25 default (applyMemberCaps). minOdds/maxWinnings still review.
- Reconcile rescue no longer adds "maxStake" to unparsed fields.
- Removed CR-04 max-stake activation guards (enter-promo-caps, applyCapEntry WHERE, applyClassification). A max stake
  typed on a caps card is still saved.
- Add-promo: "Max stake (optional)", blank saves null; hint "Leave blank to use your max bet for this book ($25 unless you change it in Settings)."
- Existing caps rows held only for max stake are released by the next scrape (decideScrapedWrite refresh path).
- Group-level observations/stats still skip boosts with no own cap (stripMemberCaps), unchanged.
- 1918 tests pass; tsc clean outside stale `.next`; eslint clean.
