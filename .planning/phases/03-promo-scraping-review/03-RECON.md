# Phase 3 Plan 01: Scraper Reconnaissance

**Gathered:** 2026-09-27
**Purpose:** Locate the real page that carries single-game profit boosts or bonus-bet offers on Bally Bet (recommended, D-06) and BetRivers (fallback), record the owner's per-book anti-bot posture decision (D-09), and check whether the candidate books' official social-media accounts post Colorado-usable single-game boosts.

**Scope update (Task 3, 2026-09-27):** Task 1's automated pass covered only Bally Bet and BetRivers per the original plan. The owner's Task 2 pass (`03-RECON-OWNER-INPUT.md`) went further and, with orchestrator help, found real logged-out **JSON API endpoints** (not the JS-rendered `play.ballybet.com/sports` shell Task 1 flagged as needing a browser) for **three** books: Bally Bet, DraftKings and FanDuel — and asked to target all three this phase rather than one. BetRivers was confirmed a dead end (loyalty Bonus Store only, no single-game boosts logged out, matching Task 1's finding) and is now `skip`, not the fallback. This is a deviation from the plan's single-first-target framing; see 03-01-SUMMARY.md.

## Automated Probes

All requests below used a real desktop Chrome User-Agent, `-L`, logged out, no carried-over cookies, with ≥2s pauses between requests (PITFALLS.md Pitfall 8 politeness). No credential or raw cookie content is recorded anywhere in this document — cookie names only.

### Bally Bet (`ballybet`)

| # | URL | HTTP status | Response size | Anti-bot signals | Per-game team names or boost/odds text present? |
|---|-----|-------------|----------------|-------------------|---------------------------------------------------|
| 1 | `https://www.ballybet.com/co` | 200 | 133,919 bytes | Cloudflare (`cf-ray` header; no `__cf_bm`/`_abck` cookie set, no challenge) | No. Only one boost/promo-shaped link found (`href="https://play.ballybet.com/account/promotional-terms"`, footer T&Cs). Page text mentioning "BONUS BETS"/"PROMOTIONAL PERIOD" is new-customer sign-up-offer fine print (welcome bonus terms), not single-game boost data. No `kambicdn`/`offering-api` hostname found anywhere in this page's HTML. |
| 2 | `https://play.ballybet.com/sports` (linked from `/co`'s "bet now" CTA; this is the live sportsbook app, distinct from the `www.ballybet.com` marketing site) | 200 | 1,439 bytes | Cloudflare + CloudFront (`x-amz-cf-*` headers); CSP references `*.kambi.com`, `*.kambicdn.com`, `*.vaix.ai` — confirms Kambi platform; no challenge encountered on this plain request | No per-game content visible — this is a bare JS-shell (`window.__BOOTSTRAP__` config blob + two `<script defer>` tags, `<noscript>JavaScript is required</noscript>`). The actual sportsbook UI (where single-game boosts would render inline on game lines) is entirely client-rendered. `pam-api` base URL `https://platform.ballys.whitehatgaming.com/` found in the bootstrap config — recorded as a lead only, not called (task instruction: no reverse-engineering beyond one plain GET of a verbatim URL, and this is a config template path, not a resolvable endpoint). |

### BetRivers (`betrivers`)

| # | URL | HTTP status | Response size | Anti-bot signals | Per-game team names or boost/odds text present? |
|---|-----|-------------|----------------|-------------------|---------------------------------------------------|
| 1 | `https://co.betrivers.com/?page=promotions` | 200 | 231,960 bytes | Cloudflare Bot Management cookie (`__cf_bm`) set; no challenge/block encountered — full server-rendered response came through | No per-game team names. Found "Profit Boosts" as a text mention, but in context it reads: *"Want guaranteed Bonus Money? Choose from a variety of Profit Boosts and Free Bets - each one set at a different level so you can purchase the prize that suits your needs by redeeming your Bonus Store Points!"* — this is the **loyalty/rewards Bonus Store** (`class="bonus-bank-table"`), a redemption catalog for points, not live single-game boosted odds. Confirms RESEARCH.md Assumption A1: this specific URL is the wrong page. A `kambiPromotions` JS config block was found (`container: ".sportsbook-promotions"`, `DEFAULT_PARAMS: {status: ["NEW","PENDING"]}`) — this looks like an account-notification widget (requires login), not a public boost listing. Real Kambi offering-API hosts found verbatim in the page: `client-static.bc.kambicdn.com`, `eu.offering-api.kambicdn.com`, `kambi-widget-api.bc.kambicdn.com`, `usco-auth-api.kambicdn.org` — recorded as leads (Kambi platform confirmed). |
| 2 | `https://eu.offering-api.kambicdn.com/offering/v2018/rsiusco/` (one plain GET of the exact base URL found verbatim in probe #1's HTML, per task instruction's one-GET allowance — not reverse-engineered further) | 404 | 58 bytes | None (plain JSON error, no bot-management response) | No — returned `{"error":{"message":"invalid resource path","status":404}}`. Confirms the API exists and is reachable but the base path alone isn't a usable resource; no further guessing attempted per instructions. |

**Total requests this session:** 2 for Bally Bet, 2 for BetRivers — both well under the ~15/book politeness cap, ≥2s apart.

## Bluesky Findings

Checked via the public AppView API (`public.api.bsky.app`, no login, no auth token).

- **Bally Bet:** Searched `app.bsky.actor.searchActors?q=Bally%20Bet` and `q=BallyBet` (no space). Neither search returned any actor with a handle or display name referencing Bally Bet, the sportsbook. **No official Bluesky account found.**
- **BetRivers:** Searched `app.bsky.actor.searchActors?q=BetRivers`. Found `betrivers.bsky.social`, display name "BetRivers Sportsbook" — this looks like the official account (matches brand name exactly, gambling-adjacent display name). Fetched its author feed (`app.bsky.feed.getAuthorFeed?actor=betrivers.bsky.social&limit=100`): the feed returned **zero posts** (`{"feed":[]}`). The account exists but has never posted (or posts are not indexed/visible via the public AppView). **0 posts in the last 30 days; 0 boost/bonus-bet mentions; not a viable promo source.**

## Per-Book Anti-Bot Posture (for D-09 review)

Candidates refreshed with today's probe evidence; the other 5 books kept verbatim from RESEARCH.md (dated 2026-09-27, same session — no re-probe needed, that research is today's evidence already).

| Book (Odds API key) | URL tried | Result | Anti-bot signal observed | Scrapability verdict | Evidence date |
|---|---|---|---|---|---|
| DraftKings (`draftkings`) | `sportsbook.draftkings.com/promos` | HTTP 200, 1.16MB HTML | **Akamai Bot Manager** — `_abck`/`bm_sz` cookies; `window.__INITIAL_STATE__.offers` empty; 3 guessed internal API paths all `403` from `errors.edgesuite.net` | **HIGH difficulty.** Static shell fetchable; promo data needs client JS + an internal API gated by Akamai's sensor challenge, or reverse-engineering that 403'd on every guess. | 2026-09-27 (RESEARCH.md) |
| FanDuel (`fanduel`) | `sportsbook.fanduel.com/promotions/` | HTTP 200, 11KB (thin SPA shell) | CloudFront + CSP referencing `*.px-cloud.net`/`*.px-cdn.net` (**PerimeterX/HUMAN**) + `*.geocomply.*` | **HIGH difficulty.** Near-empty React shell; enterprise bot detection + geofencing confirmed via CSP. | 2026-09-27 (RESEARCH.md) |
| BetMGM (`betmgm`) | `sports.betmgm.com/en/blog/promotions/` (200) and `/en/sports/promotions` (302, not chased) | Blog: 200, 330KB static-looking HTML | **Cloudflare** (`cf-ray`) on both | **MEDIUM-HIGH difficulty, uncertain content match.** Blog loads without challenge but reads as marketing content; app route 302 unresolved. | 2026-09-27 (RESEARCH.md) |
| BetRivers (`betrivers`) | `co.betrivers.com/?page=promotions` | HTTP 200, 232KB server-rendered HTML | **Cloudflare Bot Management** (`__cf_bm`), no challenge encountered — this session's re-probe confirms the same result | **LOW-MEDIUM technical-blocking risk, but wrong page confirmed.** Plain HTTP works with no bot friction; the fetched content is the loyalty Bonus Store, not single-game boosts. Real Kambi offering-API hosts identified (see Automated Probes above) but not a resolvable public endpoint without a specific resource path. | 2026-09-27 (this session, refreshed) |
| theScore Bet (`espnbet`) | `sportsbook.thescore.bet/promotions` | HTTP 200, 3.5KB (thin shell) | **Cloudflare** (`__cf_bm`, `cf-ray`), no challenge encountered | **MEDIUM difficulty.** Needs JS rendering (Playwright), but only Cloudflare's default posture, not an Akamai/PerimeterX-class system. | 2026-09-27 (RESEARCH.md) |
| Bally Bet (`ballybet`) | `www.ballybet.com/co` | HTTP 200, 134KB fully server-rendered HTML | **Cloudflare** (`cf-ray`), no bot-management cookie or challenge — this session's re-probe confirms the same result | **LOW technical-blocking risk on the marketing page, but wrong page confirmed.** The marketing site (`www.ballybet.com`) has no JS shell and no bot friction, but carries only sign-up-offer T&Cs. The live sportsbook app (`play.ballybet.com/sports`, confirmed Kambi-platform via CSP) is a JS-only shell needing a browser to render any single-game content — this session found it needs `render_mode=browser` at minimum, contradicting RESEARCH.md's optimistic "no Playwright needed" read of the marketing URL alone. | 2026-09-27 (this session, refreshed) |
| Hard Rock Bet (`hardrockbet`) | `co.hardrockbet.com/*` (DNS failure); `hardrockbet.com`/`hardrock.bet` (resolves, marketing site only) | CO app subdomain not found | Unknown — never reached the live app | **UNKNOWN — not evaluated.** | 2026-09-27 (RESEARCH.md) |

**Refined finding vs. RESEARCH.md:** this session's probe of `play.ballybet.com/sports` (the actual live app, not the `www.ballybet.com` marketing site RESEARCH.md probed) confirms Bally Bet's Kambi-platform sportsbook UI is entirely client-rendered — a `fetch`+`cheerio` scraper cannot see it. This held for the marketing/UI surface, but is **superseded below**: the owner's Task 2 pass found that Bally Bet — and DraftKings and FanDuel — each expose their promo data through a **separate, plain-JSON backend API** that is not the page a browser renders and does not require JS execution at all. `render_mode=http` (plain `fetch`, no `cheerio`, no Playwright) turned out correct for all three, just against a different URL than the ones this table probed. See "Owner Browser Pass" and "Scraper Contract" below.

## Owner Browser Pass

*Filled from the owner's Task 2 pass (`03-RECON-OWNER-INPUT.md`, done together with orchestrator assistance in a clean logged-out Playwright/Chrome session, then each data endpoint re-confirmed with plain `curl` — no cookies, no forged anti-bot headers/tokens).*

1. **Where do single-game boosts/bonus-bet offers actually render logged out?** Not on any of the marketing/promotions HTML pages Task 1 probed. The owner started at `https://play.ballybet.com/promotions?tab=promotions` (Bally Bet's in-app promotions tab, reachable logged out) and, from there, found each book's promo list is served by a dedicated backend JSON API called by the app's own JS — a different origin/host than the page URL:
   - Bally Bet: `GET https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/promotions` (list) + `GET .../view/<promotionIdentifier>` (detail, one call per promo)
   - DraftKings: `POST https://api.draftkings.com/en/api/promotions/v3/promotions/query`
   - FanDuel: `GET https://api.sportsbook.fanduel.com/promos/api/promotions?containers=SBK_PROMOHUB&...` (list) + `GET .../promotions/<promoCode>?...` (detail)
2. **Server-rendered or JS-rendered?** Neither, strictly — these are backend JSON APIs, not HTML. They return the same JSON to a plain `curl` (no cookies, no browser) as to the live app's own network calls, byte-identical for Bally Bet. This is a cleaner result than "server-rendered HTML": no HTML parsing, no `cheerio`, at all.
3. **Fixture(s) saved** (committed in `6d484a9`, prior to this task): `src/test/fixtures/promos/ballybet-promos.json`, `ballybet-promo-detail-{rams-broncos,wnba,ravens-cowboys-live,profit-boost-terms}.json`, `draftkings-promos.json`, `fanduel-promos.json`, `fanduel-promo-detail-cfb-boost.json`. Format for all: `json`. (Deviation from the plan's assumed `ballybet-promos.html` / `betrivers-promos.html` filenames — see 03-01-SUMMARY.md.)
4. **Observed promos:** see "## Observed Promos" below — 8 rows across all three books with sport, side, opponent/scope, market, boost %, bonus amount, and fine print verbatim.
5. **What does "max winnings" mean in each book's own wording?** None of the three states a max-winnings cap at all on any observed promo — only a **max stake (wager)** cap. See "## Max-Winnings Semantics" below.
6. **BetRivers:** confirmed dead end, matching Task 1's automated finding. Kambi offering API is reachable over `http` but the promotions page itself is the loyalty **Bonus Store** (`GET .../rewards.json` → `{"groupRewards":[]}`), and no boost markers were found on any logged-out landing bet-offer page. `skip`.
7. **X (twitter.com):** **skipped, by owner decision** — "not needed, official JSON feeds are structured and better." Bluesky was already a dead end per Task 1 (no official Bally Bet account found; BetRivers's account exists but has zero posts). No X data collected this session.
8. **Approximate Mountain Time when new daily boosts appear:** not independently timed this session; the observed promos' `startDate`/`expirationDate` fields cluster around midnight-to-early-morning ET rollovers (e.g. DK's NFL boost starts `2026-09-25T03:00:00Z`, Bally's game-day boosts start `2026-09-27T04:00:00 ET-equivalent`). Recommend the plan default `cron_hours_mountain: "8,12,17"` (RESEARCH.md D-07 default) unless a later run reveals a tighter pattern — not enough same-day-refresh data yet to override the default.
9. **D-09 decision per book and first target(s):** see "## D-09 Decisions" below.

**Why not "none-feasible":** all three targeted books returned real, structured, single-game promo data (team names, boost %, max stake, min odds, scope, dates) from a plain logged-out `GET`/`POST`. This is a stronger result than RESEARCH.md anticipated (no Playwright at all needed for any of the three).

## D-09 Decisions

Quoted verbatim from the owner (`03-RECON-OWNER-INPUT.md`, 2026-09-27):

> **D-09 per book:** ballybet = http, draftkings = http, fanduel = http. All others = skip (see table).
> No browser rendering, no stealth, no proxies → NO `scrapers/browser/` package is needed this phase.
>
> **Scope:** owner wants as many books as possible THIS phase → target all three (ballybet, draftkings, fanduel).
>
> **X / Bluesky:** skip X (not needed — official JSON feeds are structured and better). Bluesky already dead end (Task 1).
>
> **Why not log in:** unchanged D-09 — never log in, never store credentials.

Per-book table (owner-confirmed, this session):

| Book | D-09 choice | First target? |
|---|---|---|
| Bally Bet (`ballybet`) | `http` | Yes (1 of 3) |
| DraftKings (`draftkings`) | `http` | Yes (1 of 3) |
| FanDuel (`fanduel`) | `http` (max-stake cap hidden logged out — see Scraper Contract) | Yes (1 of 3) |
| BetRivers (`betrivers`) | `skip` | No |
| BetMGM (`betmgm`) | `skip` | No |
| Caesars (`williamhill_us`) | `skip` | No |
| Fanatics (`fanatics`) | `skip` | No |
| theScore Bet (`espnbet`) | `skip` | No |
| Hard Rock Bet (`hardrockbet`) | `skip` (not found) | No |

**No `scrapers/browser/` (Playwright) package is needed this phase** — all three first targets are `render_mode=http`, plain `fetch` against a JSON API, no JS execution.

## Max-Winnings Semantics (resolves RESEARCH.md Assumption A2 / Open Question 4)

None of the three books (Bally Bet, DraftKings, FanDuel) states a max-**winnings** cap on any observed boost — only a **max wager (stake)** cap:
- Bally Bet: "Maximum Bet: $20" / "$10" (no winnings-cap wording anywhere in the general Profit Boost T&Cs)
- DraftKings: "BOOSTED UP TO MAX $25 WAGER" + explicit "Profit boost only applies to winnings, excluding original bet amount" (boost % applies to profit, not stake — but no dollar cap on the resulting winnings)
- FanDuel: "up to a maximum wager. Log in for more details." (max wager hidden logged out entirely — see D-18 path below)

The boost percentage in all three applies to **winnings/profit only**, never to the original stake (DK's wording is explicit; FanDuel's own T&Cs worked example is $100 winnings × 50% boost → $150, i.e. the boost is the *extra* amount added on top of normal winnings, not a total-payout multiplier applied to stake+winnings). Since no book imposes an independent dollar cap on that boosted winnings figure, there is no interior "winnings-cap kink" to solve for any of the three observed books this session — the existing `arbMath.ts`/`bonusBet.ts`-style stake-optimization boundary is simply the max-stake cap. The engine's max-winnings code path (CALC-03) should remain implemented (a future book may state one), but no fixture from this recon needs it.

**`winnings_cap_kind` classification:** `boost_extra` — chosen because in every observed case the boost is described as "the extra amount added to winnings," never as a total-payout or net-winnings dollar ceiling; there simply is no winnings ceiling distinct from the max-stake cap for any of the three targeted books.

## Design Implications for Downstream Plans

*Carried verbatim in substance from the owner's Task 2 findings — MUST inform Plans 05/06's scraper and matcher design:*

1. **Promo scope is usually sport-wide or game-wide, not market-specific.** Observed shapes: game-wide ("any wager on Rams vs Broncos", Bally), sport+date-wide ("any NFL single on 9/27", DK; "any CFB game on 9/26", FD; "any WNBA playoff game", Bally). The app must choose the best event+market+side itself (maximize guaranteed profit under the cap), the same way the bonus-bet finder searches across markets — not match a promo to one pre-specified market.
2. **Matcher (D-10 3-signal gate) must adapt:** there is usually no market/side stated to match against. "Certainty" should mean: book + sport resolved, date/window resolved, and (for game-wide promos) both teams resolved to exactly one cached event via the alias table. A promo whose scope can't be pinned to a sport+date window (or a single game when one is named) goes to review.
3. **Exclusion filters, confirmed necessary from real promo text:** parlay / SGP / SGPx / live-wager-only / futures / outright / player-prop-only / new-customer-only promos must be filtered out (D-15). Respect each promo's stated minimum-odds constraint (Bally "Minimum Odds: +100" / "-150", FD "-200 or longer") when the app picks which side to boost.
4. **Opt-in/token:** DraftKings requires opt-in before the boost applies; Bally Bet and FanDuel issue a claimable token to the account's rewards tab. Show a note "Opt in / claim in the app first" on these rows (D-17's "other terms" field).
5. **Unknown caps (FanDuel):** FanDuel's max wager is hidden entirely from a logged-out view ("Log in for more details"). Per D-18, this promo goes straight to the review queue with caps unknown until a member enters the cap manually — the math never guesses.
6. **Three parsers, not one:** `ballybet`, `draftkings`, `fanduel`, all `render_mode=http`. `SCRAPE_TARGET_BOOK_KEYS` should be `["ballybet", "draftkings", "fanduel"]`, not a single first-target constant.
7. **Polite cadence:** a handful of requests per book per scrape run (one list call + a few detail calls), ≥2s apart, matching PITFALLS.md Pitfall 8 and this session's own probing discipline.

## Scraper Contract

**Deviation from the plan's single-book contract shape:** the plan's original two-column `target_book_key`/`target_url`/... table assumed one first-target book. The owner scoped this to three books this phase (see "Scope update" note at the top of this document and 03-01-SUMMARY.md). The contract below keeps the plan's required keys as a shared/per-book summary table, then gives one full subsection per book with its endpoint(s), method, headers, and JSON paths — this is what Plans 05/06 need to write the three parsers.

### Shared keys (apply to all three target books)

| Key | Value |
|---|---|
| `SCRAPE_TARGET_BOOK_KEYS` | `["ballybet", "draftkings", "fanduel"]` |
| `render_mode` | `http` for all three (plain `fetch`, no browser, no stealth, no proxies — no `scrapers/browser/` package needed this phase) |
| `stealth` | `no` for all three |
| `displayed_time_zone` | Bally Bet & DraftKings promo dates in fine print are US Eastern Time (ET); DraftKings' machine `startDate`/`expirationDate` fields are ISO-8601 UTC; FanDuel's `combinedEndDate` is ISO-8601 UTC. Parse machine fields as UTC, convert for display; parse fine-print prose dates as ET. |
| `winnings_cap_kind` | `boost_extra` (see "Max-Winnings Semantics" above — no book states an independent winnings-dollar cap; boost applies only to winnings/profit, not stake) |
| `cron_hours_mountain` | `8,12,17` (RESEARCH.md D-07 default; not enough same-day-refresh data yet from this recon to justify a different schedule — see Owner Browser Pass step 8) |
| `fallback_book_key` | `none` — all three targets are primary this phase; BetRivers (the plan's original fallback) is confirmed `skip`, not a fallback |
| `social_media_verdict` | No official Bally Bet Bluesky account found; BetRivers's official Bluesky account (`betrivers.bsky.social`) exists but has zero posts. X was skipped this session by owner decision ("not needed — official JSON feeds are structured and better"). **Verdict: social media is not a viable promo source for any of the three target books; the JSON APIs below are strictly better.** |
| `T-03-01-01 mitigation applied` | Fixtures grepped for account/email/session-token substrings before commit (`6d484a9`); none found — no personal data to strip |

### Bally Bet (`ballybet`)

| Key | Value |
|---|---|
| `target_url` (list) | `GET https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/promotions` |
| `target_url` (detail) | `GET https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/<promotionIdentifier>` (one call per promo; `promotionIdentifier` comes from the list response's `link.url` slug, e.g. `/promotions/sbk-10-Rams-Broncos-Profit-Boost` → `sbk-10-Rams-Broncos-Profit-Boost`) |
| `source_format` | `json` |
| Required headers | `jurisdiction: US-CO`, `brand: ballybet`, `accept-language: en-US` (**required** — omitting it returns `RequestValidationError: Schema validation error`), `application-type: WEB`, `referer: https://play.ballybet.com/`, a real desktop Chrome User-Agent |
| `promo_entry_locator` (list) | `sections.primaryContent[].data[]` filtered to `type == "promotion_content_card"` — one array element per promo card |
| `promo_entry_locator` (detail) | `sections.primaryContent[0]` where `componentType == "promotion_details"` |
| JSON path — title | list: `.title`; detail: `.title` |
| JSON path — terms/fine print | detail: `.description` (HTML — contains "Offer Details" bullets: boost %, Maximum Bet, Minimum Odds, scope) and `.terms` (HTML — contains the claim-window date range, "Promotion claimable for `<scope>` between `<start>` and `<end>`") |
| JSON path — boost % / max stake / min odds / scope | parsed from `.description` HTML bullet text (regex on `• N% Profit Boost`, `Maximum Bet: $N`, `Minimum Odds: <text>`, and the trailing scope line e.g. "LA Rams vs. DEN Broncos" or "Any Wager") |
| JSON path — start/end | parsed from `.terms` HTML prose ("between `<start>` and `<end>`", ET) — Bally Bet has no separate machine-readable start/end field in this API |
| Exclusion rules | title/description containing `SGP`, `Parlay`, `Live Wager`, `Futures`, `Stanley Cup Champion` (or other outright wording), or player-prop-scorer wording (e.g. "TD Scorer") |
| `fixture_path` (list) | `src/test/fixtures/promos/ballybet-promos.json` |
| `fixture_path` (detail) | `src/test/fixtures/promos/ballybet-promo-detail-rams-broncos.json`, `ballybet-promo-detail-wnba.json`, `ballybet-promo-detail-ravens-cowboys-live.json`, `ballybet-promo-detail-profit-boost-terms.json` |

### DraftKings (`draftkings`)

| Key | Value |
|---|---|
| `target_url` | `POST https://api.draftkings.com/en/api/promotions/v3/promotions/query` |
| Request body | `{"productName":"Sportsbook","filterByProduct":false,"zones":{"zoneName":"UniversalPromoPage"},"siteExperience":"US-CO-SB"}` |
| `source_format` | `json` |
| Required headers | `content-type: application/json`, `referer: https://sportsbook.draftkings.com/`, a real desktop Chrome User-Agent. No Akamai sensor cookie/token needed for this endpoint (confirmed — no `_abck`/`bm_sz` challenge encountered calling it directly, unlike RESEARCH.md's probe of the `/promos` HTML page). |
| `promo_entry_locator` | `zones[0].promotions[]` — one array element per promo |
| JSON path — title | `.merchandisingData.promotionHeadline` |
| JSON path — terms/fine print | `.merchandisingData.terms` (verbatim numbered list — boost %, eligible bet types, min odds, max wager, opt-in requirement), `.merchandisingData.loggedOutTerms`, `.merchandisingData.additionalDetail` (max stake, e.g. `"BOOSTED UP TO MAX $25 WAGER"`), `.merchandisingData.inlineDetails.promotionSubHeadline` |
| JSON path — boost % / min odds / scope | parsed from `.merchandisingData.terms` prose (`"Profit Boost: N%"`, `"Total bet odds must be -200 or longer"`, `"for all <sport> games on <date>"`) |
| JSON path — max stake | `.merchandisingData.additionalDetail` (e.g. `"BOOSTED UP TO MAX $25 WAGER"` → $25) |
| JSON path — start/end | `.startDate`, `.expirationDate` (ISO-8601 UTC, machine-readable — no prose parsing needed for dates on this book) |
| JSON path — scope/category | `.category` (`"New Customers"` → always exclude) |
| Exclusion rules | `.category == "New Customers"`; terms restricting the bet type to `Parlay`/`SGP`/`SGPx` only (no `Single` in the eligible-bet-types line) → exclude; terms mentioning `"Futures"` → exclude |
| `fixture_path` | `src/test/fixtures/promos/draftkings-promos.json` (list only — no separate detail endpoint was needed; this API returns full fine print inline) |

### FanDuel (`fanduel`)

| Key | Value |
|---|---|
| `target_url` (list) | `GET https://api.sportsbook.fanduel.com/promos/api/promotions?containers=SBK_PROMOHUB&channel=desktop&page=1&generosityGamesEnabled=false&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false&filterPlayItAgainPromosEnabled=false&filterMultiCyrPromosEnabled=false` |
| `target_url` (detail) | `GET https://api.sportsbook.fanduel.com/promos/api/promotions/<promoCode>?channel=desktop&rewardsHubEnabled=true&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false` |
| `source_format` | `json` |
| Required headers | `x-sportsbook-region: CO`, `accept: application/json`, `referer: https://sportsbook.fanduel.com/`, a real desktop Chrome User-Agent. **Tested WITHOUT the PerimeterX `x-px-context` header → 200.** Never forge this header — RESEARCH.md's PerimeterX finding stands for the app shell; this specific promo API does not require it, and forging a bot-detection token is out of scope regardless of whether it "works." `/promos/api/merchandising` returns empty when logged out — do not use that endpoint. |
| `promo_entry_locator` (list) | `promoPlacements[].promotions[]` — one array element per promo |
| `promo_entry_locator` (detail) | root array element `[0]` |
| JSON path — title | list: `.title`; detail: `.title` |
| JSON path — terms/fine print | list: `.name` (marketing one-liner with embedded scope/date); detail: `.description` (HTML numbered "How it Works" steps — min odds, scope, expiry) and `.termsAndConditions.full` (verbatim HTML terms) |
| JSON path — boost % / scope / min odds | parsed from list `.name` / detail `.description` prose (e.g. `"50% Profit Boost Token... ANY wager, -200 or Longer, for any College Football Games on <date>"`) |
| JSON path — max stake | **not exposed logged out** — detail `.description` reads "up to a maximum wager. Log in for more details." → promo goes to the review queue with caps unknown (D-18, PROMO-03-09 "enter cap details" flow) |
| JSON path — start/end | `.combinedEndDate` (ISO-8601 UTC, list); `.customerPromotionState.promoStateExpiryDate` (ISO-8601 UTC, detail) |
| JSON path — sport tag | `.tags` (list, e.g. `["american-football", "ncaaf"]`) |
| Exclusion rules | `.title`/`.name` containing golf/outright-tournament wording (e.g. `"Presidents Cup"`) → exclude, not a 2-way hedgeable market; promos restricted to parlay-only in `.name`/`.description` → exclude |
| `fixture_path` (list) | `src/test/fixtures/promos/fanduel-promos.json` |
| `fixture_path` (detail) | `src/test/fixtures/promos/fanduel-promo-detail-cfb-boost.json` |

## Observed Promos

| # | Promo type | Sport | Selection text as shown | Opponent | Market | Line | Base odds | Boosted odds or boost % | Bonus amount | Max stake text (verbatim) | Max winnings text (verbatim) | Min odds text (verbatim) | Expiry text | Other terms (verbatim) | Present in fixture? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Profit boost | NFL | "10% LA Rams vs. DEN Broncos Profit Boost" | LA Rams vs. DEN Broncos | game-wide, any wager | n/a | n/a | 10% | n/a | "Maximum Bet: $20" | none stated | "Minimum Odds: -+100" (sic, i.e. +100) | "Promotion claimable for LA Rams vs. DEN Broncos between September 27, 2026 at 12:00 AM ET and September 27, 2026 at 11:30 PM ET." | "Any Wager"; token in Rewards Tab; general Profit Boost T&Cs apply | Yes — `ballybet-promos.json` (list card) and `ballybet-promo-detail-rams-broncos.json` (detail) |
| 2 | Profit boost | WNBA | "25% WNBA Playoffs Profit Boost" | any WNBA playoff game | sport+date-wide | n/a | n/a | 25% | n/a | "Maximum Bet: $10" | none stated | "Minimum Odds: -150" | "Promotion claimable for WNBA playoff game between September 27, 2026 at 12:00 AM ET and September 27, 2026 at 11:59 PM ET" | "Any Wager" | Yes — `ballybet-promo-detail-wnba.json` |
| 3 | Profit boost (**EXCLUDE — live-only**) | NFL | "30% BAL Ravens vs. DAL Cowboys Live Wager Profit Boost" | BAL Ravens vs. DAL Cowboys | game-wide, live wagers only | n/a | n/a | 30% | n/a | "Maximum Bet: $10" | none stated | "Minimum Odds: -150" | "Promotion claimable for BAL Ravens vs. DAL Cowboys between September 27, 2026 at 12:00 AM ET and September 27, 2026 at 7:30 PM ET." | "Live Wagers Only" → not hedgeable pre-game, excluded by filter | Yes — `ballybet-promo-detail-ravens-cowboys-live.json` |
| 4 | Profit boost | NFL | "NFL 50% Profit Boost" | any NFL Single/Parlay/SGP/SGPx game on 9/27 | sport+date-wide | n/a | n/a | 50% | n/a | "BOOSTED UP TO MAX $25 WAGER" | none stated | "Total bet odds must be -200 or longer" | expires per `expirationDate` field (2026-09-28T03:00:00Z) | Opt-in required; "Profit boost only applies to winnings, excluding original bet amount" | Yes — `draftkings-promos.json` |
| 5 | Profit boost | College Football | "College Football 50% Profit Boost" | any CFB game on 9/26 | sport+date-wide | n/a | n/a | 50% | n/a | "BOOSTED UP TO MAX $25 WAGER" | none stated | "Total bet odds must be -200 or longer" | expires per `expirationDate` field (2026-09-27T06:30:00Z) | Opt-in required; same winnings-only wording as row 4 | Yes — `draftkings-promos.json` |
| 6 | Profit boost token | College Football | "College Football Profit Boost" (promoCode `LOCFB50PBT0926`) | any CFB game on 9/26 | sport+date-wide | n/a | n/a | 50% | n/a | **hidden logged out** ("Log in for more details") → review queue, caps unknown (D-18) | none stated | "-200 or Longer" | "expires 2:00 AM ET 9/27" (`combinedEndDate` 2026-09-27T06:00:00Z) | "ANY wager"; token claimed via login | Yes — `fanduel-promos.json` (list) and `fanduel-promo-detail-cfb-boost.json` (detail) |
| 7 | Profit boost token | Soccer | "30% Soccer Profit Boost Token" | any soccer match 9/25–9/27 | sport+date-wide | n/a | n/a | 30% | n/a | not captured in list fixture (no detail fixture pulled for this one) | none stated | not captured | 9/25–9/27 window | "ANY wager" | Yes (list only) — `fanduel-promos.json`; no matching detail fixture, so max-stake/min-odds text for this specific promo is not independently verified |
| 8 | Profit boost token (**EXCLUDE — outright/futures-shaped**) | Golf | "Golf 25% PBT - Presidents Cup" | Presidents Cup (tournament outright) | tournament-wide, not a 2-way game market | n/a | n/a | 25% | n/a | not captured | none stated | not captured | 9/24–9/27 window | Not a 2-way hedgeable market — excluded by filter | Yes (list only) — `fanduel-promos.json` |
