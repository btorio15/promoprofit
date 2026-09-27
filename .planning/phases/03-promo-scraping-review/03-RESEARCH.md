# Phase 3: Promo Scraping & Review - Research

**Researched:** 2026-09-27
**Domain:** Sportsbook promo scraping (anti-bot posture per Colorado book) + deterministic event/market matching + profit-boost hedge math with caps
**Confidence:** MEDIUM — boost math is HIGH confidence (direct extension of the existing, verified hedge engine); scraping feasibility is MEDIUM (empirically probed live, this session, but the exact page that carries single-game boost data was not conclusively located for any book — see Open Questions); matching-method design is MEDIUM (no reference architecture exists, per SUMMARY.md's own flag — this is a reasoned design, not a verified one).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Boost math & where it shows**
- D-01: Scraped promos and their computed hedges appear on a new top-level **"Promos"** tab, third after **Bonus bets | Arbitrage**, sharing the status bar. Each active promo shows its best hedge book, both stakes, guaranteed profit and ROI %. Phase 4 grows this tab into the opportunities feed rather than replacing it.
- D-02: A boost hedge uses the **stake that maximizes guaranteed profit within the promo's caps** — usually the max stake, or less when the max-winnings cap binds. The stake is **shown, not editable**.
- D-03: When a book shows a **boosted price, the math uses it** (books round their own boosted odds). The app derives the boosted price from boost % + current odds **only when no boosted price is shown**.
- D-04: A boost **may be hedged at the same book** that offered it — gets the existing "Same book" badge (Phase 1 D-17, Phase 2 D-15).
- D-05 (carried): Hedge books limited to the **user's selected books** among the 7 API-covered books (Phase 2 D-10/D-14). Only 2-way, no-push markets qualify: moneylines, half-point spreads/totals (CALC-05). Stake rounding follows the existing precision setting (01.1 D-02). Shared `RiskAdvisory` appears here too (CALC-06).

**Scraping targets & schedule**
- D-06: **Research picks the first book** — most feasible public, no-login promo page among the 7 covered books, judged on reachability and anti-bot posture. At least one book must work this phase; others opportunistic.
- D-07: Scraper runs **a few times a day** via GitHub Actions `on: schedule` cron. Research proposes exact times matching when books post daily promos (e.g. ~8am, noon, 5pm Mountain Time); cron runs in UTC, convert. Writes straight to Neon Postgres; spends no Odds API credits.
- D-08: A failed run (blocked, layout changed, zero promos parsed) **stores a per-book last-run status**, shown on the Promos tab (e.g. "DraftKings promos updated 3h ago · last run failed"). Existing promos **stay until they expire**, never wiped by a failed run.
- D-09: **Anti-bot tooling:** `playwright-extra` stealth plugin **allowed**. **No paid or residential proxies.** Whether to use stealth, or skip a book, is decided **book by book after research reports** each book's defenses — the owner wants to review that together; research must report per-book posture, not quietly pick one approach. Never log in, never store credentials (PROJECT.md).

**Match certainty & review queue**
- D-10: Matching uses a **confidence score with a strict auto-accept threshold**. Above threshold → live automatically. Below → review queue, excluded from hedge math until confirmed. Research proposes the threshold and **tunes it on real scraped samples** against cached Odds API events: team aliases, start time, market/side.
- D-11: Auto-matched promos carry a visible **"Auto-matched"** tag. **Any member can flag one**, pulling it back to the review queue. Safety net against ARCHITECTURE.md Anti-Pattern 2.
- D-12: **Any logged-in member** can confirm, correct or dismiss a queued promo; the app **records who did it** ("Refreshed by" attribution pattern, Phase 2 D-21).
- D-13: The queue is a **"Needs review (N)"** section inside the Promos tab, above active promos, actions inline. No separate route.
- D-14: Reviewer actions: **Confirm** the suggested match; **Correct** it via dropdown-picked event + market/side from cached games (ARCHITECTURE.md Pattern 1); **Dismiss** it (e.g. an unhedgeable boost) — a dismissed promo is **not re-queued** by later scrapes of the same promo.

**Scraped promo lifecycle**
- D-15: Keep only **single-game promos on a 2-way market we can hedge**: profit boosts and bonus-bet offers on a moneyline or half-point spread/total. Skip parlay, SGP, prop, deposit and sign-up offers.
- D-16: A promo **expires** (drops off the tab) at whichever comes first: it no longer appears on a later **successful** scrape of that book; its stated expiry; the game's start time. A failed run expires nothing (D-08).
- D-17: Fine print: **max stake, max winnings, minimum odds** parsed into structured fields the math uses (CALC-03). Other terms (opt-in required, eligibility) kept and shown as a short note on the row.
- D-18: A boost whose **cap can't be parsed goes to the review queue**, where a member enters it. **The math never guesses a cap.**
- D-19: The same promo seen across runs is **deduplicated**, not re-inserted. Dismissals and confirmations persist across runs.

### Claude's Discretion
- Promo table shape, per-book scrape-run status table, alias table, dedupe key.
- The confidence-scoring method and features (strictness is the user's call per D-10/D-11; the method is not).
- Promos tab row layout/sorting, reusing the compact expandable row pattern (finder/arb). Bonus-bet promos show conversion %, boosts show ROI %.
- Boost formula implementation as pure decimal.js functions next to `src/domain/hedge/bonusBet.ts`, Phase 1's pure-engine convention, known-answer tests correct to the cent.
- Scraper code layout as a separate script/workspace run by Actions, not bundled into Next.js (CLAUDE.md); how scraped text is parsed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. The opportunities feed, tandem hedges (Phase 4: DASH-01/-03/-05, CALC-07), manual promo entry/editing (Phase 5: PROMO-01/-02/-05), parlay/SGP/prop boosts, deposit/sign-up offers, and authenticated scraping are all explicitly out of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALC-02 | Compute profit-boost hedges from boost % on profit or a book-published boosted price: exact stakes, guaranteed profit, ROI % on cash risked | "Boost Math" section below extends FEATURES.md §2's verified formulas with the exact `Ob_eff` derivation rule (D-03) and reuses the existing `bestHedgeQuote`/candidate-search idiom from `rankBonusBetHedges.ts`/`arbMath.ts` |
| CALC-03 | Boost math respects max-stake/max-winnings caps, choosing the optimal stake when a cap binds | "Boost Stake Optimization Under Caps" — closed-form kink-point derivation + discrete candidate search, mirroring `arbMath.ts`'s existing rounding-candidate discipline |
| PROMO-03 | Scheduled GitHub Actions scraper reads public, no-login promo pages for ≥1 CO book, adds promos automatically | "Scraping Feasibility by Book" (empirical, live-probed) + "GitHub Actions Scheduling" (IANA-timezone cron, resolves D-07 cleanly) |
| PROMO-04 | Scraped promo with uncertain event/market match held in review queue, excluded from hedge math until confirmed | "Matching & Confidence Scoring" — deterministic 3-signal gate design, `pending_review` schema sketch, Anti-Pattern 2 guard |

</phase_requirements>

## Summary

This phase has two largely independent halves that should be planned (and can be built) separately: **boost math** is a low-risk, mechanical extension of the existing, already-verified hedge engine — the formulas are settled (FEATURES.md §2), the project's own `decimal.js` candidate-search pattern (`bonusBet.ts`, `arbMath.ts`) generalizes cleanly to the boost's stake-optimization-under-caps problem, and no new external dependency is needed. **Scraping and matching** are the genuinely uncertain half the roadmap already flagged, and this session's live investigation confirms why: of the 7 free-tier-covered Colorado books, the two largest (DraftKings, FanDuel) carry enterprise anti-bot fingerprints (Akamai Bot Manager, PerimeterX/HUMAN) that make unattended scraping a poor bet under D-09's no-proxies constraint; the three Kambi-platform books (BetRivers, Bally Bet, and partially Hard Rock Bet) are friendlier to plain HTTP fetching, but this session could not conclusively locate where **single-game, per-event boosted odds** actually render on any of the 7 books' public pages — every promotions-style URL tried this session returned sign-up-offer or loyalty-program content, not a structured feed of "Broncos ML boosted to +150" style entries. That is the single most important finding of this research: **the phase's scraper target page is not yet nailed down**, and Wave 0 of implementation must include a short manual (human, logged-out, real-browser) reconnaissance pass on the 1-2 candidate books before any scraper code is written against assumed selectors.

Given the empirical evidence gathered, **Bally Bet is the recommended first scrape target** (D-06): it is Kambi-powered, returned plain-HTTP 200 with substantial (100-130KB) fully server-rendered HTML with no JS-challenge or bot-management cookie friction encountered, meaning a simple `fetch` + `cheerio` parser — no Playwright/Chromium at all — may suffice if the eventual target page is similarly server-rendered. **BetRivers is the fallback** (same Kambi family, also plain-HTTP-friendly, but the specific promotions page tested skewed toward loyalty-store content). DraftKings and FanDuel are not recommended targets this phase under the no-stealth-escalation constraint. theScore Bet's promotions route is a thin Cloudflare-fronted SPA shell needing JS rendering (Playwright, no stealth needed against Cloudflare's default posture, per STACK.md). Hard Rock Bet's Colorado app subdomain could not be resolved this session and needs a follow-up DNS/URL-discovery spike. This per-book comparison is presented as a table for the owner's D-09 book-by-book review, not a unilateral pick.

For matching (PROMO-04), the recommendation is a **deterministic 3-signal certainty gate** (team-alias match, date match, market/side match — each boolean, computed against the existing cached Odds API events) rather than a fuzzy/statistical similarity score: because the team/alias space is small and bounded (5 configured sports, ~30-100 active teams), a curated alias table beats a general-purpose fuzzy-string library on both correctness and testability, and keeps the design honest about Anti-Pattern 2 (a "72% confident" match is still a guess; "all three signals resolved to exactly one candidate" is not). The "confidence score, tuned on real samples" D-10 asks for is best understood as *tuning alias-table/date-window coverage* (reducing false negatives that needlessly park good matches in review), not sliding a numeric threshold up or down.

**Primary recommendation:** Build and fixture-test the boost engine first (self-contained, no external dependency, extends proven patterns) while a human manually locates each candidate book's actual boost-listing page; then target Bally Bet (fallback BetRivers) with a `fetch`+`cheerio` scraper (no Playwright unless the confirmed target page turns out to be JS-rendered), gated by the deterministic 3-signal matcher, on a GitHub Actions cron using the new (March 2026) native IANA-timezone field so `0 8,12,17 * * *` with `timezone: America/Denver` runs at the intended Mountain-Time hours through DST changes with zero manual UTC-offset math.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Profit-boost stake/profit/ROI math | Domain (pure engine, `src/domain/hedge/`) | — | Zero-I/O, decimal-exact, fixture-tested — same tier as `bonusBet.ts`/`arbMath.ts` (Anti-Pattern 3 guard: never couple math to DB/API) |
| Promo scraping (per-book fetch/parse) | Scheduled job (GitHub Actions, standalone script) | — | CLAUDE.md/STACK.md: Playwright/Chromium too large for Vercel functions; runs outside the Next.js deployable entirely, writes straight to Neon |
| Event/market matching (confidence gate) | Domain (pure function over promo text + cached events) | Ingestion (invoked by the scraper script) | Matching is a deterministic computation over two plain-data inputs (parsed promo, cached `OddsEvent[]`) — same "pure function, DB-agnostic" discipline as `marketFilter.ts` |
| Review queue persistence & actions | API/Backend (server actions: confirm/correct/dismiss/flag) | Database | Same `requireUser()` → Zod → domain-fn → typed-result shape as every existing server action (Phase 2 pattern) |
| Promos tab UI | Frontend (Next.js App Router, client components) | — | Reuses `AppShell` tabs, `Collapsible` row, `Card`-idiom queue items — no new UI framework surface |
| Per-book scrape-run status | Database (`scrape_runs` table) | Frontend (status panel read) | Read-mostly, low-cardinality, no caching layer needed at this scale (mirrors `credit_usage`/`refresh_lock` pattern) |
| Odds/event lookup for matching | Ingestion (existing `getCachedEvents`) | — | Reuses Phase 1/01.1's cache — matching spends zero additional Odds API credits (D-07) |

## Standard Stack

### Core

No new core technology — this phase extends the existing Next.js/Drizzle/Postgres/decimal.js stack (see `CLAUDE.md`, `.planning/research/STACK.md`). Boost math uses the same `decimal.js` (`^10.6.0`, already installed) local-precision-clone pattern as `bonusBet.ts`/`arbMath.ts`.

### Supporting

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright` | 1.63.0 [VERIFIED: npm registry] | Headless-browser scraping for any candidate book whose promo/boost content is confirmed JS-rendered (e.g. theScore Bet's thin SPA shell) | Already the project's designated scraping tool (STACK.md); version matches what's already documented — no drift |
| `playwright-extra` | 4.3.6 [VERIFIED: npm registry] | Wraps Playwright to attach stealth plugins (D-09 explicitly allows this) | Official companion package for applying `puppeteer-extra`-style plugins to Playwright's browser instances; maintained by the same `berstend/puppeteer-extra` org as the stealth plugin below |
| `puppeteer-extra-plugin-stealth` | 2.11.2 [VERIFIED: npm registry] | The actual stealth plugin (evades `navigator.webdriver`, plugin/UA fingerprinting) referenced by D-09 and STACK.md | Despite the "puppeteer" name, this is the standard plugin used *with* `playwright-extra` for Playwright — there is no separately-maintained "playwright-stealth" JS package with comparable adoption; STACK.md already flags this ecosystem as the Node-side option (vs. the more actively maintained Python `playwright-stealth`) |
| `cheerio` | 1.2.0 [VERIFIED: npm registry] | Parse plain server-rendered HTML (no JS execution) for any book confirmed to serve promo content without client-side rendering (Bally Bet, BetRivers, per this session's probing) | Avoids spinning up Chromium at all for the books that don't need it — much lower CI minutes/runtime risk than defaulting every book to Playwright; standard, long-established HTML-parsing library, already a implicit dependency-of-choice pattern for `fetch`-then-parse Node scrapers |

**Installation** (scraper workspace only — per CLAUDE.md, "separate workspace/script, not bundled into the Next.js app"; exact placement is Claude's discretion per CONTEXT.md):
```bash
npm install --save-dev playwright playwright-extra puppeteer-extra-plugin-stealth cheerio
npx playwright install --with-deps chromium
```

**Version verification:** all four packages confirmed on npm registry via `npm view <pkg> version` during this research session (2026-09-27) — versions above are current as of that check, not carried over from training data.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `playwright` + `playwright-extra` stealth (Node) | A Python scraper script (`playwright-stealth` Python package) invoked from the same GH Actions cron | STACK.md already flags Python's stealth ecosystem as more actively maintained as of 2026 — worth revisiting **only if** the Node stealth combo is confirmed unreliable against a specific book (e.g. if Bally Bet/BetRivers later turn out to need JS rendering + stealth after the Wave 0 spike). Introduces a second language/toolchain for a 1-2 person team; not recommended as a default. |
| `cheerio` for server-rendered pages | Regex-only text extraction (no HTML parser) | Regex-on-raw-HTML is exactly the "Hardcoded team-name/book-name string matching" technical-debt pattern PITFALLS.md calls out as acceptable only as a v0 spike — `cheerio`'s DOM API is barely more code and far less brittle to markup reshuffling; use it from the start |
| Deterministic 3-signal match gate (recommended) | A general fuzzy-string library (`fuse.js`, `string-similarity`, `leven`) for team-name matching | A fuzzy library adds a dependency and a numeric-similarity mental model that actively invites Anti-Pattern 2 ("72% match → looks close enough"); the team/alias space here is small, bounded, and already known (5 sports × cached Odds API team names) — a curated alias table is more testable and doesn't need a library at all. Reconsider only if hand-curated aliases prove too maintenance-heavy after real scraped samples (D-10) |

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `playwright` | npm | ~11 yrs (first publish 2015; actively released, current 1.63.0) | github.com/microsoft/playwright | OK | Approved — already project-standard per STACK.md |
| `playwright-extra` | npm | ~6 yrs (first publish 2020) | github.com/berstend/puppeteer-extra | OK (flagged `HALLUCINATION_PATTERN`/info: name ends in "-extra", a common LLM-bait naming shape — but slopcheck confirms the package is established, not hallucinated) | Approved — flag is informational only; package predates this research by years and is the documented STACK.md-adjacent choice for D-09 |
| `puppeteer-extra-plugin-stealth` | npm | ~8 yrs (first publish 2018) | github.com/berstend/puppeteer-extra | OK | Approved — matches STACK.md's explicit D-09 allowance |
| `cheerio` | npm | ~15 yrs (first publish 2011) | github.com/cheeriojs/cheerio | OK | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none. (`playwright-extra`'s info-level naming flag is not a suspicion signal — slopcheck's own output marks it `status: OK` and explicitly notes "package is established.")

All four packages were discovered from this project's own prior research (`STACK.md`, already `[CITED]`) or from official Playwright/berstend-org documentation conventions, not from an unverified web search — combined with the clean `slopcheck` + live `npm view` results above, they are tagged `[VERIFIED: npm registry]` throughout this document per the package-name-provenance rule.

## Scraping Feasibility by Book (empirical, live-probed 2026-09-27)

**Method:** For each of the 7 free-tier-covered Colorado books (`src/config/books.ts`), this session made live, plain-`curl` HTTP requests (real Chrome UA, `-L` for redirects) to the book's public marketing/promotions URL and inspected response headers (bot-management cookies, CDN/WAF vendor) and body content (JS-shell vs. server-rendered HTML, presence of promo/boost text). This is **direct evidence from this session**, not a claim carried over from training data — tagged `[VERIFIED: live HTTP probe, 2026-09-27]` below. It does **not** replace a real-browser, human, logged-out visual pass — see Open Questions.

| Book (Odds API key) | URL tried | Result | Anti-bot signal observed | Scrapability verdict |
|---|---|---|---|---|
| DraftKings (`draftkings`) | `sportsbook.draftkings.com/promos` | HTTP 200, 1.16MB HTML | **Akamai Bot Manager** — `_abck` and `bm_sz` cookies set on first request; page's embedded `window.__INITIAL_STATE__` has `"offers":{}` (empty — promo content loads via a later client-side API call); 3 guessed internal API paths all returned `403 Access Denied` from `errors.edgesuite.net` (Akamai's own error domain) | **HIGH difficulty.** The static page shell is fetchable, but the actual promo data requires either (a) executing DraftKings' client JS to make the authenticated-looking internal API call, which Akamai's sensor-cookie challenge is specifically designed to gate, or (b) reverse-engineering that internal API, which 403'd on every guess. Matches STACK.md's prediction exactly. |
| FanDuel (`fanduel`) | `sportsbook.fanduel.com/promotions/` | HTTP 200, 11KB HTML (thin SPA shell) | CDN = CloudFront; CSP headers explicitly reference `*.px-cloud.net` / `*.px-cdn.net` (**PerimeterX/HUMAN Security**) and `*.geocomply.com`/`*.geocomply.net` (geofencing) | **HIGH difficulty.** Page is a near-empty React shell — real content needs JS execution, and the CSP confirms enterprise bot detection + geo-fencing layered on top. |
| BetMGM (`betmgm`) | `sports.betmgm.com/en/blog/promotions/` (blog) and `/en/sports/promotions` (app route) | Blog: HTTP 200, 330KB static-looking HTML. App route: HTTP 302 redirect (not chased further this session) | **Cloudflare** (`cf-ray`, `server: cloudflare`) on both | **MEDIUM-HIGH difficulty, uncertain content match.** The blog URL loaded without a JS challenge, but it reads as general marketing content, not the live in-app boost list; the actual `/sports/promotions` app route 302'd and needs follow-up. |
| BetRivers (`betrivers`) | `co.betrivers.com/?page=promotions` | HTTP 200, 232KB server-rendered HTML | **Cloudflare Bot Management** cookie (`__cf_bm`) present but no challenge/block encountered — page rendered fully in the plain HTTP response | **LOW-MEDIUM technical-blocking risk.** Kambi-platform book — real, substantial server-rendered content came through with a plain `curl`, no Playwright needed for *this* page. However, the content found was a loyalty "Bonus Store"/rewards-redemption section (`class="bonus-bank-table"`), FAQ, and EULA text — no per-game team names or boost percentages appeared anywhere in the fetched HTML. **Content-shape mismatch with D-15's "single-game promo" target — see Open Questions.** |
| theScore Bet (`espnbet` key) | `sportsbook.thescore.bet/promotions` | HTTP 200, 3.5KB HTML (thin shell) | **Cloudflare** (`__cf_bm`, `cf-ray`) present, no challenge encountered on this request | **MEDIUM difficulty.** Needs JS rendering (Playwright) to see real content, but faces only Cloudflare's default bot management, not an Akamai/PerimeterX-class system — STACK.md rates Cloudflare as more consistently defeatable by `playwright-extra` stealth than the enterprise systems on DK/FanDuel. |
| Bally Bet (`ballybet`) | `www.ballybet.com/co` | HTTP 200, 134KB, fully server-rendered HTML — no JS-state blob found at all | **Cloudflare** (`cf-ray`) present, no bot-management cookie or challenge encountered | **LOW technical-blocking risk — best plain-HTTP result of all 7 books.** Visible server-rendered text includes "BONUS BETS", "Promotional Terms & Conditions", "PROMOTIONAL PERIOD" — real promo copy, no `cheerio`-defeating JS shell. Content read as new-customer sign-up-offer terms on this specific URL, not confirmed per-game boost data — see Open Questions. Several guessed sub-paths (`/co/promotions`, `/co/boosted-odds`, `/co/sports/nfl`) all returned an identical 18.7KB fallback shell (a 404/SPA-catch-all), confirming those specific guesses were wrong, not that the site is unscrapable. |
| Hard Rock Bet (`hardrockbet`) | `co.hardrockbet.com/*` (does not resolve — DNS failure); `hardrockbet.com`/`hardrock.bet` (resolves, redirects to marketing site `www.hardrock.bet`, 527KB static page) | The CO-specific **app** subdomain could not be found this session | Unknown (never reached the live app) | **UNKNOWN — not evaluated.** The marketing domain (`hardrock.bet`) is pure SEO/editorial content, not the live sportsbook; the actual CO app is presumably on a different subdomain (e.g. an `account.` or state-specific path) not identified in this pass. |

**Recommendation for D-06 (research picks the first book):** **Bally Bet**, with **BetRivers as the documented fallback** — both are Kambi-platform books that returned real, substantial, plain-HTTP-fetchable server-rendered HTML with no bot-management friction encountered, in direct contrast to DraftKings/FanDuel's confirmed enterprise anti-bot layers. This pick is presented for the owner's D-09 book-by-book review, not decided unilaterally — the table above is what D-09 asks research to produce ("report per-book posture and not quietly pick an approach"). **Caveat, load-bearing for planning:** neither Bally Bet's nor BetRivers's specific URL fetched this session was confirmed to contain the single-game, per-event boosted-odds data D-15 requires (see Open Questions) — Wave 0 of implementation should include a short manual/visual reconnaissance task on both before writing scraper selectors against assumed page structure.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions (on: schedule, cron + timezone: America/Denver)      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐              │
│  │ Bally Bet     │   │ (opportunistic: other books, per D-09 review) │
│  │ scraper script│   │  ...          │                               │
│  └──────┬───────┘   └──────┬───────┘                                 │
│         │ fetch + cheerio (or Playwright, if confirmed JS-rendered)  │
│         ▼                                                            │
│  ┌────────────────────────────────────────────────────────┐          │
│  │ Parse raw promo candidates: book, type, boost%/price,   │          │
│  │ market text, cap text, fine print, dedupe key           │          │
│  └───────────────────────┬──────────────────────────────────┘        │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────┐          │
│  │ Deterministic 3-signal matcher (pure fn, this phase)     │          │
│  │  team-alias match ∧ date match ∧ market/side match       │          │
│  │  reads: getCachedEvents() (existing, zero extra credits) │          │
│  └───────┬─────────────────────────────┬─────────────────────┘        │
│  all 3 true│                       any false │                       │
│          ▼                                  ▼                        │
│  status=active,           status=pending_review, excluded from       │
│  auto_matched=true         hedge math (PROMO-04 guard)                │
└──────────┼──────────────────────────────────┼─────────────────────────┘
           │  writes to Neon Postgres          │
           ▼                                  ▼
   ┌───────────────────────────────────────────────────┐
   │              promos table (+ scrape_runs)           │
   └───────────────────────┬─────────────────────────────┘
                            ▼
   ┌───────────────────────────────────────────────────┐
   │  Promos tab (Next.js): reads active promos +        │
   │  cached odds (existing getCachedEvents) → boost      │
   │  engine (this phase, pure fn) → ranked rows           │
   │                                                        │
   │  Needs-review section: server actions confirm/         │
   │  correct/dismiss/flag → requireUser() → attribution     │
   └───────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── domain/
│   ├── hedge/
│   │   ├── profitBoost.ts        # NEW — boost solver, mirrors bonusBet.ts/arbMath.ts discipline
│   │   └── profitBoost.test.ts   # NEW — known-answer fixtures (D-02/D-03/D-18)
│   └── promos/                   # NEW domain subdir (naming: Claude's discretion)
│       ├── matcher.ts            # NEW — pure 3-signal match fn: (parsedPromo, OddsEvent[]) -> MatchResult
│       ├── matcher.test.ts
│       ├── aliases.ts            # NEW — curated per-sport team-name alias table
│       └── dedupe.ts             # NEW — deterministic dedupe-key derivation
├── db/
│   └── schema.ts                 # EXTEND — promos, scrape_runs, (optionally) team_aliases tables
├── app/actions/
│   ├── confirm-promo-match.ts    # NEW — requireUser() -> Zod -> matcher/db -> typed result
│   ├── correct-promo-match.ts    # NEW
│   ├── dismiss-promo.ts          # NEW
│   └── flag-promo-match.ts       # NEW (D-11)
├── components/promos/            # NEW — Promos tab, queue-item cards, promo rows (per 03-UI-SPEC.md)
└── ...
scripts/                          # existing tsx --env-file pattern
scrapers/                         # NEW, separate workspace (CLAUDE.md: "not bundled into the Next.js app")
├── ballybet.ts                   # per-book scraper entry point
├── shared/parseFinePrint.ts      # cap/min-odds text extraction shared across books
└── package.json                  # own deps (playwright, cheerio) — does not bloat the Next.js bundle
.github/workflows/
└── scrape-promos.yml             # NEW — first workflow file in this repo
```

### Boost Math

**Mechanic (a) — boost % applied to profit** (D-03 fallback when no boosted price is published), verified against FEATURES.md §2 and the standard DraftKings/FanDuel "Profit Boost" mechanic `[CITED: FEATURES.md, cross-referenced against DraftKings/SportsGrid support docs]`:
```
Ob_eff = 1 + (O - 1) × (1 + boostPct)     // O = original decimal odds, boostPct e.g. 0.50
```

**Mechanic (b) — book-published boosted price** (D-03 primary path): `Ob_eff` **is** the published boosted price, converted via the existing `americanToDecimal()` — no separate boost-% computation, no re-derivation from the original line. This is the D-03 rule stated plainly: *never* recompute a boosted price from boost% when the book already published one, because the book's own rounding of that boosted price is the number a real bet will settle against.

**Hedge stake and profit** (both legs stake-returned, unlike bonus bets — reuse the existing `bestHedgeQuote` search from `rankBonusBetHedges.ts` to find the highest-decimal-odds opposing quote among the user's allowed books, D-05):
```
H = S × Ob_eff / Oh
Profit(S) = S × Ob_eff − (S + H) = S × (Ob_eff × (Oh − 1)/Oh − 1)
```
`Profit(S)` is **linear in S** with slope `k = Ob_eff × (Oh − 1)/Oh − 1`. If `k ≤ 0`, no stake makes this boost profitable at the best available hedge book — treat identically to how `calculateArb` returns `null` for a non-arb and `rankBonusBetHedges` filters `guaranteedProfit.lte(0)`: exclude the opportunity rather than show a $0-or-negative row.

### Boost Stake Optimization Under Caps (CALC-03, D-02)

If `k > 0`, profit is monotonically increasing in `S` up to the point a cap binds, then flat-or-decreasing — so the optimal stake is at a **boundary or kink point**, never in the interior. This generalizes the existing `arbMath.ts`/`bonusBet.ts` "evaluate a small set of exact candidates, take the best after cent-rounding" pattern:

1. **Max-stake cap** (`maxStakeCap`, required — D-18: if unparsed, this promo goes to review, the solver is never invoked with a null cap): a hard upper bound on `S`.
2. **Max-winnings cap** (`maxWinningsCap`, optional): once the boosted-profit *portion* reaches this cap, additional stake earns no more boosted profit while still increasing hedge risk — profit strictly decreases past this point. Solve the kink stake `S*` from whichever cap-wording interpretation applies (see Assumptions Log — this is genuinely promo-text-dependent and not resolvable from formulas alone):
   - If the cap reads as "max boost/profit of $X" (delta-capped): `S* = maxWinningsCap / (boostPct × (O − 1))` (mechanic (a) only — a published boosted price has no separate "delta" unless the original line is also known).
   - If the cap reads as "max total winnings/payout of $Y": `S* = maxWinningsCap / Ob_eff`.
3. **Candidate set** (mirrors `arbMath.ts`'s dual-rounding-candidate style): `{ maxStakeCap rounded to precision, S* rounded down AND up to precision (if a winnings cap exists and S* < maxStakeCap), one precision-unit above/below each }`. Evaluate `Profit(S)` at each with the same cent-floor payout discipline (`clean()` + `ROUND_DOWN` on payouts) already used in `bonusBet.ts`/`arbMath.ts`, pick the maximum, tie-break toward the smaller stake.
4. **minOdds** (D-17's third structured field) is **not** a stake-optimization input — it is an eligibility check (does the current market's odds on the promoted side meet the promo's stated minimum) evaluated before the solver runs at all, not part of `Profit(S)`.

**Why this reuses, not reinvents, existing patterns:** `arbMath.ts` already solves "maximize guaranteed profit subject to a total-stake cap, with cent-rounding on both legs" via exact discrete-candidate search — this is the same shape of problem with one additional kink from the max-winnings cap. The planner should treat this as a same-file-neighbor extension (`profitBoost.ts` next to `arbMath.ts`/`bonusBet.ts`), not a new abstraction.

### Matching & Confidence Scoring (PROMO-04, D-10, D-11)

**Recommended method — deterministic 3-signal certainty gate**, not a fuzzy/statistical similarity score:

| Signal | Computation | Passes when |
|---|---|---|
| `teamMatch` | Normalize scraped team text via a curated per-sport alias table (e.g. "LA Rams" → "Los Angeles Rams") against `getCachedEvents()`'s `home_team`/`away_team` for the promo's sport | Exactly one cached event's team pair resolves — zero or multiple candidates both **fail** (ambiguous ≠ confident) |
| `dateMatch` | If the scraped text has a parseable date/time, require same-calendar-day (America/Denver) match against the candidate's `commence_time`. If no date is stated in the promo text at all, this signal only passes when `teamMatch` already narrowed to exactly one event (guards against same-day doubleheaders, e.g. MLB day/night splits) | Single unambiguous day, or single remaining candidate |
| `marketMatch` | Parsed market keyword (moneyline / spread+line / total+line + side) maps to exactly one of the market's two outcomes in cached odds, and the market is 2-way/no-push (reuse existing `marketFilter.ts`/`spreadsTotalsFilter.ts` eligibility, D-15) | Unambiguous single-outcome mapping |

`confidence = teamMatch ∧ dateMatch ∧ marketMatch`. **Auto-accept threshold: all three true.** Any single false signal → `pending_review`, excluded from hedge math (PROMO-04), with whatever partial match info exists shown as the queue card's "Best guess" line (per 03-UI-SPEC.md) for the reviewer's benefit only — it never auto-activates (Anti-Pattern 2 guard, D-11's flag-back is the correction mechanism if this ever goes wrong).

**Why not a fuzzy library:** the team/alias space is small and fully known ahead of time (5 configured sports in `src/config/sports.ts`, on the order of 30-100 active team names total) — a curated, hand-tested alias table is more precisely testable (known-answer fixtures, same discipline as the hedge engine) than tuning a numeric similarity cutoff on a general string-distance metric, and it structurally cannot produce a "close enough" false positive the way a Levenshtein-distance threshold can. This directly serves D-11's stated purpose (the safety net against "auto-trusting fuzzy matches").

**What D-10's "tune the threshold on real scraped samples" becomes under this design:** there is no numeric slider to tune — tuning instead means (a) growing the alias table as real scraped text reveals new spellings/abbreviations ("Cowboys" vs "Dallas Cowboys" vs "DAL"), and (b) hardening the date-window logic against real edge cases (doubleheaders, postponements, next-day international kickoffs). The planner should schedule a small Wave-0-or-1 task that runs the matcher against a handful of real scraped samples from the chosen book and manually reviews false negatives (good matches parked in review because of a missing alias) — there should be zero false positives by construction, so this tuning pass is purely about recall, not precision.

### Dedupe (D-19)

Recommend a `dedupe_key` derived deterministically from `(book_key, normalized promo type + boost value/boosted price, raw scraped promo text hash)` — computed **before** matching runs, so a promo that a reviewer already dismissed is recognized and skipped on the next scrape even if matching would resolve it differently run-to-run (e.g. cached events rotate as games start). A promo's `event_id`/`market_key` (once matched) should **not** be part of the dedupe key, since D-19 requires dedup to survive re-matching, not just re-confirm an identical match.

### GitHub Actions Scheduling (D-07)

**State of the art, verified this session:** GitHub Actions added native **IANA timezone support** for `on.schedule` cron entries in **March 2026** `[VERIFIED: github.blog/changelog, fetched 2026-09-27]` — a `timezone:` field can sit alongside `cron:`, and GitHub handles the UTC conversion (including DST transitions) automatically. This **fully resolves** the old "GitHub Actions cron is UTC-only, manually maintain two DST-adjusted entries per season" workaround that all pre-2026 blog posts (and this project's own STACK.md, researched 2026-09-25 before this feature was in general awareness) describe.

```yaml
# .github/workflows/scrape-promos.yml
on:
  schedule:
    - cron: "0 8,12,17 * * *"
      timezone: "America/Denver"   # 8am, noon, 5pm Mountain Time, DST-safe
  workflow_dispatch: {}             # manual trigger for debugging (recommended, not in CONTEXT.md but low-cost)

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: lts/*
      - name: Install scraper dependencies
        working-directory: ./scrapers
        run: npm ci
      - name: Install Playwright browsers   # only if the confirmed target page needs JS rendering
        working-directory: ./scrapers
        run: npx playwright install --with-deps chromium
      - name: Run scraper
        working-directory: ./scrapers
        run: npx tsx ballybet.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

`DATABASE_URL` must be added as a **repository secret** — this is the first GitHub Actions workflow in this repo (`.github/workflows/` does not yet exist), so there is no existing secret to reuse; it should be the same Neon connection string already in `.env.local` (per `.env.example`'s documented shape).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing for server-rendered promo pages | Regex-based text scraping | `cheerio` DOM queries | Regex-on-HTML is PITFALLS.md's explicitly-named technical-debt pattern; breaks silently on markup reshuffles that a `.find('.promo-card')`-style selector survives |
| Fuzzy team-name matching | A hand-rolled Levenshtein/edit-distance function, or a general fuzzy-string npm package | Curated per-sport alias table (small, bounded, hand-tested) | See "Matching & Confidence Scoring" above — the bounded domain makes a lookup table both simpler and structurally safer than fuzzy distance |
| DST-aware cron scheduling | A pair of hand-maintained UTC cron lines swapped twice a year, or in-script "is it currently MST or MDT" logic | GitHub Actions' native `timezone:` field (confirmed available, March 2026+) | Directly resolves D-07; the old manual-offset approach is now unnecessary complexity, not a best practice |
| Cap-binding stake optimization | A generic numeric optimizer/solver library | Closed-form kink-point derivation + small discrete-candidate search (same style as `arbMath.ts`) | `Profit(S)` is piecewise-linear with exactly one kink — this has an exact algebraic solution, no iterative optimizer needed; matches the project's existing "provably exhaustive over a small candidate set" discipline |
| Money/percentage math for boosts | Native JS floats | `decimal.js`, same local-precision-clone (`Decimal.clone({ precision: 40 })`) pattern already in `americanOdds.ts`/`bonusBet.ts`/`arbMath.ts` | CLAUDE.md "What NOT to Use" is explicit and unchanged this phase |

**Key insight:** every "don't hand-roll" item above already has a working sibling implementation in this codebase (`arbMath.ts` for candidate-search optimization, `marketFilter.ts` for pure-function domain filtering, `americanOdds.ts` for decimal precision) — this phase's domain code should read as a close cousin of Phase 1/01.1's code, not a new style.

## Common Pitfalls

### Pitfall 1: Assuming the promo marketing page is where single-game boosts live
**What goes wrong:** A scraper is built against a book's public `/promos` or `/promotions` URL on the assumption that it lists individual game boosts (e.g. "Broncos ML boosted to +150"), because that is what the phase's success criteria describe. This session's empirical probing found that URL shape consistently serves **sign-up-offer and loyalty-program content** instead, for every book checked (BetRivers: loyalty "Bonus Store"; Bally Bet: new-customer terms).
**Why it happens:** "Promotions page" is a natural first guess, and it does return real, fetchable content — so a scraper built against it looks like it's working (200 status, real HTML, some promo-shaped text) while actually harvesting the wrong kind of promo.
**How to avoid:** Before writing scraper selectors, a human should manually browse (logged out, real browser) the candidate book's site to find the actual page/component where single-game boosted odds render — this is very likely a per-sport or per-game hub page with inline boost badges next to specific lines, not a dedicated marketing "/promotions" route. Treat this as a required Wave 0 task, not a nice-to-have.
**Warning signs:** The scraper "succeeds" (200, non-empty parse) but every parsed promo is a new-customer sign-up offer or generic loyalty reward — D-15 already requires filtering these out, so a silent 100%-filtered-to-zero-kept scraper run could look identical to "no boosts today" rather than "wrong page."

### Pitfall 2: Treating Cloudflare's bot-management cookie as equivalent to Akamai/PerimeterX
**What goes wrong:** Seeing a bot-management cookie (`__cf_bm`, `_abck`) on any response and concluding all 7 books need the same anti-bot investment (stealth Playwright, or worse, proxies).
**Why it happens:** All the Kambi-platform books (BetRivers, Bally Bet, theScore Bet) sit behind Cloudflare and do set a `__cf_bm` cookie — but this session observed **no active challenge or block** from Cloudflare on any of these three, while DraftKings' Akamai and FanDuel's PerimeterX did produce concrete blocking evidence (403s, empty client-rendered state). Cookie presence alone doesn't mean active blocking is happening.
**How to avoid:** Judge posture by observed behavior (did the request succeed with real content, or get blocked/challenged), not by which vendor's cookie is present. The per-book table above already does this.
**Warning signs:** A plan that budgets equal stealth/proxy effort across all 7 books instead of concentrating effort on the 1-2 books actually chosen (D-06/D-09).

### Pitfall 3: Boost math accidentally reusing the bonus-bet formula
**What goes wrong:** Because both are "hedge a promo leg against a hedge leg," it's tempting to parameterize `calculateBonusBetHedge` with a "stake returned?" flag instead of writing a separate function.
**Why it happens:** PITFALLS.md Pitfall 2 flags exactly this trap for this exact codebase.
**How to avoid:** `profitBoost.ts` as its own module, per CONTEXT.md's own "Claude's Discretion" instruction ("next to `src/domain/hedge/bonusBet.ts`... following Phase 1's pure-engine convention").
**Warning signs:** Any new boolean parameter threaded through `bonusBet.ts` or a shared "generic hedge" function.

### Pitfall 4: Max-winnings cap interpretation asserted as fact instead of flagged as promo-text-dependent
**What goes wrong:** Locking in one formula for what "max winnings $X" means (delta-capped boost amount vs. total-payout cap) without verifying against the specific promo text format the chosen book actually uses — the two interpretations diverge in the stake-optimization kink point, producing a materially different "optimal stake" recommendation.
**Why it happens:** FEATURES.md's worked example assumes one interpretation; real promo fine print in the wild is not standardized across books.
**How to avoid:** Treat this as a fixture-driven decision (write both interpretations as candidate formulas, confirm against the actual chosen book's real promo text during Wave 0/1, lock via a known-answer test) rather than asserting either interpretation as settled research fact — see Assumptions Log.
**Warning signs:** A boost's displayed "optimal stake" doesn't match a hand-calculation against the promo's actual printed terms.

## Code Examples

### Boost stake-optimization candidate search (sketch, mirrors `arbMath.ts`'s discipline)
```typescript
// Source: this research, generalizing the existing pattern in
// src/domain/hedge/arbMath.ts (candidate-and-maximize over cent-rounded
// stakes) — not copied from an external source, no live reference exists.
const LocalDecimal = Decimal.clone({ precision: 40 });

function profitAt(S: Decimal, ObEff: Decimal, Oh: Decimal): Decimal {
  const H = clean(S.times(ObEff).dividedBy(Oh)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const payoutIfBoostWins = clean(S.times(ObEff)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const payoutIfHedgeWins = clean(H.times(Oh)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const netIfBoostWins = payoutIfBoostWins.minus(S).minus(H);
  const netIfHedgeWins = payoutIfHedgeWins.minus(S).minus(H);
  return Decimal.min(netIfBoostWins, netIfHedgeWins);
}

// Candidates: max-stake cap, the winnings-cap kink point (if any), each
// rounded up/down to the active precision — evaluate profitAt() on each,
// take the max, tie-break to the smaller stake (same tie-break rule as
// bonusBet.ts/arbMath.ts, for the same account-risk-minimizing reason).
```

### GitHub Actions cron with native timezone (D-07)
```yaml
# Source: github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/
on:
  schedule:
    - cron: "0 8,12,17 * * *"
      timezone: "America/Denver"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| GitHub Actions cron is UTC-only; maintain two hand-adjusted UTC cron lines per DST season, or run hourly and filter in-script | Native `timezone:` field on `on.schedule` cron entries, DST handled automatically | March 2026 `[VERIFIED: github.blog changelog]` | Directly and cleanly resolves D-07 — this project's own STACK.md (researched 2026-09-25) predates this feature and doesn't mention it; do not follow any pre-2026 blog post's "two cron lines" workaround advice found via a general web search |

**Deprecated/outdated:** the "GitHub Actions cron is always UTC" framing that appears in most existing blog posts and Stack Overflow answers about GitHub Actions scheduling is now out of date for this specific need — verify against the official changelog (linked above) if this is ever questioned during planning or review, since it directly contradicts widely-repeated older advice.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bally Bet's and BetRivers's specific `/co` and `/?page=promotions` URLs are the *wrong* pages for single-game boost data (based on absence of team names/boost percentages in the fetched HTML) | Scraping Feasibility by Book | If actually correct that no such page exists at all for these books (boosts only ever shown inline in the live odds board, not on any promotions-labeled page), the scraper target may need to be a per-sport/per-game hub page instead — different selectors, possibly different JS-rendering requirements than assumed |
| A2 | Max-winnings cap semantics ("delta-capped boost amount" vs. "total-payout cap") — this research presents both formulas but does not assert which one the eventually-chosen book actually uses in its fine print | Boost Stake Optimization Under Caps, Pitfall 4 | Wrong interpretation produces a mathematically-different "optimal stake" that still looks plausible (no crash, no obviously-wrong sign) — a subtle correctness bug in the exact domain (money math) this project treats as non-negotiable |
| A3 | theScore Bet's and Bally Bet's default anti-bot posture (Cloudflare, apparently not actively blocking plain HTTP this session) will hold up under a **repeated, scheduled** (3x/day, indefinitely) access pattern, not just a single one-off probe | Scraping Feasibility by Book | Cloudflare's bot-management can escalate its response based on request-pattern history (frequency, consistency) even if a single request sails through — a book that looks fine in a one-off check could start challenging or blocking after weeks of identical scheduled requests |
| A4 | Hard Rock Bet's live CO sportsbook app is reachable at some subdomain/path not identified this session (DNS resolution failed for the guessed `co.hardrockbet.com`) | Scraping Feasibility by Book | If Hard Rock Bet is actually unreachable/geofenced from outside a mobile app entirely, it should be dropped from D-06/D-09 consideration rather than left as a live candidate |

## Open Questions

1. **Where does each candidate book actually render single-game boosted odds?**
   - What we know: The generic "/promotions"-style marketing page returns real, fetchable content on Bally Bet and BetRivers, but that content is sign-up-offer/loyalty-program text, not per-game boost data.
   - What's unclear: Whether single-game boosts live on a different, not-yet-identified page (a sport/game hub with inline boost badges) or are simply not exposed on any logged-out page at all for these books.
   - Recommendation: Wave 0 human/visual reconnaissance task (real browser, logged out) on Bally Bet and BetRivers before writing any scraper selector code. If neither exposes single-game boosts logged-out, D-06's "at least one book must work this phase" may need to fall back to scraping **bonus-bet sign-up-style offers** that still qualify under D-15 (bonus-bet promos on a 2-way market), which this session's probing suggests *is* present in the fetched content (Bally Bet's "BONUS BETS" text), even if profit-boost-specific content isn't confirmed.

2. **Does BetMGM's app-route redirect (`/en/sports/promotions` → 302) lead somewhere scrapable, or is it a geo/device redirect?**
   - What we know: The blog URL loads without a JS challenge; the app route redirected and wasn't chased this session.
   - What's unclear: Destination and content of the redirect.
   - Recommendation: Low priority given BetRivers/Bally Bet are already stronger candidates — only worth chasing if both Kambi-platform books fail the Open Question 1 spike.

3. **What is Hard Rock Bet's actual Colorado sportsbook app domain?**
   - What we know: `hardrockbet.com`/`hardrock.bet` resolve to a marketing/SEO site; the guessed `co.hardrockbet.com` app subdomain doesn't resolve.
   - What's unclear: The real subdomain/path.
   - Recommendation: Low priority this phase (D-06 only needs one book to work); revisit opportunistically per D-06's "others added opportunistically."

4. **Max-winnings cap wording** — see Assumption A2. Recommendation: resolve empirically once real promo text from the chosen book is in hand (Wave 0/1), lock via a known-answer fixture, don't guess further in research.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `playwright` (npm, project-local) | Scraping any JS-rendered candidate book (theScore Bet confirmed; DraftKings/FanDuel if ever attempted) | ✗ (not yet installed in repo) | — | Install per "Standard Stack" above; no fallback needed, this is a first-time add, not a missing-tool blocker |
| `cheerio` (npm, project-local) | Scraping server-rendered candidate books (Bally Bet, BetRivers) | ✗ (not yet installed) | — | Same — first-time add |
| GitHub Actions `timezone:` cron field | D-07 scheduling | ✓ (platform feature, confirmed live via official changelog, no repo-side install needed) | Available since March 2026 | If for any reason this feature is unavailable in the actual execution environment, fall back to a single UTC-anchored cron accepting ~1hr seasonal drift (acceptable per D-07's "around 8am, noon, 5pm" phrasing) |
| `DATABASE_URL` as a GitHub Actions secret | Scraper writing to Neon from CI | ✗ (no `.github/workflows/` exists yet in this repo) | — | Must be added by whoever has repo admin access before the workflow can run; no code fallback — this is a one-time manual setup step to flag in the plan |
| Outbound HTTPS to sportsbook domains from GitHub Actions runners | All scraping | Presumed ✓ (GitHub-hosted runners have general internet egress; no book-specific IP-block evidence found this session) | — | If a book's WAF specifically blocks GitHub's runner IP ranges (a real possibility not testable from this sandboxed environment), the scraper would need a different execution environment — flag as a risk to watch during the first live CI run, not a blocker to plan around preemptively |

**Missing dependencies with no fallback:** `DATABASE_URL` GitHub Actions secret must be manually configured — no code-level workaround.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (already configured, `vitest.config.ts`) |
| Config file | `vitest.config.ts` (existing, no changes needed) |
| Quick run command | `npm run test -- src/domain/hedge/profitBoost.test.ts` (or `src/domain/promos/matcher.test.ts`) |
| Full suite command | `npm run test` (`vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALC-02 | Boost hedge stake/profit/ROI correct for both boost-% and boosted-price inputs | unit (known-answer fixtures, mirrors `bonusBet.test.ts`) | `npx vitest run src/domain/hedge/profitBoost.test.ts` | ❌ Wave 0/1 |
| CALC-03 | Optimal stake chosen correctly when max-stake and/or max-winnings caps bind | unit (fixture per cap-interaction scenario) | `npx vitest run src/domain/hedge/profitBoost.test.ts` | ❌ Wave 0/1 (same file as above) |
| PROMO-03 | Scraper writes at least one real promo row from a live scrape into `cached`/`promos` table | integration/manual — genuinely needs a live network call to a real sportsbook page, cannot be a pure fixture test | Manual `checkpoint:human-verify` run of the scraper script against the live target, verified by inspecting the resulting DB row | ❌ Wave 0/1 — needs the scraper script + a manual first-run verification step, same pattern as Phase 1's `odds:smoke` live checkpoint |
| PROMO-04 | A promo whose matcher signals aren't all true is excluded from hedge math and appears in the review queue; a below-threshold promo never contributes to a displayed guaranteed-profit figure | unit (matcher pure-fn fixtures: one fixture per signal failing alone, one all-pass) + integration (server action confirm/dismiss/flag round-trip) | `npx vitest run src/domain/promos/matcher.test.ts` | ❌ Wave 0/1 |

### Sampling Rate
- **Per task commit:** `npm run test -- <changed-file>.test.ts`
- **Per wave merge:** `npm run test` (full suite) + `npm run typecheck`
- **Phase gate:** Full suite green, plus the PROMO-03 live-scrape checkpoint, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/domain/hedge/profitBoost.test.ts` — covers CALC-02, CALC-03 (known-answer fixtures for both boost mechanics and both cap scenarios — no existing file to extend, net new)
- [ ] `src/domain/promos/matcher.test.ts` — covers PROMO-04 (one fixture per signal, mirrors `marketFilter.test.ts`'s pure-fixture style)
- [ ] Manual reconnaissance task (not a test file, but a required pre-implementation step) — locate each candidate book's real single-game-boost page before selectors are written (see Open Questions #1)
- [ ] `.github/workflows/scrape-promos.yml` — first workflow in this repo; no existing CI test coverage for the scraper's live-network path, first real run should be treated as the PROMO-03 checkpoint

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | `requireUser()` on every new server action (confirm/correct/dismiss/flag), same as Phase 2's established pattern |
| V3 Session Management | yes (existing, unchanged) | `iron-session`, already in place — no change needed this phase |
| V4 Access Control | yes | Any logged-in member can act on the queue (D-12) — no additional per-user restriction needed (matches the app's existing "small trusted group" model), but every action must still record `triggered_by_user_id`/attribution, not just succeed anonymously |
| V5 Input Validation | yes | Zod `safeParse` on every server action input (correction event/market selection, cap-entry form fields) — same shape as every existing action; scraped/parsed text must be Zod-validated before being trusted as a promo candidate, mirroring `OddsEventSchema.safeParse` in `getCachedEvents` |
| V6 Cryptography | no new surface | Unchanged — no new secrets/crypto introduced this phase beyond the existing `DATABASE_URL`/`ODDS_API_KEY`/`SESSION_SECRET` pattern, plus the new GH Actions `DATABASE_URL` secret (same value, different storage location) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/adversarial scraped HTML causing a parser hang (ReDoS) or a crash that takes down the whole scheduled run | Denial of Service | Prefer `cheerio`'s DOM API over hand-written regex on untrusted scraped text (see Don't Hand-Roll); wrap each book's scrape in its own try/catch so one book's malformed page can't prevent other books' runs or corrupt the shared `scrape_runs` status table (D-08 already requires per-book status, which naturally isolates this) |
| Scraped promo text used to construct a SQL query, file path, or shell command | Tampering / Elevation of Privilege | Drizzle's parameterized query builder (already the project's only DB access path) — never string-concatenate scraped text into raw SQL; there is no shell-command or file-path use case for scraped text in this phase's design |
| A malicious/compromised promo page returning content crafted to produce a false "certain" match (e.g. embedding text that happens to pass all 3 matcher signals for the wrong game) | Spoofing | The 3-signal gate already requires an *exact* alias-table + date + market match, not merely "looks plausible" — this is a narrow attack surface given the target is the book's own official domain (not user-submitted content) and D-11's flag-back safety net exists regardless |
| Storing sportsbook login credentials to reach personalized/higher-value promos | Elevation of Privilege / Information Disclosure | Explicitly out of scope (PROJECT.md, D-09: "Never log in, never store credentials") — this phase's scraper must only ever hit logged-out, public URLs |

## Sources

### Primary (HIGH confidence)
- `npm view <pkg> version` / `time.created` / `repository.url` for `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `cheerio` — live registry query, 2026-09-27
- `slopcheck scan --pkg npm <pkg> --json` for the same 4 packages — live tool run, 2026-09-27, all `status: OK`
- Live `curl` probes (headers + body) of `sportsbook.draftkings.com/promos`, `sportsbook.fanduel.com/promotions/`, `sports.betmgm.com/en/blog/promotions/`, `co.betrivers.com/?page=promotions`, `sportsbook.thescore.bet/promotions`, `www.ballybet.com/co`, and `hardrockbet.com` — this session, 2026-09-27
- https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/ — GitHub Actions native cron `timezone:` field, fetched and quoted directly this session
- `src/domain/hedge/bonusBet.ts`, `arbMath.ts`, `americanOdds.ts`, `marketFilter.ts`, `rankBonusBetHedges.ts`, `src/db/schema.ts`, `src/config/books.ts`, `src/db/queries.ts` — read directly this session (existing codebase, ground truth for extension patterns)
- `.planning/research/{SUMMARY,ARCHITECTURE,PITFALLS,FEATURES,STACK}.md` — project-level research, read directly this session

### Secondary (MEDIUM confidence)
- https://playwright.dev/docs/ci-intro — official Playwright GitHub Actions workflow shape (fetched this session; the doc itself doesn't specifically address cron-triggered vs. PR-triggered differences, so the cron-specific parts above are original composition, not a direct quote)
- WebSearch: "Kambi sportsbook platform BetRivers theScore Bet Bally Bet Hard Rock Bet white label" — confirms BetRivers and Bally Bet run on Kambi's platform; Hard Rock Bet has a Kambi *odds feed* deal (not confirmed as the full front-end platform); theScore Bet not confirmed on Kambi (multiple industry-press sources: covers.com, kambi.com press releases, legalsportsreport.com)

### Tertiary (LOW confidence)
- WebSearch snippets for exact promo-page URLs (used only to *locate* URLs to then directly probe with `curl` — every URL actually used in the feasibility table above was independently verified live, not trusted from the search snippet alone)
- General "DraftKings/FanDuel anti-bot" WebSearch results returned mostly promo-code marketing content, not technical detail — the anti-bot findings in this document rest on the live header/cookie evidence (Primary), not these search results

## Metadata

**Confidence breakdown:**
- Standard stack (boost math extension, scraper packages): HIGH — direct extension of already-verified in-repo code; new packages version-verified + slopcheck-clean this session
- Architecture (matching design, dedupe, cron scheduling): MEDIUM-HIGH — matching/dedupe design is a reasoned proposal (no reference architecture exists, per SUMMARY.md's own flag) but grounded in the codebase's existing pure-function discipline; cron scheduling is HIGH (direct official-source verification)
- Pitfalls / scraping feasibility: MEDIUM — grounded in this session's live empirical probing (a real step up from the prior phase's search-only research), but the central open question (where single-game boost data actually lives) is honestly unresolved, not just under-confident

**Research date:** 2026-09-27
**Valid until:** ~14 days for the anti-bot/scraping-feasibility findings (sportsbook page structures and anti-bot vendor configuration change without notice — re-verify immediately before Wave 0 if planning is delayed); ~30 days for the boost-math and GitHub Actions findings (stable, standards-based)
