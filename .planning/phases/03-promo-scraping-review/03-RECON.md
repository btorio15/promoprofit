# Phase 3 Plan 01: Scraper Reconnaissance

**Gathered:** 2026-09-27
**Purpose:** Locate the real page that carries single-game profit boosts or bonus-bet offers on Bally Bet (recommended, D-06) and BetRivers (fallback), record the owner's per-book anti-bot posture decision (D-09), and check whether the candidate books' official social-media accounts post Colorado-usable single-game boosts.

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

## Owner Browser Pass (pending)

*Filled by the owner in Task 2. Blank fields below are the exact questions Task 2 asks.*

1. **Bally Bet — where do single-game boosts/bonus-bet offers actually render logged out?** URL: ______
2. **Is that content in View Page Source (server-rendered) or only after JavaScript runs?** ______
3. **Fixture saved:** filename ______, format (html/json) ______
4. **3-5 observed promos** (sport, side, opponent, market, original odds, boosted odds/boost%, bonus amount, fine print verbatim for max stake/max winnings/min odds/expiry/other terms): ______
5. **What does "max winnings" mean in this book's own wording?** (net winnings / total payout / only the extra boosted amount): ______
6. **BetRivers — repeat 1-5, or "quick look, Bally Bet already works well":** ______
7. **X (twitter.com) — do the official Bally Bet and BetRivers accounts post Colorado-usable single-game boosts? Text or images only?** ______
8. **Approximate Mountain Time when new daily boosts appear:** ______
9. **D-09 decision per book** (`http` / `browser` / `browser+stealth` / `skip`) and first target: ______

If neither book shows any qualifying single-game boost or bonus-bet offer logged-out: "none-feasible" + notes.

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

**Refined finding vs. RESEARCH.md:** this session's probe of `play.ballybet.com/sports` (the actual live app, not the `www.ballybet.com` marketing site RESEARCH.md probed) confirms Bally Bet's Kambi-platform sportsbook UI is entirely client-rendered — a `fetch`+`cheerio` scraper cannot see it. Whichever book the owner picks in Task 2, `render_mode` is very likely `browser`, not `http`, contrary to RESEARCH.md's tentative "no Playwright needed" framing of the marketing-page probe.

## Scraper Contract

| Key | Value |
|---|---|
| `target_book_key` | TBD |
| `target_url` | TBD |
| `source_format` | TBD |
| `render_mode` | TBD |
| `stealth` | TBD |
| `fixture_path` | TBD |
| `promo_entry_locator` | TBD |
| `displayed_time_zone` | TBD |
| `winnings_cap_kind` | TBD |
| `cron_hours_mountain` | TBD |
| `fallback_book_key` | TBD |
| `social_media_verdict` | TBD |

## Observed Promos

| # | Promo type | Sport | Selection text as shown | Opponent | Market | Line | Base odds | Boosted odds or boost % | Bonus amount | Max stake text (verbatim) | Max winnings text (verbatim) | Min odds text (verbatim) | Expiry text | Other terms (verbatim) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | |
