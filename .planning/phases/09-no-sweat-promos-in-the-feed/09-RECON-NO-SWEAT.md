# Phase 9 Recon: No-Sweat Promos (DraftKings, FanDuel, Bally Bet)

## Date and requests used

Run on 2026-11-03 (Denver) with `scripts/recon-no-sweat.ts`. It calls each scraper's own `listRequest` through `fetchRequest`: plain public HTTP, no login, no stealth, no proxy. Cookie/session/auth/token-like keys are stripped before saving. Search pattern for no-sweat-like entries: `no[- ]sweat|bet back|second chance|money back|stake back|refund`.

Fixtures saved (note: dated 2026-11-03, not 2026-10 as the plan guessed):

- `src/test/fixtures/promos/draftkings-promos-2026-11-03.json` (19 titled entries)
- `src/test/fixtures/promos/fanduel-promos-2026-11-03.json` (10 titled entries)
- `src/test/fixtures/promos/ballybet-promos-2026-11-03.json` (32 titled entries)
- `src/test/fixtures/promos/ballybet-promo-detail-sbk-second-chance-bet-01.json`

All three requests succeeded.

## DraftKings

No real no-sweat offer is live today. The only regex hits were false positives: "ESPN & DraftKings Account Linking" and "ESPN MNF Sweepstakes" (the word "refund"/"sweep" in terms text), "Opt in and set a budget to win NFL Tickets" (its background image file is named "WNBA No Sweat", an old asset), and "New Customers: Deposit Bonus up to $1,000" (a new-customer deposit match, not a no-sweat).

Entry shape (from the racing "Bet Back" entry and all current entries): `promotionId`, `category`, and a `merchandisingData`-style block with `promotionHeadline`, `promotionDescription`, `terms`, `termsHighlights`, plus `loggedOut*` copies. Title is `promotionHeadline`; terms are `terms`/`termsHighlights`; caps and min odds would be written inside `terms` text (for example "MAX REWARD: $N").

New-customer tagging: `category: "New Customers"` (and "Deposit Bonus" for deposit matches). Existing-customer offers use categories like "Click to Claim" (opt-in boosts) and "Bet and Get".

Code gates that would drop a DraftKings no-sweat today: `MENTIONS_BOOST_OR_BONUS_RE` and `BOOST_PERCENT_RE` in `draftkings.ts` (a headline such as "NBA No Sweat Bet" without boost/bonus wording is not picked up). The London text pinned in `exclusions.test.ts` lines 191-197 is the only wording on record.

## FanDuel

No no-sweat offer is live. Closest items:

- "NBA Bet Protect+ Enhancements" (promoCode `NBABPSTATIC1103`): injury protection on full-game bets, not a stake-back-on-loss offer. The list entry carries only `title`, `name`, and `rewardDefinition.variant: "UNSUPPORTED_REWARD"`, with no terms, cap or odds in the list payload.
- "Bet $5, Get $50 for 4 days": a bonus-bet reward (`type: "BONUS_BET"`), not a no-sweat.
- "Refer-A-Friend Get Bonus Bets": referral, excluded.

Fields: title in `title`, marketing sentence in `name`, reward kind in `customerPromotionState.rewardDefinition.variant`, scope tags in `tags`. Terms are not in the list payload (they sit behind detail requests). New versus existing customers is not tagged in the list.

Code gate: `classifyFanduelEntry` returns not_a_promo unless `BOOST_OR_BONUS_TOKEN_RE` matches, so a "No Sweat" or "Bet Protect" title is dropped.

## Bally Bet

One live entry: "Second Chance Bet" (promotion slug `sbk-second-chance-bet-01`, card `sys.id` `5BiNhHU6u6lct2z3pfCjiZ`).

- List card: `title` "Second Chance Bet", `description` "Available on Select Days. Check Your Rewards Tab!", `link.url` `/promotions/sbk-second-chance-bet-01`, `segmentation` shows to logged-in and logged-out.
- Detail (`componentType: "promotion_details"`): wording "Up to 100% Second Chance Bet". Terms text: place a qualifying real-money wager using a Second Chance Bet Token; if it loses, receive a Bonus Bet Token equal to a percentage of the original stake, up to 100%; the bonus bet expires 7 days after crediting. A push or cash out voids it; the token is picked from the Rewards tab before the wager.
- Refund form: bonus bet (stake not returned as cash).
- Cap: no dollar cap in the text, only "up to 100%" of the stake and a per-account "may only utilize this promotion once". Min odds and game scope: none stated; the token is "available on select days" through 2026-12-31.
- Customer tagging: no new-customer marker; the token is delivered to existing customers via the Rewards tab, so this is an existing-customer offer. The percentage actually granted is shown only in the logged-in Rewards tab, so the exact refund percent per user is not knowable from public data.

Code gate: `isQualifyingTitle` in `ballybet.ts` requires a boost/bonus keyword AND a % or $ in the title, so "Second Chance Bet" is dropped and no detail request is ever planned for it.

## Decision

- DraftKings: BUILD from reconstructed fixture (no live no-sweat today; plan 09-10 builds `src/test/fixtures/promos/draftkings-no-sweat-reconstructed.json` from the racing entry's JSON shape in `draftkings-promos-2026-09-28.json` and the exact London text, clearly labelled reconstructed).
- FanDuel: FIXTURE PENDING (shared detector + reader only; synthetic labelled tests).
- Bally Bet: BUILD from src/test/fixtures/promos/ballybet-promo-detail-sbk-second-chance-bet-01.json (live list card in `ballybet-promos-2026-11-03.json`; the amount is "up to 100%" with no dollar cap, so the builder must treat it as a percentage-of-stake bonus-bet refund of unknown exact size).
