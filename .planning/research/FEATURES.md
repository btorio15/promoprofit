# Feature Research

**Domain:** Sportsbook promo-conversion / hedge calculator (bonus bets + profit boosts), US regulated market, Colorado
**Researched:** 2026-09-25
**Confidence:** MEDIUM-HIGH (formulas verified against multiple independent sources and cross-checked arithmetically; competitor feature lists from WebSearch/WebFetch, several blocked by 403 and reconstructed from search snippets — treat exact UI/feature claims as MEDIUM, math as HIGH)

## Competitor Landscape Surveyed

- **OddsJam** — Promo Converter / Free Bet Conversion Calculator, Odds Converter, betting-calculators suite (oddsjam.com/betting-tools/promo-converter, oddsjam.com/betting-calculators)
- **DarkHorse Odds** — dedicated matched-betting software: Bonus Bet Finder, Profit Boost Tool, Site Credit Converter, Second Chance Bet Finder, Arbitrage/+EV Finder, Promo Dashboard, Sign-up Offer Dashboard (about.darkhorseodds.com)
- **Betstamp** — Bonus Bet Conversion Calculator (betstamp.com/calculators/bonus-bet)
- **Action Network** — Bet Tracker, Hedging Calculator, EV Calculator, Odds Converter, Margin Calculator (actionnetwork.com/betting-calculators)
- **Outlier.bet** — +EV / prop research tool with one-click betslip push to sportsbooks (different category — research/discovery tool, not primarily a promo-hedge calculator)
- Smaller/adjacent tools: OddsShopper Free Bet Converter, TheRundown Hedge Calculator, ToolsGambling Profit Boost Calculator, PromoGrind Profit Boost, ClawArbs Hedge Calculator, SportsbookReview Freeplay Calculator, OddsGPT Bonus Calculator, SureBets.bet Hedge Calculator

None of these surveyed tools were found to combine **(a)** a private multi-user dashboard **(b)** per-user book-selection filtering **(c)** hybrid scrape+manual promo discovery in one lightweight package — DarkHorse Odds comes closest (it has a per-book-filtered Promo Dashboard) but is a single-user paid SaaS product with a much broader feature set (+EV, arbitrage, sign-up offers, 69 books/exchanges, 70+ guides).

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bonus/free bet hedge calculator (stake-not-returned math) | Every surveyed competitor (OddsJam, Betstamp, DarkHorse, OddsShopper, ClawArbs, SureBets, OddsGPT) leads with this; it's the core mechanic of the domain | LOW-MEDIUM | Formula is simple algebra (see Core Calculation Reference below); complexity is in sourcing correct opposing odds, not the math |
| Profit boost / odds boost hedge calculator | Second most common calculator across every tool surveyed | MEDIUM | Requires distinguishing "boost applied to profit" vs a directly-published "boosted odds" line, plus handling stake-returned-on-win (unlike bonus bets) |
| Exact stake output for both legs (promo leg + hedge leg) | The entire value prop of a hedge calculator is "tell me exactly how much to bet" — a % or ratio alone is not actionable | LOW | Straightforward once odds + formula are in place |
| Guaranteed profit ($ and/or %) display | Every competitor calculator shows this as the headline result | LOW | Derived directly from the hedge formula |
| Conversion rate % display for bonus bets | OddsJam explicitly frames the whole tool around "conversion rate"; industry benchmark of 70-80%+ is the shared mental model bettors use | LOW | `guaranteed_profit / bonus_face_value`; competitors color-code or flag this (e.g., green ≥70%, red <50%) |
| Odds input for the hedge side (live or manual) | Can't calculate a hedge without knowing the opposing price; every tool either pulls live odds or lets you type them in | MEDIUM | This project's twist: on-demand odds API fetch (free tier, ~500 req/mo) rather than continuous polling — see PITFALLS/STACK for budget handling |
| Best-line / cheapest-hedge finder across multiple books | DarkHorse and OddsJam scan many books to find the opposing line that maximizes conversion; users expect the tool to search, not just calculate one manually-entered pair | MEDIUM-HIGH | Requires odds for the same market across all of a user's selected books; this is where API request budget is spent fastest |
| Promo listing/dashboard (current live promos) | DarkHorse's "Promo Dashboard" and OddsJam's promo tools both center on "what promos exist right now" as the entry point, not just a bare calculator | MEDIUM | This project's hybrid scrape + manual-entry approach is a reasonable, cheaper substitute for DarkHorse's automated promo scanning |
| Book-selection filter (only show promos/hedges for books the user holds) | DarkHorse Odds already does this ("promotions you want to see based on which sportsbooks you belong to") — validates this as expected, not novel, behavior | LOW-MEDIUM | In this project it's per-user (not just per-account), which is the differentiating wrinkle, not the filtering concept itself |
| Ranked opportunities view (best profit/conversion first) | Standard pattern across promo-finder tools; users scan a sorted list rather than hunting for value themselves | LOW | Simple sort on computed guaranteed-profit or conversion % |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Private multi-user dashboard (owner + friend group) with per-user book filtering | No surveyed competitor targets a small private group with individualized book filtering baked into a shared view — competitors are single-tenant SaaS (one login = one person's books) | MEDIUM | Requires only lightweight user records + a per-user book-selection preference, not full account/auth infrastructure; aligns directly with PROJECT.md core value |
| Hybrid promo discovery: scrape + manual entry as co-equal first-class paths | Competitors are mostly one or the other: DarkHorse invests heavily in automated scanning across 69 books; most matched-betting calculators are pure calculators with no promo discovery at all (user supplies the promo). A hybrid model gets scrape coverage where cheap/stable and guarantees completeness via manual entry where scraping is brittle (this is explicitly true for CO promo pages per PROJECT.md context) | MEDIUM-HIGH | Scraper coverage will be partial and will break; manual entry must be a fully-supported, not fallback-only, path from day one |
| Narrow, sharpened scope (bonus bets + profit boosts only, CO only, sportsbooks only) | Competitors like DarkHorse and OddsJam bundle arbitrage, +EV, sign-up offers, second-chance bets, and dozens of states/books — high surface area, more to learn and maintain. A tool that does exactly two promo types very well for one state is simpler to trust and build correctly | LOW (as a design choice; it reduces total scope) | This is a differentiator through subtraction — deliberately smaller than every competitor surveyed |
| Free-tier-aware, budget-conscious odds fetching (on-demand + caching, not continuous polling) | Not a user-facing feature but a structural advantage: keeps the tool free to run indefinitely for a private group where competitors' odds infrastructure implies real API/scraping spend at scale | MEDIUM-HIGH | Primarily an architecture/engineering concern (see ARCHITECTURE.md/STACK.md) but shapes user-facing behavior (e.g., "refresh odds" button vs. always-live) |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Full per-user bet history / bankroll tracking (like Action Network's tracker) | Feels natural to pair with a hedge calculator; "while I'm here, track my bets too" | Significant scope: needs settlement tracking, editable bet records, reconciliation against actual sportsbook outcomes — a different product surface than "calculate the hedge right now" | Explicitly deferred in PROJECT.md; v1 ships a shared opportunities view + book preference only |
| Automatic bet placement / betslip push (Outlier-style) | Removes manual re-entry friction, feels like the "final mile" | ToS violation risk for most CO sportsbooks (automated wagering is commonly prohibited), account-ban risk for the owner and friends, and it's explicitly out of scope per PROJECT.md | Output exact stakes/lines for the user to enter manually |
| Full +EV / arbitrage finder across all markets (not just promos) | DarkHorse and Outlier both offer this as a flagship feature, so it looks like "what serious tools do" | Different data need (continuous broad-market odds scanning) that blows through a free-tier API budget almost immediately; also a different value prop (finding mispriced lines vs. converting a known promo) | Stay scoped to promo-triggered hedges only; +EV scanning is a plausible v2+ idea if the API budget changes |
| Real-time alerts (Discord/Telegram/SMS) for new promos or odds moves | DarkHorse and OddsJam-adjacent tools commonly offer this; feels like "professional" tooling | Adds a notification/infra dependency and push-scheduling complexity for a private group of a handful of people who can just check a dashboard; explicitly out of scope per PROJECT.md | Manual refresh / check-the-dashboard pattern for v1 |
| Second-chance / risk-free bets and deposit-match bonuses as tracked promo types | DarkHorse treats these as first-class promo types alongside bonus bets and profit boosts, so it looks like an obvious v1 inclusion | Different payout mechanics per book (refund thresholds, deposit-match wagering requirements) add another calculator + discovery surface before the two highest-value, most recurring promo types are solid | Deferred per PROJECT.md; add only after bonus bets + profit boosts are proven |
| Exchange / prediction-market hedging (Novig, Sporttrade, Kalshi, Prophet X) | Some of these venues offer better hedge prices than sportsbooks and matched bettors do use them | Different product category (peer-to-peer/prediction markets, different fee structures, some in flux — e.g. Novig is mid-transition to an exchange model in CO as of Sept 2026), and explicitly out of scope | Sportsbook-only hedge venues for v1, as already decided |
| Multi-state expansion / national book list | "Why not support all states, more books = more opportunities" | Book availability, promo terms, and regulations are state-specific; supporting more states multiplies scraping targets, API region config, and legal-detail tracking for no benefit to a CO-based private group | Colorado-only for v1, as already decided |
| Public signup / paid multi-tenant SaaS | Natural "what if we productize this" temptation once it works well for the friend group | Requires billing, broader auth, support burden, ToS/legal exposure for facilitating promo abuse at scale — a fundamentally different (and riskier) product | Stay private, invite-only, for owner + friends |

## Core Calculation Reference

These formulas are the load-bearing logic of the product; verified against OddsJam's worked example, Betstamp's documented workflow, and standard matched-betting references (Smarkets Help Centre, betstamp.com), and independently re-derived/checked below.

### 1. Bonus bet / free bet hedge (stake NOT returned on win)

Given:
- `B` = bonus bet face value (fixed by the promo)
- `Ob` = decimal odds of the side the bonus bet is placed on (the "promo leg")
- `Oh` = decimal odds of the opposing side at the hedge book (the "hedge leg")

Because a bonus bet only pays out profit (stake is not returned), the payout if the bonus bet wins is `B × (Ob − 1)`.

**Hedge stake:**
```
H = B × (Ob − 1) / Oh
```

**Guaranteed profit** (identical regardless of outcome, by construction):
```
Profit = H × (Oh − 1)          [equivalently: B×(Ob−1) − H]
```

**Conversion rate:**
```
Conversion % = Profit / B
```

**Worked example (verified against OddsJam's published example):** $100 bonus bet at +300 (decimal 4.00), hedge available at −275 (decimal 1.3636).
`H = 100 × (4.00 − 1) / 1.3636 = 300 / 1.3636 ≈ $220`
`Profit = 220 × (1.3636 − 1) ≈ $80` → Conversion = 80%. This matches OddsJam's published worked example exactly ($220 hedge, $80 net, implying an 80% conversion rate).

**Maximizing conversion:** conversion simplifies to `(Ob − 1) / Oh`, so the tool should search, for a given promo book/market, across the user's selected hedge books for the *lowest* available `Oh` on the opposing side — and, where the promo allows picking any market, across markets/events for the combination that maximizes `(Ob − 1) / Oh`. Typical target: bonus-bet legs in the +300 to +500 range hedged against −275 to −500 favorites convert at ~70-80%+; near-even-money legs (e.g., −110) convert much worse (~50%) because the hedge stake consumes most of the payout.

**Max-stake-cap interaction (important, easy to miss):** because `H` can be *larger* than `B` when `Ob` is high and `Oh` is low (as in the example: $220 hedge on a $100 bonus bet), the required hedge stake can exceed a sportsbook's max bet limit on that market — this is common on player props and other thin-liquidity markets. The calculator must compare the computed `H` against a configurable/known max-stake for the hedge market and either flag the opportunity as not fully hedgeable at that size, or recompute against an alternate (lower-conversion, lower-required-stake) line.

### 2. Profit boost / odds boost hedge

Two distinct real-world mechanics were found, and the calculator needs to support both because sportsbooks use both terms/structures:

**(a) "Boost applied to profit"** (e.g., DraftKings/FanDuel "Profit Boost" tokens) — stake IS returned on a win (unlike bonus bets); only the profit portion is multiplied by the boost percentage.

Given original decimal odds `O`, boost percentage `p` (e.g., 0.50 for 50%):
```
Boosted profit   = (O − 1) × (1 + p)
Effective boosted decimal odds:  Ob_eff = 1 + (O − 1) × (1 + p)
```
Example (verified): +200 (decimal 3.00) with a 50% boost → boosted profit multiplier = (3.00−1)×1.5 = 3.00 → `Ob_eff = 4.00` (+300 equivalent). This matches the commonly-cited "50% boost on +200 becomes +300" example found across multiple sources.

**(b) "Boost applied directly to odds"** (a sportsbook publishes a specific boosted price, e.g., a moneyline boosted from −150 to +120) — no separate boost-% calculation is needed; the published boosted price *is* `Ob_eff`. These two mechanics are mathematically equivalent once you have `Ob_eff`; the calculator's job is just to correctly derive `Ob_eff` from whichever the promo actually states (a stated boosted price vs. a stated boost %).

**Hedge stake** — because stake is returned on win for both the boosted leg and the hedge leg (this is a real-cash-vs-real-cash hedge, not a stake-not-returned situation like bonus bets), use the standard equalize-total-return formula:
```
H = S × Ob_eff / Oh
```
where `S` is the real-money stake placed on the boosted leg and `Oh` is the hedge book's decimal odds.

**Guaranteed profit:**
```
Profit = S × Ob_eff − (S + H)
```

**Worked example:** $50 at boosted +300 (`Ob_eff = 4.00`), hedge at −275 (`Oh = 1.3636`): `H = 50 × 4.00 / 1.3636 ≈ $146.67`. Total staked = $196.67; total return if boosted leg wins = $200; guaranteed profit ≈ $3.33 (a ~1.7% ROI on capital risked). **This is the critical difference from bonus bets to surface in the UI:** profit-boost hedges typically lock in only a small ROI on total cash risked (often low single-digit %) because both legs use real money, whereas bonus-bet conversions lock in a large % of *free* money (70-80%+) — these two guarantee different things and should not be displayed with the same "conversion %" framing.

**Max stake / max winnings caps (common and must be handled explicitly):** profit-boost promos frequently cap either:
- **Max eligible stake** — the boost only applies up to a stated dollar amount (e.g., "boost applies to first $50"); stake above that cap either isn't boosted or isn't allowed. The calculator must cap `S` at this limit before computing `Ob_eff`-derived profit.
- **Max boosted winnings/payout** — the boosted profit itself is capped (e.g., "max profit boost payout $100"), which breaks the simple multiplicative relationship once the cap binds: `BoostedProfit = min(S × (O−1) × (1+p), maxWinningsCap)`, and `Ob_eff` is no longer a fixed multiplier of `O` — it must be recomputed as `1 + BoostedProfit/S` for that specific stake. Because this cap depends on `S`, the "best stake to bet" is itself a decision variable (bet exactly up to the point the cap binds, not more) — this is meaningfully more complex than the bonus-bet case where `B` is fixed by the promo and not chosen by the user.

### Conversion-rate display — recommended framing

- **Bonus bets:** display `Conversion %` prominently (profit ÷ face value) since this is the shared mental model across the whole competitor set (OddsJam explicitly centers its tool on this number); ~70-80%+ = strong, ~50-60% = weak, consistent with the benchmarks multiple sources converge on.
- **Profit boosts:** display `Guaranteed Profit $` and `ROI % on capital risked` (profit ÷ total staked across both legs) rather than a "conversion %" — the underlying economics (real money on both legs, stake caps that bind) are different enough that reusing "conversion %" terminology across both promo types would be misleading to users switching between the two calculators.

## Colorado Sportsbook Landscape (for book-selection filter scope)

Confidence: MEDIUM — the official Colorado Division of Gaming operator list (sbg.colorado.gov) returned HTTP 403 to automated fetch; the list below is triangulated from multiple industry-tracker sources (LegalSportsReport, OddsAssist, RotoWire) as of August/September 2026 and should be spot-checked against the state list or each book's own CO app-store presence before finalizing the book-selection option list.

**Sportsbooks reported as currently live/operating in Colorado (Sept 2026):**
DraftKings, FanDuel, BetMGM, Caesars, bet365, Fanatics, BetRivers, theScore Bet, Bally Bet, BetMonarch, Circa Sports, SBK Sportsbook, Hard Rock Bet. Total operator count varies by source (12-19+ depending on whether retail-only and inactive licenses are counted); Colorado law permits up to 30 operators.

**Important correction to PROJECT.md's assumed list:** ESPN Bet is **not currently live** — ESPN and PENN Entertainment ended their ESPN Bet partnership, with the ESPN Bet brand going on indefinite hiatus as of December 2025. It should be **excluded** from the default Colorado book list as of this research date (Sept 2026); do not build book-selection options around it without re-verifying at implementation time.

**Notable status flags:**
- **Betfred** — reported as not accepting new bets in CO, withdrawal-only for existing customers (effectively inactive).
- **Novig** — reported as mid-transition to a sports-betting-exchange model in Colorado and temporarily offline; also out of scope anyway since v1 restricts to sportsbooks, not exchanges.

**Odds API coverage overlap (relevant to the book-selection filter's practical scope — full pricing/tier detail belongs in STACK.md, flagged here because it directly constrains which selectable books can actually get automated hedge odds):**
- Directly covered in The Odds API's base `us` region (commonly free-tier-eligible): `draftkings`, `fanduel`, `betmgm`, `betrivers`.
- Reported as **paid-subscription-only** on The Odds API even though they're live CO books: `williamhill_us` (Caesars), `fanatics`.
- Reported under a separate `us2` region (verify free-tier inclusion at implementation time): `espnbet`/theScore Bet key, `hardrockbet` (+ state variants), `ballybet`.
- Not found in The Odds API's US coverage at all in this research pass: bet365, Circa, SBK, BetMonarch — these would need manual-entry-only support for the hedge side, same as the manual promo-entry path, if selected by a user.

**Implication for the book-selection filter feature:** the filter itself (table stakes, as established above) should not assume every selectable Colorado book has automated odds coverage. Plan for a visible distinction in the UI/data model between "books with API-sourced live odds" and "books requiring manual odds entry" — this is a scope/complexity detail for the book-selection filter and odds-fetch features, not a reason to shrink the CO book list itself.

## Feature Dependencies

```
Bonus Bet Hedge Calculator
    └──requires──> Odds for the hedge-side market (API-fetched or manual entry)
                       └──requires──> Book-selection filter (to know which books' odds to fetch/show)

Profit Boost Hedge Calculator
    └──requires──> Odds for the hedge-side market (same odds dependency as above)
    └──requires──> Boost terms captured at promo entry (boost % OR boosted price, max-stake cap, max-winnings cap)
                       └──requires──> Manual promo entry OR scrape (Hybrid Promo Discovery)

Hybrid Promo Discovery (scrape + manual entry)
    └──feeds──> Opportunities view (ranked list)
    └──feeds──> Bonus Bet Hedge Calculator (promo leg terms: book, amount, market)
    └──feeds──> Profit Boost Hedge Calculator (promo leg terms: book, boost %/price, caps, market)

Book-Selection Filter
    └──enhances──> Opportunities view (filters both promo side and hedge side to user's books)
    └──enhances──> Best-line/cheapest-hedge finder (search space = user's selected books only)

Best-Line / Cheapest-Hedge Finder
    └──requires──> Odds across multiple books for the same market
    └──conflicts with──> Free-tier API budget if unscoped (must be bounded by book-selection filter, not scan all CO books for all users on every view)

Conversion-Rate Display (bonus bets)
    └──requires──> Bonus Bet Hedge Calculator output (guaranteed profit + face value)

ROI % Display (profit boosts)
    └──requires──> Profit Boost Hedge Calculator output (guaranteed profit + total capital risked)

Private Multi-User Dashboard
    └──requires──> Book-Selection Filter (per user)
    └──enhances──> Opportunities view (each viewer sees their own filtered ranking)
```

### Dependency Notes

- **Both calculators require odds for the hedge-side market before they can produce a stake/profit output** — this is the hard dependency that drives the odds-fetch architecture (on-demand, cached, free-tier-bounded). Neither calculator can be "complete" without it, so odds-fetching is effectively part of the MVP critical path even though it's framed as infrastructure, not a feature.
- **Hybrid promo discovery feeds both calculators identically** — a promo captured via manual entry and one captured via scrape should produce the same downstream calculator input shape (book, promo type, amount/boost%, market, caps). Design the manual-entry form and the scraper's output to converge on one shared "promo" data shape early, so the calculators don't need to special-case the source.
- **Book-selection filter bounds the best-line finder** — without the filter, the "search all books for the cheapest hedge" feature would scan every live CO book on every request, which conflicts directly with the free-tier odds-API budget constraint. The filter isn't just a UX nicety here; it's what keeps the on-demand odds fetch affordable.
- **Max-stake/max-winnings caps depend on promo capture completeness** — if the manual-entry form or scraper doesn't capture these caps, the profit-boost calculator's math silently becomes wrong for capped promos (see Core Calculation Reference above). This should be a required field for profit-boost promo entries, not optional.
- **Conversion % and ROI % are display-only derivatives** — they add no new dependency beyond the two calculators' outputs, but they should NOT share the same UI treatment/label (see "Conversion-rate display" recommendation above) since they mean different things.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches PROJECT.md's Active requirements, confirmed against competitor table-stakes analysis above.

- [ ] Bonus bet hedge calculator (stake-not-returned math, conversion % output) — this is the core value prop; every competitor treats it as non-negotiable
- [ ] Profit boost hedge calculator (boost-to-profit and boosted-odds input paths, max-stake/max-winnings cap handling, ROI % output) — second core promo type per PROJECT.md scope
- [ ] On-demand odds fetch for hedge-side markets via free-tier odds API, with caching — hard dependency of both calculators
- [ ] Hybrid promo discovery: manual entry form (book, type, amount/boost%, market, caps) as the guaranteed-complete path; scraping as a best-effort supplement where feasible
- [ ] Opportunities view: current promos ranked by guaranteed profit/conversion, filtered to the viewer's selected books
- [ ] Book-selection filter per user
- [ ] Private dashboard access for owner + friends

### Add After Validation (v1.x)

- [ ] Broader scrape coverage across more CO promo pages, once manual-entry usage patterns show which books/promo types are worth automating — trigger: manual entry becomes a bottleneck for a specific frequently-promoted book
- [ ] Best-line search expansion (multi-market scanning within a single promo, not just the one market the user picked) — trigger: users manually try several markets per promo and would benefit from the tool doing that search
- [ ] Visible "API-sourced odds" vs "manual odds entry needed" distinction surfaced at book-selection time — trigger: users select a book without automated odds coverage and get confused by degraded functionality

### Future Consideration (v2+)

- [ ] Second-chance / risk-free bet and deposit-match promo types — explicitly deferred in PROJECT.md; add only once bonus bets + profit boosts are proven and the promo-capture data shape has stabilized
- [ ] Full per-user bonus-bet-balance and bet-history tracking — explicitly deferred; a materially different product surface (settlement/reconciliation) from "calculate the hedge right now"
- [ ] Alerts (Discord/Telegram/SMS) for new promos — explicitly out of scope for v1; would need to be justified against the free-tier odds budget and notification infra cost
- [ ] Multi-state support — explicitly out of scope; would multiply scraping targets and book/API config
- [ ] Exchange/prediction-market hedge venues (Novig, Sporttrade, Kalshi, Prophet X) — explicitly out of scope; different venue category and, per this research, at least one (Novig) is mid-transition and unstable in CO right now anyway

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Bonus bet hedge calculator | HIGH | LOW-MEDIUM | P1 |
| Profit boost hedge calculator (with cap handling) | HIGH | MEDIUM | P1 |
| On-demand cached odds fetch | HIGH (blocking dependency) | MEDIUM-HIGH | P1 |
| Manual promo entry form | HIGH (guarantees coverage) | LOW | P1 |
| Book-selection filter | HIGH (bounds cost + core UX) | LOW-MEDIUM | P1 |
| Opportunities view (ranked) | HIGH | LOW | P1 |
| Private multi-user dashboard access | MEDIUM-HIGH (needed for the friend-group use case) | LOW-MEDIUM | P1 |
| Promo scraping (supplement to manual entry) | MEDIUM | MEDIUM-HIGH | P2 |
| Best-line multi-market search within a promo | MEDIUM | MEDIUM | P2 |
| API-vs-manual odds coverage indicator | MEDIUM | LOW | P2 |
| Second-chance/deposit-match promo types | LOW-MEDIUM (deferred by design) | MEDIUM | P3 |
| Bet history/bankroll tracking | MEDIUM (deferred by design) | HIGH | P3 |
| Alerts (Discord/Telegram/SMS) | LOW-MEDIUM (deferred by design) | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration (explicitly deferred in PROJECT.md Out of Scope)

## Competitor Feature Analysis

| Feature | DarkHorse Odds | OddsJam / Betstamp / others | Our Approach |
|---------|-----------------|------------------------------|--------------|
| Bonus bet hedge math | Automated finder scans 69 books, recommends best conversion | Calculator with manual odds entry or live pull; OddsJam publishes the reference formula/example this research verified | Same core formula; scoped odds search to only the user's selected CO books via free-tier API |
| Profit boost hedge math | Dedicated Profit Boost Tool | Scattered across smaller calculator sites (ToolsGambling, PromoGrind); none found explicitly handling max-winnings caps in depth | Explicit support for both boost-to-profit and boosted-price inputs, with max-stake/max-winnings cap handling as a required field, not an edge case |
| Promo discovery | Fully automated scanning across 69 books/exchanges, paid subscription | Not offered by most pure calculators (user supplies the promo) | Hybrid: manual entry as guaranteed-complete baseline, scraping as supplement — matches PROJECT.md's stated approach and avoids DarkHorse's automation cost/fragility |
| Book filtering | Promo Dashboard filtered to "sportsbooks you belong to" (per account) | Not typically offered — most calculators are stateless, single-shot tools | Same filtering concept, extended to be per-user within one shared private dashboard (the actual differentiator, not the filtering idea itself) |
| Multi-user/team access | Single-tenant paid SaaS (one login) | Single-tenant | Private multi-user dashboard for owner + a small friend group, each with their own book filter — not offered by any surveyed competitor |
| Scope breadth | Very broad: bonus bets, profit boosts, site credit, second-chance, arbitrage, +EV, sign-up tracking, 69 books, education content | Broad calculator suites (odds converter, EV, margin, parlay) alongside hedge tools | Deliberately narrow: 2 promo types, CO only, sportsbooks only |

## Sources

- OddsJam Promo Converter / Free Bet Conversion Calculator — https://oddsjam.com/betting-tools/promo-converter, https://dev.oddsjam.com/betting-calculators/free-bet-conversion (formula and worked example verified arithmetically; MEDIUM confidence on exact UI, HIGH on formula/example since it reproduces exactly)
- Betstamp Bonus Bet Conversion Calculator — https://www.betstamp.com/calculators/bonus-bet (MEDIUM confidence, workflow description)
- Smarkets Help Centre, "How to calculate matched betting bets" — https://help.smarkets.com/hc/en-gb/articles/115000350131 (MEDIUM, corroborates stake-not-returned formula)
- DarkHorse Odds product pages — https://about.darkhorseodds.com/, https://about.darkhorseodds.com/guides/what-we-offer, https://about.darkhorseodds.com/guides/how-to-convert-a-profit-boost (MEDIUM, feature list reconstructed from fetch summary)
- Action Network betting calculators — https://www.actionnetwork.com/betting-calculators (MEDIUM)
- ToolsGambling Profit Boost Calculator, PromoGrind Profit Boost — https://toolsgambling.com/betting/profit-boost-calculator, https://promogrind.bet/profit-boost/ (MEDIUM, boost-to-profit mechanics and worked example corroborated across both)
- DraftKings profit boost support docs / SportsGrid explainer — https://support.draftkings.com/dk/en-us/how-do-i-apply-a-boost, https://www.sportsgrid.com/betting/sportsbook-promos/draftkings/profit-boost (MEDIUM, confirms stake-returned-on-win and boost-to-profit mechanic, +165 → ~+198 at 20% example)
- Odds-boost-vs-profit-boost comparison — via WebSearch aggregation of bettingusa.com, betstamp.com education, oddsjam.com/betting-education/odds-boost (MEDIUM, corroborates equivalence between a stated boost % and an equivalent published boosted price)
- Legal Colorado sportsbook lists — https://www.legalsportsreport.com/sports-betting/states/colorado/, https://oddsassist.com/sports-betting/sportsbooks/colorado/, https://www.rotowire.com/betting/colorado, https://sportshandle.com/colorado/ (MEDIUM, triangulated across sources as of Aug/Sept 2026; official https://sbg.colorado.gov/gaming/sports-betting returned HTTP 403 to automated fetch and should be checked manually before finalizing book list)
- ESPN Bet hiatus — WebSearch aggregation referencing ESPN/PENN Entertainment ending the ESPN Bet partnership, December 2025 (MEDIUM — recommend a direct confirmation check at implementation time since this contradicts PROJECT.md's assumed book list)
- The Odds API bookmaker coverage — https://the-odds-api.com/sports-odds-data/bookmaker-apis.html, https://the-odds-api.com/ (MEDIUM, bookmaker-key-to-region mapping and paid-vs-free tier flags per book; full pricing detail deferred to STACK.md)

---
*Feature research for: Sportsbook promo-conversion / hedge calculator (Colorado)*
*Researched: 2026-09-25*
