# Pitfalls Research

**Domain:** Sportsbook promo-conversion / hedge calculator (US, Colorado — bonus bets & profit boosts)
**Researched:** 2026-09-25
**Confidence:** MEDIUM-HIGH (hedge math and odds-API pitfalls verified against multiple matched-betting and API-docs sources; Colorado legal specifics verified against 2026 news coverage; account-limiting detection signals are community-sourced, treat as MEDIUM confidence)

## Critical Pitfalls

### Pitfall 1: Bonus bet math treated like a normal (stake-returned) bet

**What goes wrong:**
A $100 bonus/free bet at +200 pays $200 in **profit only** — the $100 stake is never returned. If the calculator (or a developer eyeballing the math) computes the hedge as if the full payout ($300) is available to hedge, the hedge stake is overstated, the "guaranteed profit" is wrong, and the user can end up with a real loss on the cash side.

**Why it happens:**
Standard hedge/arbitrage formulas (`hedge stake = stake × odds ÷ hedge odds`) assume both legs return stake. Bonus bets are a special case (stake-not-returned) that breaks the naive formula. This is the single most cited error in matched-betting write-ups.

**How to avoid:**
- Implement bonus-bet hedge math as its own explicit formula path, not a parameterized variant of the boost/normal formula: `hedge_stake = (bonus_amount × (bonus_decimal_odds − 1)) ÷ hedge_decimal_odds`.
- Unit test against known published conversion-rate benchmarks (e.g., a bonus bet at +400 hedged well should convert ~75-80%; at low odds like -110 it should convert much lower, ~50-60%) to catch formula regressions.
- Never reuse the "stake returned" formula for bonus bets even as a convenience shortcut.

**Warning signs:**
Calculated guaranteed profit for a bonus bet exceeds ~85% of face value at close to even odds (mathematically implausible), or profit is negative when hedged correctly.

**Phase to address:**
Core hedge-math engine phase (must be correct before any UI or API integration is built on top of it).

---

### Pitfall 2: Treating profit boosts and bonus bets with the same formula

**What goes wrong:**
Profit boosts return the original stake plus boosted profit (real cash risked); bonus bets never return stake. Sharing one calculation path between the two — or worse, a single generic "promo" input — silently produces wrong stakes for whichever type wasn't the one tested.

**Why it happens:**
Both are "promos that need hedging," which tempts developers toward one unified abstraction too early.

**How to avoid:**
Model promo type as a first-class discriminator (`bonus_bet` vs `profit_boost`) with distinct math functions from day one, sharing only the "find best opposing line" search logic, not the stake-solving math.

**Warning signs:**
A single `calculateHedge()` function with a boolean flag or magic-number branch for "is bonus" buried deep in shared code.

**Phase to address:**
Core hedge-math engine phase.

---

### Pitfall 3: Odds API free-tier budget silently exhausted

**What goes wrong:**
The Odds API's free tier is ~500 **credits**/month, and a credit is not 1 request — cost scales with number of markets × regions requested per call. Naive "fetch odds whenever a user opens the app" or "poll every N minutes" burns the monthly budget in days, and once it's exhausted the API returns 401/429 with no overage — the app goes dark for the rest of the month.

**Why it happens:**
Developers test against the API cheaply during dev (few calls) and don't model production request patterns (multiple users, multiple sports/markets, repeated views) against the credit formula before shipping.

**How to avoid:**
- Cache odds responses aggressively (e.g., 5-15 min TTL depending on how close to game time) and serve from cache on repeat views instead of re-fetching.
- Fetch on-demand (user-triggered "refresh odds" or opening the Opportunities view) rather than polling on a timer.
- Request only the specific sport/market/region combination needed for a given promo, not broad sweeps across all sports.
- Track remaining credits from the `x-requests-remaining` response header and surface it in an admin/debug view; degrade gracefully (serve stale cache with a "stale" badge) rather than erroring when budget is low.
- Build a credit-cost estimator into the dev workflow before adding any new "fetch odds" call site.

**Warning signs:**
Odds API calls fired directly from component render/mount without a cache layer; no tracking of `x-requests-remaining`; multiple users triggering independent fetches for the same event.

**Phase to address:**
Odds API integration phase — caching layer must exist before or alongside the first live API call, not bolted on later.

---

### Pitfall 4: Stale odds used to compute a hedge that's no longer available

**What goes wrong:**
Because odds are cached/rate-limited (Pitfall 3), the displayed hedge line may have moved or been removed by the time the user places the real cash bet. The "guaranteed profit" figure shown is no longer achievable, and the user can end up with a worse hedge or an actual loss if they trust the stale number.

**Why it happens:**
Caching to conserve API budget directly conflicts with the need for fresh odds at bet-placement time — this is an inherent tension in this project's constraints (free-tier budget vs. correctness).

**How to avoid:**
- Timestamp every cached odds quote and display "odds as of HH:MM" prominently next to every hedge calculation.
- Provide an explicit low-cost "refresh this event" action before the user commits, rather than relying on background cache refresh.
- Warn users the tool computes a hedge *recommendation*, not a live guaranteed lock — final numbers must be verified against live book prices before placing the cash bet.
- Never phrase UI copy as "guaranteed profit: $X" without a caveat when the underlying quote is more than a few minutes old.

**Warning signs:**
No "as of" timestamp shown with odds; no manual refresh action; support requests/complaints about hedges not matching what books actually offered.

**Phase to address:**
Odds API integration phase (caching/freshness UX) and Opportunities view phase (surfacing staleness to the user).

---

### Pitfall 5: Event/market mismatch when comparing odds across books

**What goes wrong:**
The promo book and the odds-API-sourced hedge book may reference the "same" event/market in different ways (different team-name formatting, different spread/total line granularity, alt lines vs. main line, player-prop naming differences). A naive string match either fails to find the true opposing line (missing a valid hedge) or matches the wrong market (producing a hedge that doesn't actually offset the promo bet).

**Why it happens:**
Sportsbooks and odds aggregators don't share a canonical event/market ID scheme; The Odds API normalizes team names and markets to its own schema, but manual promo entries (typed by a human) won't match that schema automatically.

**How to avoid:**
- Normalize team names and market labels through a single canonical mapping table (even a small static one, since Colorado's book list and major leagues are a bounded set) before any matching logic runs.
- When matching a manually-entered promo (book, team, market, line) to Odds API events, use fuzzy/normalized matching plus a confirmation step showing the matched event to the user before computing the hedge — never silently auto-match with no visibility.
- For markets more granular than moneyline (spreads, totals, alt lines), match on line value explicitly, not just team/market name, since a half-point difference changes the hedge math and push risk (see Pitfall 6).

**Warning signs:**
Hedge results referencing the wrong game/market when spot-checked; "no hedge found" for promos that should clearly have one because of name-format mismatches (e.g., "LA Rams" vs "Los Angeles Rams").

**Phase to address:**
Promo discovery / manual-entry phase and Odds API integration phase (the matching layer between them).

---

### Pitfall 6: Push/void/no-action outcomes ignored in hedge math

**What goes wrong:**
Spread and total bets can push (tie) if the line is a whole number, and either leg can be voided (postponement, player scratch in a prop, etc.). A calculator that assumes exactly one leg wins and one loses will misstate guaranteed profit — a push on the hedge leg with a losing bonus bet leg, for example, is a real loss, not the "worst case" the calculator implied.

**Why it happens:**
Textbook hedge formulas assume a clean win/lose outcome on both legs; push/void scenarios are edge cases that are easy to skip in v1 and hard to retrofit into a UI that only shows one "guaranteed profit" number.

**How to avoid:**
- Prefer moneyline or half-point (non-integer) spread/total lines for hedge recommendations where possible, to minimize push risk — flag whole-number lines explicitly as "push risk" in the UI.
- Show worst-case as well as best-case outcomes (win/lose, push/lose, lose/push) for spread and total hedges, not just a single "guaranteed profit" figure, when a push is mathematically possible.
- Treat player-prop and game-void risk (postponement) as a known limitation in promo terms review, not something the calculator can fully solve — surface it as a warning rather than pretending it's covered.

**Warning signs:**
"Guaranteed profit" shown for a hedge involving a whole-number spread/total with no push disclosure.

**Phase to address:**
Core hedge-math engine phase (worst-case modeling) and Opportunities view phase (surfacing risk to the user).

---

### Pitfall 7: Ignoring bet-placement minimums, stake increments, and boost/promo caps

**What goes wrong:**
Sportsbooks enforce minimum bet sizes, sometimes round stakes to whole dollars or cents, and profit boosts/odds boosts almost always have a **max stake cap** (commonly $25-$100) beyond which the boost doesn't apply. A calculator that computes an "optimal" hedge stake ignoring these constraints will recommend stakes the user literally cannot place, or will overstate profit by applying the boosted odds to a stake above the cap.

**Why it happens:**
The core math is solved as a continuous optimization problem; real-world sportsbook UIs impose discrete constraints (min stake, cent rounding, hard caps) that aren't part of the mathematical model unless explicitly added.

**How to avoid:**
- Model promo max-stake cap as a required input for every profit boost/odds boost entry (manual or scraped) and clamp the boosted-odds calculation to that cap — compute the "extra" stake beyond the cap at normal (non-boosted) odds separately if the user wants to bet more.
- Round all recommended stakes to standard book increments (typically $0.01 or $1 depending on book) and re-verify the guaranteed-profit figure using the rounded values, not the theoretical unrounded ones.
- Validate hedge stake against a configurable per-book minimum bet size; if the optimal hedge stake is below the book's minimum, flag it rather than silently returning an unplaceable number.

**Warning signs:**
Hedge stakes shown with more than 2 decimal places; boost calculations with no max-stake field; recommended stakes below $1 with no minimum-bet warning.

**Phase to address:**
Core hedge-math engine phase (rounding/capping logic) and Promo discovery/manual-entry phase (capturing max-stake as required data).

---

### Pitfall 8: Scraping promo pages violates ToS, breaks on anti-bot protection, or requires storing user credentials

**What goes wrong:**
Sportsbook promo pages are typically behind login (personalized offers), gated by geolocation (GeoComply and similar geofencing), and protected by anti-bot services (Cloudflare, DataDome, PerimeterX). Attempting to scrape them at scale risks: (a) ToS violations that could jeopardize the owner's or friends' real betting accounts, (b) brittle scrapers that break on every site redesign, (c) needing to store/proxy user login credentials or session cookies, which is a serious security and account-safety liability.

**Why it happens:**
Promo scraping looks straightforward for public marketing pages, but the *personalized, high-value* promos (the ones worth hedging) are usually only visible after login, which pushes scraping scope from "public page fetch" to "authenticated session automation" — a much higher-risk category.

**How to avoid:**
- Treat scraping as strictly opportunistic/best-effort for **public, unauthenticated** promo pages only (e.g., general site-wide boost banners). Never scrape behind a login wall or store sportsbook credentials in the app.
- Make manual entry the primary, always-available path (as already planned) — scraping is a convenience layer on top, not a dependency.
- Rate-limit and identify scrapers politely (reasonable delay, honest user agent) for the public pages that are scraped, and expect to disable scraping for any book that blocks it rather than escalating to anti-bot evasion (proxies, fingerprint spoofing) — that crosses further into ToS-violation and account-risk territory for a project whose whole purpose depends on the owner's and friends' accounts staying in good standing.
- Cache scraped promo data with a visible "last checked" timestamp and short shelf-life, since these pages change frequently and silently.

**Warning signs:**
Any code path that stores a sportsbook username/password/session token; scraper logic reaching for headless-browser fingerprint evasion or proxy rotation to get past a block (a sign the target requires authentication or active anti-bot circumvention); promo scraping breaking silently with no alerting.

**Phase to address:**
Promo discovery phase — scope scraping to public pages explicitly in phase planning; do not let "scrape more sources" scope-creep into authenticated automation later.

---

### Pitfall 9: Calculator-generated precise stakes make matched betting easy to detect, risking the users' accounts

**What goes wrong:**
The tool's entire purpose is to compute exact optimal stakes — but sportsbook risk teams specifically flag accounts that place unusually precise, calculator-derived stake amounts (e.g., $473.82), bet almost exclusively on promotions, and repeatedly hedge across books. This is exactly the behavioral fingerprint that leads to "gubbing" (promo access restriction) or full account limiting. If the tool doesn't at least *inform* users of this risk, friends may be surprised when their accounts get cut off from future promos.

**Why it happens:**
The project's core value proposition (exact optimal stakes, ranked by profit, repeatable across many promos) is structurally the same pattern that risk-detection systems are built to catch. This isn't a bug to "fix" in the software — it's an inherent tradeoff of the domain that the product should acknowledge rather than ignore.

**How to avoid:**
- This is a UX/expectations problem, not a math problem: surface a lightweight advisory (e.g., "consider rounding stakes slightly, avoid promo-only activity") in the Opportunities view or docs, without over-engineering "randomized" stake suggestions into v1.
- Do not build features that *encourage* maximum promo velocity (e.g., aggressive multi-promo auto-stacking) without at least acknowledging the account-risk tradeoff in the UI copy.
- Since this is a private tool for the owner + friends (not a paid SaaS), the risk is contained but still real for each individual's book access — treat it as a known limitation to document, not a blocker to solve technically.

**Warning signs:**
None from a software-defect standpoint — this is a "the feature works as intended and that's exactly the risk" pitfall. Track it as a documented limitation.

**Phase to address:**
Opportunities view / dashboard phase (advisory messaging); not a hedge-math or architecture concern.

---

### Pitfall 10: Colorado-specific legal/regulatory assumptions go stale

**What goes wrong:**
Colorado's sports-betting regulatory environment is actively changing: HB25-1311 (signed 2026) removes sportsbooks' ability to deduct free-bet promotions from net proceeds starting July 1, 2026, alongside new deposit limits and credit-card funding prohibitions — changes that can affect *how many and what kind of promos books offer* going forward (books have less tax incentive to hand out heavy free-bet promos). A roadmap or feature set built assuming "current promo volume/types continue indefinitely" risks becoming obsolete as books adjust their promo strategy in response to the law.
Additionally, the licensed Colorado book list (14-16 operators as of early 2026) is not static — books have exited other states' markets before (e.g., WynnBET, Unibet historically) and could do so in Colorado.

**Why it happens:**
Regulatory and market context is treated as "background research" done once at project start, rather than a variable that needs periodic revalidation, especially in a young/evolving regulatory environment like sports betting.

**How to avoid:**
- Design the book list (which books are supported) as configuration data, not hardcoded logic, so books can be added/removed without a code change.
- Don't hardcode assumptions about promo *frequency* or *generosity* into UX decisions (e.g., don't build a "browse all-time promo history" feature assuming an ever-growing dataset if promo volume may shrink post-regulation).
- Revisit the Colorado book list and promo-type mix each milestone, not just at project inception — this is squarely a "confirm current CO list and API coverage" item already flagged in PROJECT.md as pending research.

**Warning signs:**
Book list hardcoded in multiple places; no periodic review step for "is this book still live in CO / still offering this promo type."

**Phase to address:**
Book selection/filter phase (data modeling) and ongoing milestone review (not a one-time phase).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Single shared hedge-math function with a boolean "isBonus" flag | Faster initial implementation | Silent wrong-math bugs when boost logic and bonus logic diverge further (caps, push handling) | Never — split by promo type from the start |
| Polling odds API on a fixed timer "to keep data fresh" | Simple mental model | Burns the 500-credit/month budget in days; app goes dark mid-month | Never on free tier; only acceptable with a paid tier sized for polling |
| Hardcoded team-name/book-name string matching | Quick to ship for the first few books | Breaks silently every time a new book/market naming variant appears; produces wrong-event matches | Only as a v0 spike with a follow-up normalization-table task before real usage |
| No "as of" timestamp on displayed odds | Cleaner UI | Users trust stale numbers and lose money on real placement | Never — always show freshness |
| Manual-only promo entry with no data validation (no max-stake/expiration required fields) | Faster form to build | Bad hedge math (Pitfall 7) or expired promos shown as live | Acceptable only if fields are added before the calculator uses that data for real bets |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| The Odds API (or similar) | Assuming 1 request = 1 credit; not tracking `x-requests-remaining` | Compute credit cost per call from markets × regions requested; log/display remaining credits; cache aggressively |
| The Odds API event/team data | Trusting its team-name normalization to match manually-typed promo entries verbatim | Build an explicit normalization/matching layer with human confirmation step for ambiguous matches |
| Sportsbook promo pages (scraping) | Scraping behind login or bypassing anti-bot protection to get personalized offers | Restrict scraping to public, unauthenticated pages; treat manual entry as primary path |
| Multi-book odds comparison | Comparing moneyline against a differently-keyed spread/total market by mistake | Match on explicit market type + line value, not just team names |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| No cache layer between UI and odds API | Works fine solo-testing with 1-2 calls | Add TTL-based cache before first multi-user session | Breaks almost immediately with even 2-3 friends independently viewing the Opportunities page (credit budget is only ~500/month = ~16/day) |
| Fetching odds per-promo instead of batching by event/region | Fine with a handful of manually entered promos | Batch odds fetches by shared event/market/region across multiple promos in a single call where the API supports it | Breaks as promo count grows past what fits in a couple of daily fetches |
| Client-side recomputation of hedge math on every render without memoization | Invisible at v1 with few opportunities | Memoize/derive hedge results once per odds-fetch, not per render | Noticeable once Opportunities list grows past a few dozen entries or auto-refresh is added |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing sportsbook login credentials or session cookies to enable authenticated scraping | Account takeover risk, ToS violation, potential loss of real money in linked accounts | Never store book credentials; restrict scraping to public pages (Pitfall 8) |
| No access control on a "private" dashboard beyond an unlisted URL | Anyone with the link can see users' book access, promo data, and potentially bet-sizing patterns | Add basic auth/allowlist even for a small private group, since the data reveals real financial/betting behavior |
| Logging or displaying exact user stake amounts in a way indexable/scrapeable by search engines or shared publicly | Provides a compounding fingerprint for sportsbook risk teams if leaked (reinforces Pitfall 9) | Keep the dashboard non-public/non-indexed; treat stake history as sensitive data |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Showing a single "guaranteed profit: $X" number with no freshness/risk context | User places bets based on stale or push-vulnerable numbers, loses money, loses trust in tool | Always pair the profit figure with an odds timestamp and push/void risk flag when relevant |
| Not filtering hedge opportunities to only the books a given user actually holds | User sees "great" hedges they can't actually place, wastes time or worse, tries to sign up for a new book impulsively | Book-selection filter must apply to both promo side and hedge side consistently (already scoped in PROJECT.md — verify it's enforced everywhere hedges are computed, not just in one view) |
| No indication of promo expiration/wagering terms next to the calculated hedge | User converts a bonus bet correctly but misses a wagering requirement or expiration and loses the bonus entirely | Capture and surface expiration/terms as required fields on every promo entry (manual or scraped) |
| Presenting boosted-profit numbers without showing the max-stake cap that limits them | User believes a $500 boosted bet gets full boost when only the first $50 does | Always show max-stake cap alongside boost percentage; clamp calculated profit to the cap |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Bonus bet hedge calculator:** Often missing explicit stake-not-returned math — verify a known-answer test case (e.g., $100 bonus bet at +400, hedge at -150 or similar) matches a hand-calculated or third-party calculator result.
- [ ] **Profit boost calculator:** Often missing max-stake cap enforcement — verify entering a boost with a $50 cap and a $200 desired stake correctly splits/clamps the boosted portion.
- [ ] **Odds fetching:** Often missing a cache layer entirely, or caches but never displays staleness — verify the UI shows "as of" timestamps and that repeated views within the TTL window don't trigger new API calls (check credit usage, not just that it "works").
- [ ] **Event matching between manual promo entry and odds API:** Often works for the 2-3 books tested during dev, silently fails for others due to team-name formatting differences — verify against the full Colorado book list, not just the first few tested.
- [ ] **Book selection filter:** Often filters the promo list but forgets to filter the *hedge candidate* books too (or vice versa) — verify both sides of every displayed hedge respect the user's book selection.
- [ ] **Push/void handling:** Often entirely absent — verify spread/total hedges involving whole-number lines show a push disclosure, not just a single "guaranteed" figure.
- [ ] **Scraping fallback:** Often silently returns stale/empty data when a scrape target changes its page structure — verify there's visible staleness/failure signaling, not a quietly-broken feed presented as current.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Bonus-bet math formula bug shipped | MEDIUM | Add regression test suite with known-answer cases; audit any historical "guaranteed profit" figures shown to users and issue a correction/warning if the bug was live for a period |
| Odds API credit budget exhausted mid-month | LOW | Fall back to showing cached odds with a prominent staleness warning; consider a small paid-tier upgrade if this recurs; add credit-usage alerting at 80% threshold going forward |
| Scraper breaks silently after a book redesigns its promo page | LOW | Because manual entry is the primary path by design, scraping failure degrades gracefully — just needs an alert/log so it's noticed and fixed, not a data-integrity emergency |
| A user's sportsbook account gets limited/gubbed | N/A (external, not a software bug) | Update that user's book-selection filter to exclude the limited book's promos going forward; no code recovery needed, just data update |
| Event-matching produced a wrong-market hedge for a promo already acted on by a user | HIGH (real financial impact) | Immediate priority fix + regression test; proactively message affected users; strengthens the case for the "confirm matched event" UI step being non-negotiable rather than a nice-to-have |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Bonus bet math treated like stake-returned bet | Core hedge-math engine phase | Known-answer unit tests for bonus-bet formula distinct from boost formula |
| Profit boost/bonus bet formulas conflated | Core hedge-math engine phase | Two distinct, independently-tested calculation modules |
| Odds API budget exhaustion | Odds API integration phase | Credit-cost logging + cache-hit rate tracked in dev; manual test of a multi-user session doesn't exceed daily budget |
| Stale odds trusted as live | Odds API integration + Opportunities view phase | Every displayed hedge shows an "as of" timestamp; manual refresh action exists |
| Event/market mismatch across books | Promo discovery + Odds API integration phase | Matching layer tested against full CO book list, not just 2-3 books; human confirmation step for ambiguous matches |
| Push/void ignored | Core hedge-math engine phase | Whole-number spread/total hedges show push-risk disclosure in output |
| Stake rounding / min-stake / boost caps ignored | Core hedge-math engine + Promo discovery phase | Max-stake field required on boost entries; rounded stakes re-validated against book minimums |
| Scraping crosses into authenticated/anti-bot territory | Promo discovery phase | Explicit scope decision documented: public pages only, no stored credentials |
| Account-limiting risk from precise/promo-only activity | Opportunities/dashboard phase | Advisory messaging present in UI copy or docs |
| Colorado regulatory/book-list drift | Book selection/filter phase + ongoing milestone review | Book list stored as config, not hardcoded; reviewed each milestone |

## Sources

- [The 12 most common matchbetting mistakes and how exactly you fix them](https://matchedbets.com/blog/the-12-most-common-matchbetting-mistakes-and-how-exactly-you-fix-them/) — calculation errors, timing, account-strain mistakes (MEDIUM confidence, community source, corroborated by multiple similar articles)
- [Bonus Bet Conversion Calculator — betstamp](https://www.betstamp.com/calculators/bonus-bet) and [OddsGPT bonus calculator](https://www.oddsgpt.com/bonus-calculator/en) — stake-not-returned math confirmation (MEDIUM confidence)
- [The Odds API — Rate Limit guide](https://the-odds-api.com/guide/rate-limit.html) — credit model, 401/429 behavior on exhaustion (HIGH confidence, official docs)
- [Odds-API.io Best Practices](https://docs.odds-api.io/guides/best-practices) — caching TTL recommendations, backoff on 429 (MEDIUM confidence)
- [OddsPapi: The Odds API Free Tier Limits in 2026](https://oddspapi.io/blog/the-odds-api-free-tier-limits/) — ~500 credits/month, ~16 requests/day if spread evenly (MEDIUM confidence, third-party but consistent with official docs)
- [SEON: Betting Bots detection](https://seon.io/resources/betting-bots-how-to-detect-and-stop-them/) and [GeoComply for Sportsbooks](https://www.vegasinsider.com/sportsbooks/geocomply/) — geo-fencing and anti-bot context (MEDIUM confidence)
- [idnow: Gnoming / Multi-accounting in sports betting](https://idnow.io/idnow-glossary/gnoming-multi-accounting/), [SharkBetting: Gubbing Guide](https://www.sharkbetting.com/blog/gubbing-guide), [OddsMonkey: Betting Accounts Restrictions](https://www.oddsmonkey.com/blog/matched-betting/account-restrictions/betting-account-restrictions/) — detection signals (precise stakes, promo-only activity), gubbing mechanics (MEDIUM/LOW confidence, community-sourced, directionally consistent across multiple independent sources)
- [ClawArbs: How to Avoid Sportsbook Limits and Bans (2026)](https://clawarbs.com/blog/avoid-sportsbook-limits/) — behavioral fingerprinting detail (precise decimal stakes) (LOW-MEDIUM confidence)
- [Colorado Politics: Gov. Polis signs law imposing new limits on sports betting (2026)](https://www.coloradopolitics.com/2026/06/02/gov-jared-polis-signs-law-imposing-new-limits-on-sports-betting-in-colorado/) and [NPR: Colorado wants to regulate sports betting](https://www.npr.org/2026/05/03/nx-s1-5806281/colorado-wants-to-regulate-sports-betting-even-as-it-reaps-the-tax-benefits) — HB25-1311, free-bet deduction change effective July 2026, deposit limits (HIGH confidence, news coverage of signed legislation)
- [BetStateUSA: Is Online Gambling Legal in Colorado? 2026 Legal Guide](https://www.betstateusa.com/states/colorado/legal-guide/) — 21+ age requirement, ~14-16 licensed operators (MEDIUM confidence)
- [ProfitDuel: How to Convert a Profit Boost with Matched Betting](https://www.profitduel.com/blog/profit-boost-matched-betting) and [about.darkhorseodds.com: How to Convert a Profit Boost](https://about.darkhorseodds.com/guides/how-to-convert-a-profit-boost) — boost math, max-stake cap mechanics (MEDIUM confidence)
- Odds normalization / event-matching challenges — general odds-API industry documentation pattern (MEDIUM confidence, cross-referenced across multiple odds-API vendor docs)

---
*Pitfalls research for: Sportsbook promo-conversion / hedge calculator (Colorado)*
*Researched: 2026-09-25*
