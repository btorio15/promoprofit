# Requirements: MarginMind (PromoProfit) — Milestone v1.2 Intro Offers & No-Sweat

**Defined:** 2026-10-22
**Core Value:** Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.
**Milestone goal:** Turn intro (sign-up) offers and no-sweat promos into ranked, ready-to-place opportunities with exact lines.
**Research:** `.planning/research/SUMMARY.md` (2026-10-22)

## v1.2 Requirements

### No-sweat bet math

- [ ] **NSB-01**: For a no-sweat promo (stake, refund cap, min odds, refund paid as a bonus bet), the app computes the exact hedge: qualifying stake and odds, hedge book and stake, and the profit on each outcome, rounded to the cent with decimal.js
- [ ] **NSB-02**: The refund bonus bet is valued at the bonus-bet finder's current best conversion rate for that book and the member's hedge books (cached odds, no Odds API spend); if the refund book has no odds the offer shows "can't price" instead of a number
- [ ] **NSB-03**: The app searches every cached game and line that meets the promo's minimum odds and picks the qualifying line with the highest estimated profit
- [ ] **NSB-04**: Rounded-stake answers are checked in tests against a brute-force search over whole-dollar/cent stakes (test-only, not part of the app)

### No-sweat promos in the feed

- [ ] **FEED-01**: DraftKings, FanDuel and Bally Bet no-sweat promos for existing customers are recognised (parser + AI reader with an explicit no-sweat kind) instead of skipped; new-customer no-sweat offers go to Sign-up offers
- [ ] **FEED-02**: The 2026-10-08 case (a no-sweat bet read as a bonus bet) is a regression test; when the parser and reader disagree about no-sweat vs bonus bet the promo goes to review
- [ ] **FEED-03**: No-sweat opportunities are ranked inline in the Opportunities feed with the other promos, marked with a small "est." label and the conversion rate used
- [ ] **FEED-04**: No-sweat estimates never count toward the Dashboard totals, the profit graph's grey line, or the Statistics tab, which stay guaranteed-only
- [ ] **FEED-05**: Marking a no-sweat promo done records the profit the member actually made (entered or confirmed by the member), not the estimate

### Intro offers screen

- [ ] **INTRO-01**: The Sign-up offers screen ranks intro offers at books the member doesn't have by estimated value, best first
- [ ] **INTRO-02**: Each ranked offer shows the exact qualifying bet (game, line, odds, stake at the offer's book) and the hedge (book, line, stake), from cached odds
- [ ] **INTRO-03**: "Bet & get bonus bets" offers are valued correctly: win-only vs win-or-lose, bonus paid in installments with each installment's expiry, each installment valued at the live conversion rate
- [ ] **INTRO-04**: "No-sweat first bet" offers are valued with the NSB solver (NSB-01..03)
- [ ] **INTRO-05**: Each offer has a whole-plan view: step 1 place the qualifying bet and hedge, then each bonus bet as it arrives, linking to the bonus-bet finder to convert it
- [ ] **INTRO-06**: Intro offers are stored with structured terms (offer kind, qualifying stake, min odds, refund cap / bonus total, installments, requires-win, expiry); offers whose terms can't be read in full are marked "terms incomplete" and ranked lower
- [ ] **INTRO-07**: Offers at books whose odds aren't available (paid-tier Odds API books) show the headline only, under a "can't price" note, never invented odds

### More sportsbooks

- [ ] **BOOKS-01**: Hard Rock Bet promos and its intro offer are scraped from its public Colorado feed on every scheduled run, through the same parser, AI reader and review pipeline
- [ ] **BOOKS-02**: BetMGM's Colorado intro offer is scraped from its public promotions page and read by the AI reader
- [ ] **BOOKS-03**: BetRivers and theScore Bet: a time-boxed attempt to scrape their public promo/intro-offer pages; ship a scraper only if a public source works from GitHub Actions
- [ ] **BOOKS-04**: Caesars and Fanatics: a time-boxed check for a public, unprotected official promo page (like BetMGM's marketing page); ship a scraper only if one exists. No bypassing bot protection (no stealth, proxies, or forged sessions — D-09)
- [ ] **BOOKS-05**: Every new scraper fails soft: a block page or empty result never expires live promos (expire only after two consecutive empty runs), and a zero-result run is logged as a warning
- [ ] **BOOKS-06**: Each new scraper is proven by one real run on GitHub Actions before it counts as done

## Future Requirements

- Manual entry of intro offers for books that can't be scraped (owner or member)
- Manual add of no-sweat promos
- Floor (0% conversion) and sensitivity range on no-sweat estimates
- Separate "Estimated" feed section (owner chose inline with an "est." label)
- Pairing a sign-up offer with a promo at a held book; profit-per-day ranking; FanCash valuation; no-sweat in tandem pairs

## Out of Scope

- bet365 — not covered by the odds provider (no lines, can't be a hedge book)
- Deposit-match bonuses — playthrough rules make value unclear
- Bypassing bot protection on any book (Caesars, Fanatics, others) — ToS and security risk (D-09)
- Authenticated scraping / storing sportsbook credentials
- Treating no-sweat profit as guaranteed in totals, graph or Statistics
- Fanatics FanCash valued as bonus bets

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
