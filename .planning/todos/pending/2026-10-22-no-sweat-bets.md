---
created: 2026-10-22T00:00:00Z
title: Support no-sweat bets (normal promos and intro offers) with a hedge algorithm
area: promos
resolves_phase: 10
files:
  - src/ingestion/promos/exclusions.ts
  - src/ingestion/promos/reviewTriage.ts
  - src/domain/promos/scraped.ts
  - src/ingestion/promos/promoReading.ts
  - src/domain/hedge/
  - src/db/schema.ts (signup_offers)
---

## Problem
No-sweat bets ("bet back", "second chance": a losing first bet is refunded as a bonus bet, usually up to a cap) are skipped today. Quick 261016-k8a made `no_sweat` a clear skip reason so they never reach review or the feed, because the app had no math for them and the reader was misreading them as bonus bets. That leaves real value unused: books run no-sweats both as ongoing promotions and as new-customer intro offers (signup offers).

## Solution
Add a no-sweat promo type with its own hedge algorithm and use it for both regular promos and intro offers:
- Math: stake S on the no-sweat side (book A, decimal odds dA), hedge H on the other side (book B, dB). If A wins: S(dA-1) - H. If A loses: -S + H(dB-1) + R*c, where R = refund (min(S, cap)) and c = assumed bonus-bet conversion rate. Pick H to equalize both outcomes; profit depends on c, so show the conversion assumption next to the number. Exact math with decimal.js; table-driven tests against hand-calculated examples (like bonusBet.ts / profitBoost.ts).
- Conversion rate: start with a fixed default (e.g. ~70%) that the owner can adjust; later could use the app's own bonus-bet conversion history.
- Ingestion: turn the `no_sweat` skip into a recognized promo type (refund cap, min odds, eligible sport/market, intro vs existing customer); update the promo reader prompt and review triage.
- Intro offers: apply the same algorithm to signup offers that are no-sweat ("first bet back up to $X").
- Feed and Statistics: rank no-sweat opportunities alongside bonus bets and boosts; label them clearly since profit is an estimate (it depends on the conversion assumption), unlike the guaranteed numbers elsewhere.
