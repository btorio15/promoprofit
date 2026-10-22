# Feature Landscape: v1.2 Intro Offers & No-Sweat

**Domain:** Matched betting / promo conversion, Colorado regulated sportsbooks
**Researched:** 2026-10-22
**Scope:** only what the NEW v1.2 features need (NSB algorithm, NSB promos in feed, more-book scrapers, ranked Sign-up offers screen).
**Overall confidence:** MEDIUM. Mechanics and math are HIGH (standard, derived below). Current offer terms are MEDIUM/LOW: they come from affiliate aggregator pages that disagree with each other and change weekly. Offers must come from the scraper, never be hardcoded.

## 1. How the offers work (domain primer)

### No-sweat bet (NSB) / "first bet reset" / "second chance"
- Place a first cash bet (stake S) at any odds above a minimum (often -500 or longer; some books require roughly -200 to +500 bands). If it WINS you are paid normally (cash, stake returned) and the promo is worth nothing. If it LOSES the book refunds the stake as **bonus bets**, up to a cap (theScore Bet $1,000, BetRivers $250 to $500 "second chance", BetMGM up to $1,000/$1,500, bet365 $1,000 but bet365 is out of scope).
- Key mechanics that change the math:
  - Refund is in **bonus bets (stake not returned)**, so its cash value is only about 60 to 80 percent of face. That value is c (the live conversion rate from the existing bonus-bet finder).
  - Refund = min(S, cap). Stake above the cap is uninsured cash.
  - A push or void usually refunds the cash stake and gives no promo (worst outcome for the bettor; ties/pushes are a model risk).
  - Refund is often issued as several bonus bets (e.g. 2 to 6 pieces) with a 7-day expiry; the fragmented tokens convert slightly worse than one big bet because each piece needs its own market and hedge. Some books pay "No Sweat Tokens" or "bet resets" daily over days (BetMGM tokens over 10 days; Caesars $50 resets over 5 days), so it is a series, not one bet.
  - Qualifying bet usually cannot be cashed out early; min odds apply.
- "Second chance" is just the BetRivers-branded NSB (refund as bonus bet up to cap, historically $250 to $500).

### Optimal NSB strategy (what the algorithm must compute)
Let Ob = decimal odds on the qualifying bet, Oh = decimal odds on the opposing hedge (at another book, from The Odds API), R = min(S, cap), c = bonus-bet conversion rate (from the finder).
- If the qualifying bet wins: net = S(Ob-1) - H.
- If it loses: net = -S + c*R + H(Oh-1).
- Equalise both: **H = (S*Ob - c*R) / Oh**; profit = S(Ob-1) - H. Stake S = cap (maximum insured) unless the user sets a lower budget. The profit is an ESTIMATE because c*R is realised only if the refund converts at rate c. Label accordingly (already decided in PROJECT.md).
- **Longer odds on the qualifying bet raise the refund's expected value** (the loss probability q is higher so the refund pays out more often) but also cost more hedge vig. Practical outcome: the best line is typically about +150 to +300 on the qualifying side (the hedge then at about -150 to -400), not a heavy favorite or an extreme long shot. Because the hedge stake is solved exactly, the engine should **search the candidate lines (every game/market/side/alt line at the cached odds) and rank by estimated profit**; do not hard-code a target odds. Filter by the book's min odds.
- Rough value: a well-chosen NSB on a +200 line with c of about 0.72 yields roughly 15 to 30 percent of the cap in profit; long-shot extremes show diminishing returns once vig dominates. (MEDIUM; one blog claims up to about 60 percent of stake, which is not supported by this math and should not be quoted.)
- Reuse: `calculateBonusBetHedge` gives per-line conversion; the NSB solver should call the finder's best conversion rate (same cached odds), then run the exact equal-outcome formula with decimal.js and cent/whole-dollar rounding like `bonusBet.ts` (floor payouts, test both rounded stakes, pick max min-profit).
- Edge: the hedge on the loss branch is a bonus-bet conversion that happens LATER with a different odds snapshot, so use a conservative c (the finder's current best, perhaps shown with the number used).

### Bet & get offers
- Bet small cash amount (usually $5 to $10) at min odds (commonly -500 or longer), and receive a fixed bonus-bet package. Two sub-types:
  - **Win or lose** (bet365 $200, DraftKings $200): paid regardless.
  - **Only if the qualifying bet wins** (BetMGM Bet $10 get $150 "if your bet wins"; Hard Rock Bet $5 get $150 if it wins). Therefore the qualifying bet should be hedged (arb-like or low-vig) because a loss yields nothing; the cost is the vig on a small cash bet, and the bonus is received only on the win branch. This is NOT the same math as win-or-lose.
- **Installments**: DraftKings "Bet $5, get $200 paid over 21 days" = $50 every 7 days via click-to-claim (RotoGrinders 2026-10-22); Hard Rock = 6 x $25 bonus bets after settlement; Fanatics pays FanCash daily over 7 to 10 days. Each installment expires about 7 days after issue (Fanatics FanCash 24h to 7d). A value ranking must treat installments as N separate conversions (each converted at c, possibly at smaller bet sizes and with more hedge vig), and must flag the timeline ("done in 21 days").
- Fanatics' offers are **FanCash**, not bonus bets (1 FanCash = $1 non-withdrawable-ish credit with different rules), so treat as a different instrument and value it separately (or flag "not bonus bets, value TBD").
- Fanatics "bet match" (wager $1+ for 10 days, FanCash equal to each wager up to $100/day) is effectively a deposit-match-like series. **Per the owner decision, deposit-match is out of scope**; show as informational unless the structure is clearly bonus-credit bet & get.

## 2. Current Colorado intro offers (snapshot; scraper must be source of truth)

| Book | Offer as reported | Structure class | Source / date |
|---|---|---|---|
| BetMGM | "Bet $10, Get $150 in Bonus Bets if your bet wins" (SBD150); also "up to $1,500 first bet" and "up to $1,000 in No Sweat Tokens over 10 days" (RGBONUSGET) | Bet & get (win-only) AND/OR NSB tokens; sources conflict | sportsbettingdime 2026-06-01; RotoGrinders 2026-10-22. LOW: conflicting, check scraper |
| Caesars | "Bet $1+, Double Your Winnings Your Next 10 Wagers" (RGBAMDYW) and "up to $250 in five days of $50 bet resets" (SBDBR250) | Winnings boost series / daily bet resets (NSB series) | RotoGrinders (undated), sportsbettingdime 2026-06-01 |
| Fanatics | "Up to $1,000 matched in FanCash": wager $1+ for 10 days, FanCash = each wager up to $100/day, min odds -200, expires 7d; or "Bet $20 get $350 in FanCash", $50/day for 7 days, min -500, 24h expiry | FanCash match / bet & get in FanCash (not bonus bets) | RotoGrinders 2026-10-22 |
| BetRivers | "Second Chance bet up to $250" or "$500 2nd chance bonus bet" | NSB (refund as bonus bet) | milehighsports/aggregator, 2026 (LOW, figure conflicts) |
| Hard Rock Bet | "Bet $5, get $150 in bonus bets if bet wins": 6 x $25, min odds -500, expire 7 days, no code, qualifying bet cannot be cashed out | Bet & get (win-only), installment-like tokens | Hard Rock official CO page + CBS/Rotowire (launched CO July 2025) |
| theScore Bet | "Bet Reset up to $1,000" if first bet loses (codes DIME / RGMAX) | NSB, refund as bonus bet | sportsbettingdime 2026-06-01; RotoGrinders; CO launch Dec 2025 |
| DraftKings (for context, already supported book) | Bet $5 get $200, $50 every 7 days over 21 days, -500 min, 7-day expiry | Bet & get, win or lose, installments | RotoGrinders 2026-10-22 |
| FanDuel (context) | Bet $5 get $350 | Bet & get | RotoGrinders / sportsbettingdime |
| bet365 | Bet $10 get $200; safety net up to $1,000 | out of scope (no odds) | n/a |

Takeaway: the Colorado landscape is a mix of (a) NSB first-bet refunds (theScore, BetRivers, BetMGM variant), (b) win-only bet & get (BetMGM, Hard Rock), (c) win-or-lose bet & get with installments (DraftKings, FanDuel), (d) daily series/FanCash offers (Caesars, Fanatics, BetMGM tokens). The data model needs an explicit "offer structure" classifier rather than free text.

## Table Stakes

| Feature | Why expected | Complexity | Dependencies / notes |
|---|---|---|---|
| NSB hedge solver (exact, decimal.js, rounding rules, cap, min odds) | Core of milestone; formula H=(S*Ob - c*R)/Oh | Med | New `domain/hedge/noSweat.ts` modelled on `bonusBet.ts` (floor payouts, test both roundings, tie-break on smaller stake). Fixture tests by hand-calc |
| Refund valued at the live bonus-bet conversion rate c | Owner decision | Med | Needs finder's best conversion for that book from cached odds (`rankBonusBetHedges`); c is a function of the refund size, so compute using R |
| Search of qualifying lines across games/markets/alt lines, ranked by estimated profit | "Choice of odds" is where the value is | Med-High | Reuse odds cache; alt lines only if cached (credit budget). Respect min odds from the offer |
| "Estimated, not guaranteed" labelling plus show the c used and the win/lose branch nets | Honesty about a non-locked profit | Low | UI badge in feed and Sign-up screen |
| NSB promos no longer skipped in feed and ranked in Opportunities (labelled estimate) | Milestone goal | Med | Promo type enum in scraper/reader + feed ranking; mixing estimated and guaranteed profits in one sort needs a visible distinction (separate badge, maybe filter toggle) |
| Cap and min-odds handling (stake above cap uninsured; min odds enforced) | Wrong stake = real money loss | Med | Same pattern as boost caps in `profitBoost.ts` |
| Bet & get valuation (win-only vs win-or-lose) | Different math, otherwise misranked | Med | Win-only: cost = vig on hedged qualifying bet, value = N bonus bets at c. Win-or-lose: cost = small vig plus loss risk |
| Installments as N conversions with a timeline and expiry | DK/Hard Rock/Fanatics pay over days | Med | Value = sum(installment x c), show "$50 x 4 over 21 days"; need per-offer structured fields (amount, count, interval, expiry) |
| Structured offer fields from scraper (type, stake required, min odds, cap, bonus total, installments, expiry, FanCash vs bonus bet) | Ranking needs numbers, not text | High | Extend Claude Haiku promo reader schema + verbatim guard; existing `offer.bonusLabel` only holds a label |
| Scrapers for BetMGM, Fanatics, Caesars, BetRivers, Hard Rock, theScore | Milestone | High (per book, feasibility varies) | Anti-bot/login walls; fall back to manual-add. Per-book "as feasible" |
| Ranked Sign-up screen for books the member lacks, with: offer name, value ($ est.), qualifying line (game, side, odds, book), qualifying stake, hedge book and stake, how to convert the bonus bets | Milestone goal | High | Reuses `SignupOffersScreen`/`getSignupOffers`, "books I have" filter, odds cache |
| Odds age / "refresh odds" visibility and a "no suitable line right now" empty state | Odds cached, free tier | Low | Existing credit meter and odds age component |
| Account-risk advisory (existing footnote) | Existing convention | Low | Reuse |

## Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| Best-line search with live c showing sensitivity (e.g. profit at c=65/72/80%) | Honest range on an estimate | Low-Med | Pure function re-run; display range |
| Total plan value per book including follow-up steps ("Step 1 qualify, Step 2 convert $X bonus bet on this market at this hedge") | Matches how people actually work; one tap = whole plan | Med | Reuse finder output for conversion step |
| Rank by profit per effort/time and per capital tied up (bankroll needed, days to complete) | Installment offers differ greatly in days to finish | Med | Needs structured fields |
| Pairing: sign-up offer qualifying leg at a book the user has plus the new-book leg | Two-leg arbitrage-style with promo at one end | High | Builds on competing-promo tandem logic; defer |
| Cross-checking scraped offer against aggregator or flagging "offer changed since last scrape" | Offers are volatile and sources conflict | Med | Existing review queue ("Needs a look") |
| Mark offer "done" and profit recording for sign-up offers | Ties into v1.1 stats | Med | Existing Mark done flow |
| Cap-sized stake recommendation ("insure the full $X") with option for lower budget | Practical; users have varied bankrolls | Low | Input for max qualifying stake, like finder's hedge cap |

## Anti-Features

| Anti-Feature | Why avoid | Do instead |
|---|---|---|
| Deposit-match offers (e.g. Fanatics "match" if unclear) | Owner decision; playthrough makes value unclear | Show as informational "not ranked" |
| bet365 offers or bet365 as a hedge book | No odds coverage | Excluded |
| Presenting NSB profit as "guaranteed" | The refund conversion is a future estimate | Always "estimated"; show c and branch nets |
| Hard-coded offer amounts/terms | Offers change weekly; aggregators conflict (BetMGM $150 vs $1,500 vs $1,000 tokens) | Scraped, with verbatim guard and review queue |
| Authenticated scraping / user logins to see personalized offers | Existing out-of-scope (security, ToS) | Public pages plus manual-add |
| Promo-code affiliate links / "claim" tracking | Not the product; ethical noise | Plain "View on book" link (existing) |
| Auto-refresh odds to fill Sign-up screen | Free-tier credit budget | Use cache and the manual refresh button |
| Valuing FanCash as bonus bets without evidence | Different instrument, different expiry | Flag separately or exclude until verified |
| Multi-state or exchange hedges | Out of scope | n/a |
| Saved per-user offer progress/balances beyond Mark done | Out of scope (nothing saved) | Keep stateless |

## Feature Dependencies

```
Structured offer schema (scraper/reader) -> Sign-up ranking
Scrapers per book -> offers exist to rank (and NSB promos in feed)
Bonus-bet finder conversion (existing) -> NSB solver (c) -> NSB feed items -> Sign-up NSB offers
Cached odds (existing) + books I have (existing) -> qualifying-line search
Installment model -> bet&get valuation -> Sign-up ranking
Promo type enum extension (nosweat) -> feed ranking with estimate label
```

## MVP Recommendation

Prioritize:
1. NSB solver plus fixtures (pure domain, no UI) with finder's c, cap, min odds.
2. Structured intro-offer schema (type, stake, min odds, cap, installments, expiry) and the reader update.
3. NSB promos in the feed with an "Estimate" badge, sorted but visibly distinct from guaranteed.
4. Ranked Sign-up screen with exact qualifying line, stakes, hedge book, convert-the-bonus step.
5. Scrapers in order of feasibility, starting with books that already publish plain offers (Hard Rock official CO page has clear terms), with manual-add fallback for blocked ones.

Defer: two-leg pairing with sign-up offers; sensitivity ranges; profit per day ranking; FanCash valuation.

## Sources

- [RotoGrinders Colorado offers, updated 2026-10-22](https://rotogrinders.com/sports-betting/colorado-online-sports-betting): Fanatics, BetMGM, DK, Caesars, theScore (MEDIUM, affiliate)
- [SportsBettingDime Colorado bonus offers, updated 2026-06-01](https://www.sportsbettingdime.com/colorado/bonus-offers): DK installments, Caesars resets, Fanatics match (MEDIUM, affiliate; may be stale)
- Hard Rock Bet Colorado page via search (official hardrock.bet/sportsbook/colorado/, CBS Sports, Rotowire): $5/$150 as 6x$25, -500, 7-day expiry (MEDIUM; reports differ on whether the bonus arrives instantly or after a winning settlement)
- [Wikipedia: Matched betting](https://en.wikipedia.org/wiki/Matched_betting) and [On the Juice NSB maximisation](https://juicereel.beehiiv.com/p/how-to-maximize-the-no-sweat-bet): general mechanics (LOW-MEDIUM; the blog's EV figure is unverified)
- NSB hedge formula: derived from the equal-outcome condition (HIGH, algebra); should be verified in fixtures.
- Existing code reviewed: `src/domain/hedge/bonusBet.ts` (exact equal-outcome solver with floor payouts and two-rounding comparison), `src/components/signup/SignupOffersScreen.tsx` (raw text, informational, grouped by book, "show books I already have" toggle, no hedge math).
