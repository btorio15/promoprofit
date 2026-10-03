# 03-01 Task 2 — owner + orchestrator recon results (2026-09-27, ~04:50–05:02 UTC)

Owner pointed at https://play.ballybet.com/promotions?tab=promotions and approved all three books below.
Recon done logged-out in a clean Playwright Chrome (no cookies, no login), then each data endpoint re-tested
with plain `curl` (no cookies, no anti-bot tokens/headers forged). Owner decisions:

- **D-09 per book:** ballybet = http, draftkings = http, fanduel = http. All others = skip (see table).
  No browser rendering, no stealth, no proxies → NO `scrapers/browser/` package is needed this phase.
- **Scope:** owner wants as many books as possible THIS phase → target all three (ballybet, draftkings, fanduel).
- **X / Bluesky:** skip X (not needed — official JSON feeds are structured and better). Bluesky already dead end (Task 1).
- **Why not log in:** unchanged D-09 — never log in, never store credentials.

## Per-book findings

| Book | Result | Source | Notes |
|---|---|---|---|
| Bally Bet | ✅ http | `GET https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/promotions` (list) + `GET …/view/<promotionIdentifier>` (detail) | Required headers: `jurisdiction: US-CO`, `brand: ballybet`, `accept-language: en-US` (omitting accept-language → `RequestValidationError: Schema validation error`). Also sent `application-type: WEB`, `referer: https://play.ballybet.com/`, Chrome UA. Curl response byte-identical to browser. Page itself runs AWS WAF + TrafficGuard JS but the JSON endpoint does not require tokens. |
| DraftKings | ✅ http | `POST https://api.draftkings.com/en/api/promotions/v3/promotions/query` body `{"productName":"Sportsbook","filterByProduct":false,"zones":{"zoneName":"UniversalPromoPage"},"siteExperience":"US-CO-SB"}` | Headers: `content-type: application/json`, `referer: https://sportsbook.draftkings.com/`, Chrome UA. No Akamai cookie needed for this endpoint. 216 KB. Fields: `zones[0].promotions[].merchandisingData.{promotionHeadline,promotionDescription,terms,loggedOutTerms,additionalDetail,inlineDetails.promotionSubHeadline}`, `startDate`, etc. `additionalDetail` = "BOOSTED UP TO MAX $25 WAGER". Terms: "Profit Boost: 50% (Profit boost only applies to winnings, excluding original bet amount)", "Profit Boost Token only applies to a NFL Single, Parlay…". Opt-in required per user. |
| FanDuel | ✅ http (caps missing) | `GET https://api.sportsbook.fanduel.com/promos/api/promotions?containers=SBK_PROMOHUB&channel=desktop&page=1&generosityGamesEnabled=false&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false&filterPlayItAgainPromosEnabled=false&filterMultiCyrPromosEnabled=false` (list) + `GET https://api.sportsbook.fanduel.com/promos/api/promotions/<promoCode>?channel=desktop&rewardsHubEnabled=true&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false` (detail) | Headers: `x-sportsbook-region: CO`, `accept: application/json`, `referer: https://sportsbook.fanduel.com/`, Chrome UA. Tested WITHOUT the PerimeterX `x-px-context` header → 200 (we must never forge it). `/promos/api/merchandising` returns empty when logged out — don't use. Terms: "valid for use on ANY wager, -200 or Longer, for any College Football Games on <date>, up to a maximum wager. Log in for more details." → **max wager hidden logged-out** → promo must go to review queue with caps unknown (D-18 path / 03-09 "Enter cap details"). Winnings paid as withdrawable cash; boost applies to winnings (example in T&Cs: $100 winnings × 50% → $150). |
| BetMGM | ❌ skip | `GET https://www.co.betmgm.com/en/promo/api/offers` | Plain curl returns HTML shell, not JSON. Even in browser, boost details say "Log in to view details and terms". |
| Caesars | ❌ skip | api.americanwagering.com | Plain curl → CloudFront 403 "Request blocked". `/us/co/bet/promotions` redirects to `/bet/undefined`; no logged-out promo page found. |
| Fanatics | ❌ skip | — | App-only sportsbook; betfanatics.com is marketing; only profit-boost page is NY-only. |
| theScore Bet | ❌ skip | GraphQL PromotionsPage | Logged-out shows only evergreen offers; daily boosts are "personalized" behind login. |
| BetRivers | ❌ skip | Kambi offering API reachable over http | No boosts visible logged-out (promotions page = loyalty Bonus Store; `rewards.json` → `{"groupRewards":[]}`; landing betoffers have no boost markers). |
| Hard Rock | ❓ not found | app.hardrock.bet | Marketing site only; `app.hardrock.bet/promotions` 404. Not investigated further. |

## Observed promos (2026-09-26/27)

Bally Bet:
- "10% LA Rams vs. DEN Broncos Profit Boost" — Offer Details: 10% Profit Boost • Maximum Bet: $20 • Minimum Odds: -+100 (sic, i.e. +100) • Any Wager • LA Rams vs. DEN Broncos. Terms: "Promotion claimable for LA Rams vs. DEN Broncos between September 27, 2026 at 12:00 AM ET and September 27, 2026 at 11:30 PM ET."
- "25% WNBA Profit Boost" — 25% • Minimum Odds: -150 • Maximum Bet: $10 • Any Wager • any WNBA playoff game on 9/27.
- "30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost" — Max Bet $10, Min -150, **Live Wagers Only** → not hedgeable pre-game, exclude.
- Parlay/SGP/TD-scorer-parlay/MLB-parlay boosts and "50% Stanley Cup Champion" (futures) → exclude.
- General "Bally's Profit Boost" T&Cs: no max-winnings cap stated anywhere; winnings awarded as cash; "Cash out voids participation"; token appears in Rewards Tab.

DraftKings:
- "NFL 50% Profit Boost" — any Sunday NFL bet (Single or Parlay) on 9/27, max $25 wager, opt-in.
- "College Football 50% Profit Boost" — any CFB bet 9/26, max $25 wager, opt-in.
- Also parlay-only / SGP-only boosts ("College Football 50% Parlay Boost", "MLB SGP(x) Boost", "NHL Futures 25%") → exclude.

FanDuel:
- "College Football Profit Boost" (promoCode LOCFB50PBT0926) — 50%, ANY wager, -200 or longer, any CFB game 9/26, max wager hidden, expires 2:00 AM ET 9/27.
- "30% Soccer Profit Boost Token" — any soccer match 9/25–9/27.
- "Golf 25% PBT - Presidents Cup" — outright/golf → likely not hedgeable 2-way.

## Max-winnings semantics (Research Open Question 4)
None of the three books states a max-winnings cap on these boosts — only a **max wager (stake) cap**.
Boost applies to profit/winnings only (DK explicit: "excluding original bet amount"; FD example $100→$150). Stake returned normally.
→ cap kind for all three observed: `max_stake` only; `max_winnings` = none/unknown. Keep the max-winnings code path (engine already supports it) but no fixture needs it yet.

## Design implications for downstream plans (MUST be carried into the Scraper Contract)
1. **Promo scope is usually sport-wide or game-wide, not market-specific.** Shapes seen:
   - game-wide: "any wager on Rams vs Broncos" (Bally)
   - sport+date-wide: "any NFL single on 9/27" (DK), "any CFB game on 9/26" (FD), "any WNBA playoff game" (Bally)
   The app must choose the best event+market+side itself (maximize guaranteed profit under the cap), like the bonus-bet finder does across markets.
2. **Matcher (D-10 3-signal gate) must adapt:** there is usually no market/side to match. Certainty should mean: book + sport resolved, date/window resolved, and (for game-wide promos) both teams resolved to one cached event via the alias table. A promo whose scope can't be pinned to a sport + date window (or a single game when it names one) goes to review.
3. **Filters:** exclude parlay / SGP / SGPx / live-only / futures / outright / player-prop-only / new-customer-only promos. Respect min-odds constraints (Bally "Minimum Odds: +100", FD "-200 or longer", Bally "-150") when choosing the boosted side.
4. **Opt-in/token:** DK requires opt-in; Bally/FD issue a token in the account's rewards tab. Show a note "Opt in / claim in the app first".
5. **Unknown caps (FanDuel max wager):** promo stays in review with caps unknown until a member enters the cap (existing D-18/03-09 flow).
6. **Three parsers:** `ballybet`, `draftkings`, `fanduel` (http only). `SCRAPE_TARGET_BOOK_KEYS` should become `["ballybet","draftkings","fanduel"]`.
7. Polite cadence: a handful of requests per book per run (list + details), ≥2s apart.

## Fixtures saved (committed 6d484a9)
src/test/fixtures/promos/: ballybet-promos.json, ballybet-promo-detail-{rams-broncos,wnba,ravens-cowboys-live,profit-boost-terms}.json, draftkings-promos.json, fanduel-promos.json, fanduel-promo-detail-cfb-boost.json
