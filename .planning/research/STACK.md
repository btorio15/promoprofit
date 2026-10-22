# Technology Stack: v1.2 Intro Offers & No-Sweat (additions only)

**Project:** PromoProfit
**Milestone:** v1.2 Intro Offers & No-Sweat
**Researched:** 2026-10-22
**Scope:** Only what is NEW. The existing stack (Next.js 16, Drizzle + Neon, decimal.js 10.6, Zod 4.6, Vitest 5, Anthropic SDK 0.129 Haiku reader with verbatim guard, plain-HTTP `BookScraper` pipeline, GitHub Actions + Vercel cron, The Odds API) is validated and not re-researched.
**Overall confidence:** MEDIUM. Per-book endpoints were probed live from a residential Colorado IP on 2026-10-22. I could NOT test from a GitHub Actions or Vercel datacenter IP, which is the single biggest open risk for every Cloudflare-fronted book.

## Bottom line

1. **No new runtime library is needed for NSB math.** decimal.js 10.6 and the existing bonus-bet conversion-rate function are enough. NSB is a closed-form formula (below), not a solver.
2. **No Playwright, no stealth, no proxy.** Keep the D-09 rule (plain logged-out fetch, no forged tokens). Only 1 of the 6 new books (Hard Rock Bet) exposes a clean public JSON feed. 1 more (BetMGM) is reachable only as server-rendered marketing HTML. The other 4 are blocked or login-gated.
3. **One small contract extension is needed:** `BookScraper.sourceFormat` is currently the literal `"json"`. Widen it to `"json" | "html"` so HTML pages (BetMGM, optionally Hard Rock marketing) can go through the existing Haiku reader and verbatim guard.
4. **Plan for a hand-maintained intro-offer fallback** (owner-entered rows, which the app already supports via manual entry) for Caesars, Fanatics, BetRivers, theScore. Intro offers change only a few times a year, so manual entry is a legitimate primary path for them, not a failure.

## Per-book feasibility (the main finding)

Probe conditions: plain `curl`, desktop Chrome UA, no cookies, logged out, from a Colorado residential IP, >=1.5s spacing, 1-3 requests per URL. Ratings are for "plain HTTP from GitHub Actions, no browser."

| Book (Odds API key) | Best public surface found | Format | Protection observed | Plain-HTTP feasibility | Confidence |
|---|---|---|---|---|---|
| **Hard Rock Bet** (`hardrockbet`) | `GET https://api.hardrocksportsbook.com/cms/v2/carousels/COLORADO_ONLINE/NATIVE/sbk.home` (also `/WEB/sbk.home`); alt `GET https://api.hardrocksportsbook.com/cms/layoutPromotions?brand=hrd_online&route=promotions&segment=co&mobile=true` | JSON array of CMS promo objects | Cloudflare in front, no challenge, no cookie needed, CORS-less plain GET works | **HIGH feasibility** | HIGH for reachability from home IP; MEDIUM that Cloudflare lets GH Actions IPs through |
| **BetMGM** (`betmgm`) | `GET https://sports.betmgm.com/en/blog/betmgm-state-promos/colorado-sportsbook/` (server-rendered; contains "up to $1,500 in Bonus Bets ... First Bet Offer", bonus-bet expiry, refer-a-friend, current boost). Real app `www.co.betmgm.com/en/promos` is an Angular shell ("requires Javascript") | HTML | Cloudflare (`__cf_bm`), no challenge from home IP | **MEDIUM** (HTML + Haiku reader; the actual promo API was not found) | MEDIUM |
| **BetRivers** (`betrivers`) | Nothing public for intro offer amount. `co.betrivers.com/` is a thin SSR page ("Use Bonus Code SPORTS", no dollar amount in text). `/?page=promotions` is the loyalty Bonus Store. Promo lobby API paths (`/service/promolobby/cage/{cage}...`, cage `CRP`) redirect to a login-redirect HTML page | HTML | Cloudflare `__cf_bm`, no challenge | **LOW** (no extractable offer; promo lobby is login-gated) | MEDIUM |
| **theScore Bet** (`espnbet`) | GraphQL `POST https://sportsbook.us-default.thescore.bet/graphql` (found in `/env.js`). Introspection disabled. `publicPromotions` is the only logged-out promo query and returned `[]` at probe time. `promotions`, `homeScreenPromotions`, `onboardingPromotion`, `page(canonicalUrl:)` return `UNAUTHORIZED` | GraphQL JSON | Cloudflare `__cf_bm`; main site `thescore.bet` and `www.thescore.bet/en-us/*` return 403 | **LOW** (public query exists but empty; everything useful needs a session, which D-09 forbids) | MEDIUM |
| **Caesars** (`williamhill_us`) | `sportsbook.caesars.com/us/co/bet/promotions` returns an 11KB SPA shell. Data API `api.americanwagering.com/...` returns CloudFront 403 even for a static asset (`teams.json`) with Origin/Referer set. Marketing site `caesars.com/sportsbook-and-casino/co/promotions` returns 403 with Imperva/Incapsula cookies (`visid_incap`, `incap_ses`) | none reachable | Imperva Incapsula + CloudFront WAF | **NONE / blocked** | HIGH that it is blocked from a plain client |
| **Fanatics** (`fanatics`) | Every probed URL (`sportsbook.fanatics.com/`, `/promotions`, `fanatics.com/sportsbook/`) returns Akamai "Access Denied" (`errors.edgesuite.net`) | none reachable | Akamai Bot Manager | **NONE / blocked** | HIGH |
| bet365 | Skipped by owner decision. (Probe confirmed 403 anyway.) | n/a | Cloudflare | n/a | HIGH |

### Colorado state parameters (verified)

| Book | How Colorado is selected |
|---|---|
| Hard Rock Bet | Path segment `COLORADO_ONLINE` (carousels) or query `segment=co` (layoutPromotions). NJ equivalent `segment=nj`, FL `FLORIDA_ONLINE`. A wrong region returns `[]`, not an error, so a silent empty result must be treated as "scraper broken", not "no promos" |
| BetMGM | URL slug `/betmgm-state-promos/colorado-sportsbook/`; app host `www.co.betmgm.com` |
| BetRivers | Host `co.betrivers.com`; cage code `CRP`, skin `colorado-rivers-p4r` |
| Caesars | Path `/us/co/` |
| theScore | Not parameterized in the request; geo from IP (`x-country: US` response header). The GraphQL host is `us-default` |
| (existing) DraftKings | `siteExperience: "US-CO-SB"`; Bally `jurisdiction: US-CO` |

### Hard Rock Bet payload details (the one build-ready source)

Observed 2026-10-22, 4 items in the Colorado carousel:
- `"10.05 New Welcome Offer - Bet $5 Get up to $500 in NSBs (Logged Out)"` -- the intro offer. `promoRequirements` (markdown, ~2KB) carries: sign up, place a $5+ cash bet at odds -500 or longer (e.g. +100, -110, -250), receive 10 No Sweat Bet tokens up to $50 each, one per day for ten days, "any available market", Round Robins do not qualify. This is exactly the "exact qualifying line" data v1.2 needs (min stake $5, min odds -500).
- `"NFL Injury Insurance - logged out"` and `"NBA Injury Insurance - logged out"` (~5.5KB of terms each) -- NSB-like promos that belong in the NSB feed.
- `"reward drop sportsbook - logged out"` -- no terms text; skip as not_a_promo.
- Fields worth reading: `name`, `promId`, `id`, `active`, `activeStart`/`activeEnd` (epoch ms), `loginRequired`/`logoutRequired`, `promoRequirements`, `termsAndConditions`, `modifiedTime`, `enabledVerticals` (filter to `"Sportsbook"`), `type`.
- Only items with `logoutRequired: true` are visible logged out. Logged-in-only boosts (the equivalent of DK/FanDuel profit boosts) are NOT exposed. Expect this feed to give the welcome offer and a handful of marketing promos, not a full boost list.
- Hard Rock's own marketing site `https://www.hardrock.bet/promo-code/` (WordPress, SSR, 200) restates the welcome offer in prose with "Offer Verified <date>"; usable as a cross-check or fallback text source.
- Verbatim guard note: much of the dollar/odds data lives inside markdown strings in `promoRequirements`, so feed that string (not the title) to the Haiku reader and keep the verbatim guard keyed to it.

## Recommended additions

### Core: no new dependencies required

| Addition | Version | Purpose | Why |
|---|---|---|---|
| (none) NSB math | decimal.js ^10.6.0 (already installed) | NSB hedge/EV | See formula section. The bonus-bet conversion rate is already computed by the finder; NSB just multiplies by it |
| (none) HTTP fetch | Node global `fetch` via existing `fetchPage.ts` | New scrapers | Existing polite fetcher already enforces timeout, 5MB cap, same-host redirects. Hard Rock API is on `api.hardrocksportsbook.com`; BetMGM is on `sports.betmgm.com` -- both single-host, no redirect issues except BetMGM `sports.co.betmgm.com` -> `www.co.betmgm.com` (cross-host; avoid that URL, use the `sports.betmgm.com` blog path) |
| (none) LLM extraction | @anthropic-ai/sdk ^0.129.0 (already installed) | Read HTML/markdown promo text into structured fields | Intro offers are prose ("Bet $5, get $500 in No Sweat Bets"). The existing Haiku reader + verbatim guard already solves exactly this and is the safer path than writing brittle regexes per book |

### Optional (add only if the HTML path is built)

| Library | Version | Purpose | When to use |
|---|---|---|---|
| node-html-parser | ^9.0.5 | Strip BetMGM HTML to visible text and locate the "Colorado Sportsbook Bonus" block | Only if regex tag-stripping proves too fragile. ~Zero-dependency and fast. Prefer it over cheerio (1.2.0) because we need text extraction, not jQuery-style traversal, and it keeps the bundle small |

Do not add it speculatively. A 10-line helper that removes `<script>/<style>`, strips tags, decodes entities and collapses whitespace was enough to read all three pages probed (BetMGM CO page text was 11KB from 217KB of HTML).

### Contract changes (integration points)

| File | Change | Why |
|---|---|---|
| `src/domain/promos/scraped.ts` | `BookScraper.sourceFormat: "json"` -> `"json" \| "html"` | BetMGM (and optionally Hard Rock marketing fallback) is HTML. `render` stays `"http"`, `stealth` stays `false` |
| `src/ingestion/promos/books/index.ts` | Register `hardrockbetScraper`, `betmgmScraper` | Single registration point per its own comment |
| `src/config/scrapeTargets.ts` | Add `"hardrockbet"`, `"betmgm"` to `SCRAPE_TARGET_BOOK_KEYS`; rewrite the header comment, whose "skip" rationale for BetMGM and Hard Rock is now stale (Hard Rock's "DNS failure" was a wrong host guess: the CO app is `app.hardrock.bet`, the API `api.hardrocksportsbook.com`) | Keep key list and docs in sync |
| `src/ingestion/promos/signupOffers.ts` | Add `SIGNUP_PAGE_URLS` entries (e.g. hardrockbet: `https://app.hardrock.bet/`, betmgm: `https://sports.betmgm.com/`); extend extraction beyond "new_customer skips" to also accept intro offers parsed directly | Today sign-up offers only come from `new_customer` skips of the boost scrapers; Hard Rock/BetMGM offers are intro offers by nature |
| Intro-offer schema (new fields) | Add NSB-specific fields: `offerType: "no_sweat" \| "bonus_bets" \| "deposit_match" \| ...`, `minQualifyingStake`, `minQualifyingOddsAmerican`, `refundCap`, `tokenCount`/`tokenSchedule`, `refundIsBonusBet: boolean` | Needed for "exact qualifying lines" and NSB math; Hard Rock gives all of these in `promoRequirements` |
| Manual entry form | Must support all of the above for the 4 books with no scraper | Primary path for Caesars/Fanatics/BetRivers/theScore |

## NSB math notes (no library needed)

For a no-sweat bet of stake S at decimal odds Dn, refund as a bonus bet capped at C, hedged at decimal odds Dh, with r = bonus-bet conversion rate (profit per $1 of bonus bet, from the existing finder, 0 <= r < 1, stake NOT returned):

- NSB wins: payout S*Dn (cash, stake returned on a win).
- NSB loses: refund R = min(S, C) bonus bet, worth R*r in cash terms.
- Hedge stake H on the opposite side, with cash payout H*Dh on a win.
- Equalize profit: NSB-wins case profit = `S*(Dn-1) - H`; NSB-loses case profit = `H*(Dh-1) - S + R*r`. Setting them equal gives the closed form `H = (S*Dn - R*r) / Dh`, with guaranteed profit `S*(Dn-1) - H`. (Derived by hand here; confirm with a worked example in the Vitest table.)
- All in decimal.js, rounding to cents only at display (same as existing math). Add table-driven Vitest cases with hand-computed examples, including the `S > C` case (refund capped) and the `r = 0` degenerate case (collapses to a plain arb).
- Hard Rock specifics to encode: refund is a **bonus bet** (stake not returned), the token is a $50-cap per-day token that expires 11:59 pm the day it is issued, and "if the NSB wins, no bonus bet is awarded." The qualifying first bet's result does not matter for the tokens (so the qualifying bet should itself be hedged/zero-risk, which is a separate arb from the 10 token plays).
- The refund-valued-at-live-conversion-rate design from the milestone brief is sound; the library question is settled. Re-verify the formula with a worked example from the Hard Rock terms before wiring the UI.

## Alternatives considered

| Category | Recommended | Alternative | Why not |
|---|---|---|---|
| Blocked books (Caesars, Fanatics) | Manual owner entry | Playwright + stealth | Contradicts D-09; Akamai/Imperva defeat stealth plugins; GH Actions datacenter IPs are the worst case for them; huge maintenance cost for a once-a-quarter data point |
| Blocked books | Manual owner entry | Paid third-party promo/odds aggregators (OddsPapi, SharpAPI, etc.) | They sell odds, not intro-offer terms; claims unverified; cost; and the owner needs exact terms to the cent |
| theScore | Manual entry, re-probe `publicPromotions` later | Use a logged-in session cookie | Forbidden by D-09 (no credential/session forgery) |
| BetMGM | HTML + Haiku reader | Reverse-engineer BetMGM's Angular app API | Not found within time-box; app is a lazy-chunked Angular bundle; high effort, likely Cloudflare-gated; the CO marketing page already carries the intro offer headline |
| HTML parsing | tiny strip helper (or node-html-parser) | cheerio 1.2.0, Playwright | Overkill for text extraction |
| Intro-offer text source for BetRivers | Manual entry | Affiliate/review sites (covers.com, gambling.com, etc.) | Third-party editorial text can be stale or wrong; wrong data in a "correct to the cent" tool is worse than no data. If ever used, label as unverified and require owner confirmation |

## What NOT to add

- Playwright / playwright-extra / stealth / residential proxies / any anti-bot token forging (D-09; also see Caesars/Fanatics blocks).
- A solver / optimization library (e.g. numeric.js, glpk) for NSB; it is one linear equation.
- Any second money-math library. Keep decimal.js only.
- cheerio (unneeded weight) -- see optional section.
- A GraphQL client for theScore (one POST with `fetch` is enough, and the useful queries need auth anyway).
- Do not scrape logged-in-only surfaces (BetRivers promo lobby, theScore authenticated queries, Hard Rock logged-in carousels).

## Risks and open questions (flagged for phase research)

1. **GitHub Actions / Vercel IP reputation (HIGH impact, untested).** All probes were from a residential IP. Cloudflare `__cf_bm` sites (Hard Rock API, BetMGM, BetRivers, theScore) may challenge datacenter IPs. DraftKings/FanDuel/Bally already work from the pipeline, which is mildly encouraging, but each new book needs a first real run (`workflow_dispatch`) before it is declared done. Build each scraper to fail soft, report `fetch_failed`, and fall back to the last good snapshot + manual entry.
2. **Hard Rock region mismatch returns `[]` silently.** Add a "found 0 promos" alarm.
3. **BetMGM CO page copy is editorial, not a data feed.** Headline amount ("up to $1,500 in Bonus Bets") is an upper bound for a reload-style first-bet offer; the real terms (which bet sizes earn what, refund rules) are behind "Add'l terms" links. The Haiku reader should extract only what is stated; mark the offer "terms incomplete, confirm in app."
4. **Hard Rock terms vary by promo `type`.** Only `imageOnlyCTA` items were seen; other types may structure data differently. Validate with Zod `looseObject` like the DK scraper does.
5. **theScore `publicPromotions`** returned `[]`; it may populate when a public welcome promo is live. Cheap to keep as a low-priority poll once the pipeline exists (single POST, no auth), but do not depend on it.
6. **BetMGM `sports.co.betmgm.com` redirects cross-host** (`www.co.betmgm.com`); `fetchPage.ts` refuses cross-host redirects (WR-08). Use only `sports.betmgm.com` blog URLs.
7. **ToS.** Several vendor pages assert scraping violates sportsbook ToS (vendor-sourced, LOW confidence). The project is private and logged-out only; keep request volume at the existing 3 runs/day cadence.

## Sources

- Live probes, 2026-10-22, plain curl from Colorado residential IP: `api.hardrocksportsbook.com` carousel and layoutPromotions endpoints (HIGH, direct observation); `sports.betmgm.com/en/blog/betmgm-state-promos/colorado-sportsbook/` (HIGH); `www.hardrock.bet/promo-code/` and homepage embedded script (the source of the `api.hardrocksportsbook.com` URLs) (HIGH); `sportsbook.thescore.bet/env.js` and GraphQL responses incl. "Did you mean ... publicPromotions" (HIGH); `api.americanwagering.com` CloudFront 403, `caesars.com` Incapsula 403, `sportsbook.fanatics.com` Akamai Access Denied, `thescore.bet` 403, `bet365.com` 403 (HIGH); `co.betrivers.com` homepage and `rushstreetcontent.com` promo-lobby bundle paths (HIGH for what exists, MEDIUM for interpretation).
- `.planning/milestones/v1.0-phases/03-promo-scraping-review/03-RECON.md` -- prior per-book posture, D-09 decisions (HIGH, internal).
- `src/ingestion/promos/books/draftkings.ts`, `src/config/scrapeTargets.ts`, `src/domain/promos/scraped.ts`, `src/ingestion/promos/fetchPage.ts`, `src/ingestion/promos/signupOffers.ts` -- existing scraper contract and integration points (HIGH, internal).
- npm registry via `npm view`: node-html-parser 9.0.5, cheerio 1.2.0, decimal.js 10.6.0 (HIGH).
- WebSearch for Caesars/BetMGM/Kambi promo endpoints: found no documented public promotions API for any of them; vendor pages state none exists (LOW, vendor marketing).
