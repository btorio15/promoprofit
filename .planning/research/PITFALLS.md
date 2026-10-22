# Pitfalls Research (v1.2 Intro Offers & No-Sweat)

**Domain:** Adding no-sweat bet (NSB) math, intro-offer valuation and six new book scrapers to an existing exact-math matched-betting tool
**Researched:** 2026-10-22
**Confidence:** MEDIUM. Offer mechanics (NSB refund rules, installments, one-per-person, account risk) come from matched-betting domain knowledge and the existing codebase and are not re-verified against live book T&Cs. Integration pitfalls come from the repo (bonusBet.ts, signupOffers.ts, scrapeTargets.ts, the 2026-10-08 reader incident). Scraper-posture claims for the six books rest on the prior recon in scrapeTargets.ts and need fresh recon.

The v1.0 pitfalls file (bonus-bet stake-not-returned, float math, odds staleness, and so on) is superseded by this one. Those rules are now encoded in the hedge engine and tests. Keep the stake-not-returned rule as a regression oracle.

## Critical Pitfalls

### 1. Estimated profit leaks into places that promise "guaranteed" (ranking, totals, graph, Statistics)
**What goes wrong:** NSB profit depends on the refund conversion rate, which is an estimate, but the Dashboard totals, the grey "available" graph line, the Statistics daily-available chart and the funnel sum "profit available" from one numeric field. An NSB worth an estimated $38 then outranks a guaranteed $30 boost, inflates the grey line, and the owner's "correct to the cent" promise is silently broken. The v1.1 graph was explicitly "no estimates", and Statistics counts "each promo once at its best", so an NSB can also win "best promo".
**Why it happens:** One `profit` Decimal column or type, shared by every consumer. Adding NSB as another opportunity row reuses the same sort and sum code.
**Consequences:** Overstated available profit, a graph that is not reproducible from stored odds, trust loss.
**Prevention:**
- Carry a `certainty: "guaranteed" | "estimated"` discriminator on the domain type. Make `guaranteedProfit` and `estimatedProfit` separate fields, so the type system prevents summing them.
- Rank guaranteed first. Either put estimates in a separate section or sort by a conservative value, and never interleave them silently. Decide this explicitly in the roadmap.
- The daily per-member available record (migration 0012), the graph, the totals card and Statistics must filter to guaranteed only, or show estimates as a separate, visibly different series. Add a test that fails if an estimated row reaches those aggregators.
- Label every estimated number with "est." and the assumed conversion %, as the UI-visible text and not only a tooltip.
- Do not backfill or mutate historical records. Adding an estimated column must not change the existing grey-line values.
**Detection:** Totals change on deploy with no new guaranteed promo. An NSB tops the feed. Grey line jumps.
**Phase:** NSB algorithm (type design) first, then the feed phase (ranking), with a verification check on graph and Statistics.

### 2. NSB math errors
**What goes wrong:** The common mistakes:
- **Refund cap vs stake.** The refund is `min(lost stake, cap)`. With a $1000 cap and a $1500 stake, the refund is $1000, not $1500. The optimal stake is often the cap or below it, because stake beyond the cap earns no refund. Treat the cap as the stake limit in the optimizer. Do not just use the entered stake.
- **Refund is a bonus bet, not cash.** Value it as `refund x conversion rate`. Some books pay cash or "site credit" in a few promos. The reader must capture the refund form, and cash refunds are guaranteed, not estimated.
- **Refund only on loss.** On a win the user gets normal cash payout. The two outcomes are asymmetric: win-case profit = payout - stake - hedge loss. Lose-case profit = hedge win - stake + refund value. Use the same equalization as in the existing engine, with the refund term added only to the lose branch.
- **Minimum odds** on the qualifying bet (for example -500 or longer, or +100 or longer). Failing it voids the promo. Enforce min odds as a hard filter on the qualifying leg, not as a warning.
- **Push or void** refunds nothing and returns the stake. Ties (the existing "Tie risk" NFL badge) behave differently: the qualifying bet is not a loss, so no refund.
- **Same-game parlays, boosted or promo-excluded markets, live bets.** Many NSBs exclude them. Restrict to straight bets on allowed markets.
- **Refund expiry** (7 to 14 days). The conversion step has a deadline. Show it.
- **Rounding.** Round the stakes to whole dollars or cents, then recompute profit from the rounded stakes (the existing pairMath rule). Never display profit from pre-rounded stakes.
- **Hedge limit/odds shift.** Both legs must be re-checked against the odds age.
**Prevention:** Build NSB as its own explicit function, like `bonusBet.ts`, with a table-driven fixture test hand-computed per case (cap binding, cap not binding, win/lose, +/- odds, min-odds failure, rounding). Reuse the `pairMath.oracle.ts` pattern: an independent brute-force oracle that scans integer stakes and compares. Property-test that the refund never exceeds the cap and that the lose-case profit never uses a refund greater than the lost stake.
**Detection:** Win-case and lose-case profit differ by more than one rounding step. A displayed profit that doesn't recompute from displayed stakes.
**Phase:** NSB algorithm.

### 3. Conversion-rate assumption is circular, unstable or presented as fact
**What goes wrong:**
- The finder's "best conversion rate" is the maximum over every cached game for a given book and amount. Taking the maximum biases upward (winner's curse). An NSB valued at the single best market assumes the user can place the refund there, but the best market may be at a different time or sport, or capped by a hedge limit.
- The refund bonus is at the same book as the NSB, so the conversion rate must be computed for that book's bonus bet (the odds, not the qualifying bet's own market).
- The refund amount is not known when the qualifying bet is placed. The optimizer then depends on the rate, which depends on the refund, which depends on the stake. If this is not a single closed-form step it loops or is inconsistent.
- The rate moves with every odds refresh, so the NSB estimate changes between page loads, and the stored history becomes irreproducible.
- A fixed 70% fallback, if used when there are no cached odds, will silently show a number with no basis.
**Prevention:**
- Compute the conversion rate from a fixed-rate-independent helper that reuses `rankBonusBetHedges` with the refund amount. Use a conservative statistic (for example the median of the top N markets, or the 3rd best) and state which one in the UI. Record the rate and odds age used for every estimate.
- Solve the stake in closed form, treating the refund conversion as a constant `c`. Test sensitivity: profit at `c-10%` and `c+10%`. Show the range ("est. $24 to $41") as the honest output.
- If the odds cache is stale or empty, show "no estimate" and not a default percentage.
- Never write "guaranteed" or "locked in" next to an NSB. Show the guaranteed floor alongside it: the win-case or no-refund lose-case profit, which is typically negative. Show the worst case honestly (for example "if the refund converts at 0%: -$X").
**Detection:** Estimated profit of an NSB exceeds the best real finder conversion for the same amount. Two refreshes in a row give very different numbers with unchanged inputs.
**Phase:** NSB algorithm, then the feed.

### 4. Reader misclassifies NSB vs bonus bets (it did on 2026-10-08)
**What goes wrong:** The Haiku reader labelled a no-sweat promo as a plain bonus bet. The feed then computes it with the bonus-bet formula (the full amount is treated as a free bet that is always given), giving a wildly wrong, apparently guaranteed profit. In v1.2, once NSBs enter the feed instead of being skipped, a misread now produces a real money-looking opportunity and not a safe skip.
**Why it happens:** Marketing copy overlaps. "Get your first bet back in bonus bets if it loses", "Bet $X, get up to $Y in bonus bets", and "second chance bet" are all variations. Skipping NSB previously hid the weakness.
**Prevention:**
- Add a deterministic, regex-based classifier ahead of the reader, as the `mentionsNewCustomer` guard already does. If the text contains "if your bet loses", "if it loses", "no sweat", "second chance", "refund", "bonus bets back" and so on, force the type to `no_sweat` or send it to review. A disagreement between the reader and the regex goes to the "Needs a look" queue rather than the feed.
- Extend the verbatim guard: the amount and the loss-conditional phrase must both appear verbatim in the source text.
- Add the 2026-10-08 text as a regression fixture, plus 10 or more real NSB and "bet and get" strings per book, in `promoReader.test.ts`.
- Key difference to encode: bet-and-get pays on placing (usually any outcome), no-sweat pays only on a loss. Model them as separate promo types with separate math. Never treat NSB as a bonus bet with a condition.
- Reader cache (`readerCache.ts`): invalidate it when the prompt or classifier changes, or old misreads persist.
**Detection:** A promo labelled bonus bet whose text includes "lose". Conversion % in the feed above the finder's best. A bonus bet whose amount equals the qualifying stake cap.
**Phase:** Scrapers/reader phase, before the feed shows NSB. Also a gate before enabling the feed ranking.

### 5. Intro-offer value ignores the real terms
**What goes wrong:** The ranked Sign-up offers screen shows face value ("Bet $5, get $200") and so overstates it or recommends something not claimable.
- **Installments.** The "total" is paid in pieces ("$150 in bonus bets paid over 14 days", or FanDuel's five daily $50 pieces). Each piece has its own expiry (7 days is typical). The user must be in the app at the right times. signupOffers.ts already takes the total as the headline amount, so value must be risk-discounted and the schedule shown. Do not compute a single conversion of the total, because each piece is converted separately at its own odds and hedge limits.
- **Bonus-bet size vs hedge liquidity.** A $250 offer split into $5 to $50 pieces converts at different rates than one $250 bet.
- **Deposit and KYC requirements.** Minimum deposit, a funded account, ID verification (days of delay), and a first-deposit-only rule. Deposit-match is out of scope, so any offer requiring a matched deposit as its value mechanism must be excluded, but "deposit $10 to qualify" offers stay in and the requirement must be displayed.
- **One per person / per household / per device**, and the new-customer status. A member who has ever had an account at that book is ineligible. The screen is filtered to "books the member doesn't have", but "doesn't have" is not "never had" (a previously closed account counts). Add a "I've had an account before" dismissal.
- **Referral offers** are already excluded. Keep that.
- **State and promo-code specifics.** CO-specific terms may differ. Promo-code-only offers must show the code.
- **Expiry and terms drift.** Intro offers change often. Show "scraped N days ago" and hide stale offers.
- **Qualifying line.** The "exact qualifying line" must satisfy min odds, the right market and the max/min qualifying stake. Make the qualifying bet a cash bet at the target book hedged at another book. Hedge book must be one of the API-covered regulated books that the member has, and hedge-book availability depends on the member's other accounts. Rank by what the member can really do.
- **Cash-flow requirement.** Qualifying stakes tie up cash at two books until settlement. Show the total cash to fund.
**Prevention:** Model an `IntroOffer` structure with `installments[]` (amount, day offset, expiry), `minDeposit`, `minQualifyingOdds`, `qualifyingStakeRange`, `kycRequired` and `type`. Value = guaranteed part + estimated part, per piece, and discounted for expiry risk. If the reader can't fill the terms, mark the offer as "terms unclear" and rank it lower, not at face value.
**Detection:** Total amount used as a single bonus bet. A ranked offer with no expiry or deposit line.
**Phase:** Sign-up offers screen, with fields defined early in the NSB/scraper phase.

### 6. Odds API credit growth from more books, regions and games
**What goes wrong:** Each region or market multiplies cost. The free tier is ~500 credits per key per month, and a refresh currently costs ~3 credits with `bookmakers=` (cost = markets x regions, and `bookmakers` counts as one region per 10 books). Adding Caesars, Fanatics (paid-tier only per the Phase 1 findings) and theScore forces `us2` or paid tiers, or may be impossible. NSB and intro offers also need more events (qualifying lines across all sports, plus the conversion rate for the refund), and alternate lines multiply it again. The three-times-a-day scheduled refresh (v1.1) is already consuming budget, so 3 x 30 x credits per run can exhaust a key in a week.
**Prevention:**
- Write the budget on paper first: credits per run x runs per day x 30 days vs keys x 500. Add the new books only if the live roster really returns them, and verify per book key against the live API response (the earlier Caesars/Fanatics finding means they may have no odds, and so cannot be hedge books or have conversion rates).
- A book with no odds coverage can still be the intro-offer book (the qualifying bet is placed there) only if its own odds are available, since the NSB math needs its own price. Otherwise the user must type the line in, or the book is excluded. Do not invent odds for it.
- Reuse the single cached snapshot for NSB, intro and finder. Add no new fetch path for them. Add a rule that no feature calls the API from a render path.
- Keep the key-rotation and credit meter visible, with a hard stop under a floor. Add tests for the cost calculator when markets or books change.
- Intro offers should be computed from cached moneyline/spread mains only. Alternate lines stay behind the existing opt-in confirm.
**Detection:** Credits remaining dropping faster than the previous month's pace. A "low credit block" appearing mid-month.
**Phase:** Before the scrapers go live (budget check), and when adding books to the config.

### 7. Scraping the new books: bot protection, geo, login walls and ToS
**What goes wrong:** The earlier recon marked all six as dead ends or unproven: BetRivers (loyalty store only), BetMGM and theScore (login-gated/JS-only), Caesars (403 on every path), Fanatics (app-only), Hard Rock (DNS failure on the CO subdomain). The intro offers are usually on public marketing pages, which is a different surface than the in-app promos, so recon must be redone for intro offers separately. Specific traps:
- **Geo/state parameters.** Offers served depend on IP location and state. A GitHub Actions runner's IP is in a US datacentre that is not in Colorado, so the page may show a different state's offer (for example a different amount) or a geo block. Parse the state code from the page or URL where possible, and reject offers with another state's terms. Never publish an offer without confirming CO.
- **Silent block pages.** A 200 response with a Cloudflare/Akamai challenge page, or a generic page, parses as "zero promos" and the reconcile step then expires every good promo at that book. Treat a zero or sharply reduced count as a failed scrape, not an empty one (use the existing book-health stats), and require a minimum content signature before reconcile.
- **Expired-by-scrape.** One bad run closes live promos. Add a "2 consecutive empty runs before expire" rule.
- **Affiliate and aggregator pages** are tempting as substitutes. They are third-party and often stale. If used, tag the source and show the age.
- **ToS / legal.** The project already rules out authenticated scraping and credential storage. Keep that. Stay on public logged-out pages, low frequency (3x a day), identify honestly, and don't use stealth or proxy rotation to defeat a block. If a book blocks, mark it `skip` and fall back to manual entry. The group-added promo path covers it.
- **Parser drift.** Each book needs a fixture of the real response saved in the repo and a drift alarm.
**Prevention:** One recon task per book, ahead of any parser. The result is a go/no-go with a saved fixture. Accept that some books will end up `skip`. The milestone's "as feasible" wording allows it. Add a per-book canary test that fails on a challenge-page signature.
**Detection:** Book-health shows zero promos or a sudden count change, 403/429 statuses, a HTML title like "Just a moment".
**Phase:** Scrapers phase, one plan per book, recon first.

### 8. Account-risk (promo-abuse flags) not surfaced for these features
**What goes wrong:** Intro offers and NSB are the most-watched promos for abuse detection. A one-time use per person means a flagged or limited new account cannot be repeated. Typical flags: a hedge placed at a book whose account is fresh, qualifying bets on odds that are obviously arb-like, immediate withdrawal, bets matching a known hedge pattern, multiple accounts per household or device, and a bonus converted with zero risk. Limits cannot be undone and this is a one-shot opportunity per book. The existing advisory is a small footnote, which is too weak for a one-time offer.
**Prevention:**
- On intro and NSB cards, show a short plain "one chance per book" warning and the practical rule: place a few normal-looking bets first, don't place the qualifying bet at the extreme of the odds, and avoid a round odd-looking stake. Don't promise the user anything.
- Prefer lines with moderate odds (the best NSB qualifying bet is often at longer odds for a higher refund conversion, which is a trade-off with detection visibility, so don't push users to the extreme-odds option by default).
- Stake rounding to whole dollars is already done. Keep it.
- The tool must not suggest multiple accounts, VPN or location tricks. Keep with the out-of-scope list.
**Phase:** Sign-up offers screen and feed copy.

### 9. Duplicating or contradicting the existing flow (integration regressions)
**What goes wrong:**
- NSB promos have been skipped at scraped books. Un-skipping can reorder `exclusions.ts` rules so that an NSB is dropped by the new-customer guard, or a new-customer NSB lands in the regular feed rather than the Sign-up screen. Decide the routing once: new customer goes to Sign-up offers, existing customer (a returning-user NSB such as a weekly "second chance") goes to the feed.
- The same offer scraped from two surfaces creates two rows (dedupe key in signupStore). Test dedupe with the new books' ids.
- Competing-promo tandem pairing: an NSB must not be paired as a "tandem" with a boost on the opposite side, since the existing tandem math has both legs promo-adjusted and returns guaranteed values. Disable NSB in tandem pairing for v1.2 or give it an explicit estimate path.
- "Mark done" extracts profit from an opportunity. An estimated NSB marked done must record the actual entered result and not the estimate, or it pollutes the green line. Mark-done for an NSB needs a different flow (did the bet lose? what did the refund convert for?).
- Done tracking and the profit-recording job run 3x a day. They must handle the new types without crashing (a new enum value in an old switch).
- Migrations: the teammate pushes to main and migrates directly. Fetch before creating a migration, and check the numbering (the last was 0012 and later).
**Phase:** Feed phase and an integration check at the end.

## Moderate Pitfalls

### 10. Odds age and refresh semantics for estimates
An NSB estimate built from old odds is both stale and estimated. Show the odds age beside it and grey out beyond a threshold. Re-use the existing prominent odds-age pattern.

### 11. Currency of "best market to convert the refund" is far in the future
The refund arrives after the game settles, often days later, while the cached odds are for today's games. Say so ("converted at today's best rate"), and don't claim a specific game or hedge book for the refund. Show the how-to-convert as a pointer to the finder with the amount prefilled, which keeps one source of truth.

### 12. Promo type explosion in the UI and database
New types (no_sweat, bet_and_get, installment) in a Postgres enum or union need migrations and exhaustive switches. Use TypeScript exhaustive checking (`never`) in every switch on promo type, so a missing case is a compile error.

### 13. Verbatim guard false confidence
The guard checks that numbers appear in the source text, but it can't tell the amount is the refund cap versus the qualifying stake cap. Add a per-field check (cap amount near "up to", min odds near "odds of").

### 14. Test data realism
Hand-built fixtures can pass while real responses differ. Save real captured responses per book (the way DK, FD and Bally have them).

## Minor Pitfalls

### 15. American-odds display for min odds
Min odds are stated in American odds in the marketing copy ("-200 or longer"). "Longer" for negatives means closer to even. Use the existing americanOdds helpers and test the comparison on both sides of +100/-100.

### 16. Time zones for expiry
Show the expiry in Mountain Time (the app's audience) while storing UTC.

### 17. Installment promos displayed with total as "per bet"
Label "total across N days" next to the amount.

### 18. Sorting stability
Equal-valued guaranteed and estimated items need a deterministic tie-break (guaranteed first, then id) to avoid flicker between refreshes.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| NSB algorithm | Cap vs stake, refund as bonus bet, circular rate (#2, #3) | Closed-form function, brute-force oracle test, conservative rate, range output, record assumptions |
| Domain types | Estimates summed with guaranteed (#1) | `certainty` discriminator, separate fields, aggregator tests |
| Reader / classification | NSB read as bonus bet (#4) | Regex pre-classifier, disagreement to review queue, 2026-10-08 fixture, clear reader cache |
| New-book scrapers | Block pages, geo, empty-scrape expiry, ToS (#7) | Recon-first go/no-go, state check, 2-empty-runs rule, `skip` fallback, no stealth |
| Odds coverage / credits | Books without odds, credit burn (#6) | Budget table, verify roster live, single snapshot reuse, no render-path fetches |
| Feed integration | Routing, tandem pairing, mark-done, exhaustive switches (#9, #12) | Single routing decision, NSB excluded from tandem, separate mark-done flow, `never` checks |
| Sign-up offers screen | Installments, deposits, KYC, one-per-person (#5, #8) | Structured terms, discount, "terms unclear" ranks lower, one-chance warning |
| Dashboard / Statistics / graph | Estimate contamination (#1) | Guaranteed-only filter or a visibly separate series; no backfill |

## Research Flags

- **Needs fresh recon (deeper research):** each new-book scraper (#7), Odds API roster for Caesars, Fanatics, Hard Rock and theScore under the free tier (#6).
- **Needs an owner decision:** how estimated NSB is ranked relative to guaranteed (separate section vs interleaved with a conservative value), and the conversion statistic used (median top-N vs best).
- **Standard patterns:** the NSB formula itself (well-documented in matched-betting practice), and the type-system changes.

## Sources

- Repo: .planning/PROJECT.md, CLAUDE.md, src/config/scrapeTargets.ts (prior per-book recon), src/ingestion/promos/signupOffers.ts (installment total semantics, referral exclusion), src/domain/hedge/ (existing engine and oracle pattern). HIGH confidence for repo facts.
- Matched-betting domain knowledge on no-sweat mechanics, installments, one-per-person and account flags: training knowledge, MEDIUM-LOW confidence; not re-verified against live book terms in this pass.
- Odds API credit model (markets x regions) as already documented in CLAUDE.md and PROJECT.md: HIGH for the documented formula; per-book coverage must be re-verified live.
