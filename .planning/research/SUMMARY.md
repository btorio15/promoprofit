# Project Research Summary

**Project:** PromoProfit
**Domain:** Sportsbook promo-conversion / hedge calculator (private web dashboard, Colorado)
**Researched:** 2026-09-25
**Confidence:** MEDIUM-HIGH

## Executive Summary

PromoProfit is a small, private-group tool that converts sportsbook bonus bets and profit boosts into locked-in cash profit by computing an exact opposing hedge stake across the user's other books. Research across four domains (stack, features, architecture, pitfalls) converges on the same shape: this is not a real-time trading system, it is a **correctness-first, quota-constrained calculator**. Every architectural and technology recommendation traces back to two hard constraints already stated in PROJECT.md — The Odds API's ~500 credit/month free tier, and the requirement that stake/profit math be exact every time. Competitor research confirms the core mechanic (bonus-bet and profit-boost hedge math) is well-established and formula-verifiable against published third-party examples (OddsJam, Betstamp, DarkHorse Odds), so the math itself is low-risk; the risk is entirely in the supporting plumbing — odds sourcing, event matching, and promo capture.

The recommended approach is a Next.js/TypeScript full-stack app (Vercel Hobby) backed by Postgres (Neon free tier) via Drizzle ORM, with a pure, zero-I/O hedge-calculation core (decimal.js, not floats) tested against known-answer fixtures. Odds come from The Odds API fetched on-demand and cached aggressively (never polled), with a two-tier bulk-vs-per-event fetch strategy to protect the quota. Promo discovery is hybrid: a dropdown-first manual-entry form (matched to canonical events via the API's free `/events` endpoint) is the primary, always-reliable path; Playwright-based scraping of public, unauthenticated promo pages is a best-effort supplement only, routed through a human-confirmation queue before anything is trusted. Auth is a lightweight iron-session + manually-seeded user table — no OAuth needed for a 3-5 person private group.

The dominant risk theme across all four research files is **silent wrong-math and silent wrong-matching** — the two highest-value correctness guards are (1) never sharing a single calculation path between bonus-bet (stake-not-returned) and profit-boost (stake-returned) promos, and (2) never auto-trusting a fuzzy event match without human confirmation. The secondary risk theme is **quota exhaustion** — every "fetch odds" call site must be evaluated against the credit-cost formula (`markets × regions`, or `markets × regions × events` for per-event calls) before shipping, since a naive polling or per-render fetch pattern burns the free tier in hours to days. A tertiary, non-technical risk (Pitfall 9) is worth carrying into the roadmap explicitly: the tool's entire purpose — precise, promo-only, repeatable hedge stakes — is exactly the behavioral fingerprint sportsbook risk teams use to limit accounts, so the product should carry a lightweight advisory rather than pretend this tradeoff doesn't exist.

## Key Findings

### Recommended Stack

Next.js (App Router, TypeScript) on Vercel Hobby, with Postgres via Neon (free tier) and Drizzle ORM, is recommended as the single full-stack deployable for a small private dashboard. The Odds API is the recommended odds source (credit-cost = markets × regions per call; free tier ~500 credits/month, no bookmaker-count limit but coverage differs "most" vs "all" bookmakers between free and paid tiers per their own pricing language — see Open Conflicts below). Playwright is recommended only for best-effort scraping of public promo pages, run from a scheduled GitHub Actions job (not Vercel Cron, which is capped at once/day on Hobby) — never from a request-time function. decimal.js is mandated for all stake/profit math; native JS floats are explicitly disallowed. Auth is iron-session + a manually-seeded users table, not a full auth framework.

**Core technologies:**
- Next.js 16.x (App Router) + TypeScript 5.7+ — single deployable UI + API routes, best AI/community coverage for a solo/small-group build
- Drizzle ORM + Postgres (Neon free tier) — lightweight, serverless-friendly, avoids Prisma's paid-proxy requirement on edge/serverless
- The Odds API — verified credit-cost mechanics and free `/events`/`/sports` endpoints; industry-standard for this niche
- decimal.js + Zod — exact decimal math for money, runtime validation of API responses and manual-entry forms
- iron-session — stateless, encrypted-cookie auth sized correctly for a 3-5 person invite-only tool

### Expected Features

Competitor landscape (OddsJam, DarkHorse Odds, Betstamp, Action Network) confirms bonus-bet and profit-boost hedge calculators with exact stake output and a headline guaranteed-profit/conversion-% figure are non-negotiable table stakes; no surveyed competitor combines this project's specific differentiator (a private multi-user dashboard with per-user book filtering plus hybrid scrape+manual promo discovery) in one lightweight package — DarkHorse Odds comes closest but is a broad, single-tenant paid SaaS.

**Must have (table stakes):**
- Bonus bet hedge calculator (stake-not-returned math) with conversion % output
- Profit boost hedge calculator (boost-to-profit and boosted-price inputs, max-stake/max-winnings cap handling) with ROI % output
- Exact stake output for both legs; best-line/cheapest-hedge finder across the user's selected books
- On-demand, cached odds fetch (hard dependency of both calculators)
- Opportunities view: ranked list of current promos by guaranteed profit, filtered to viewer's books
- Book-selection filter per user; private multi-user dashboard access

**Should have (competitive differentiators):**
- Hybrid promo discovery (manual entry as guaranteed-complete baseline, scraping as opportunistic supplement)
- Per-user book filtering inside one shared dashboard (no competitor offers this combination)
- Deliberately narrow scope (2 promo types, CO only, sportsbooks only) as a trust/simplicity advantage

**Defer (v2+):**
- Full per-user bet history/bankroll tracking, second-chance/deposit-match promo types, alerts (Discord/Telegram/SMS), multi-state support, exchange/prediction-market venues, automatic bet placement — all explicitly out of scope per PROJECT.md and confirmed as reasonable deferrals by feature research

### Architecture Approach

The system is organized around one governing constraint (API quota, not user load) and one governing value (mathematical correctness). Ingestion (odds, promos, matching) is split into independently-failing subsystems; a normalization layer maps both promo and odds data into one canonical schema; a pure, zero-I/O hedge-calculation engine consumes only clean data and is unit-tested against fixtures; ranking is computed at read time (never persisted, since stored profit figures go stale as odds move) and filtered by user book preferences before display.

**Major components:**
1. Odds Ingestion Layer — two-tier (bulk vs per-event) Odds API client with quota tracking (`x-requests-remaining` headers) and TTL caching; free `/events`/`/sports` calls used liberally for matching
2. Promo Ingestion (scrapers + manual entry) + Event/Market Matcher — manual entry is dropdown-first (avoids fuzzy matching entirely); anything not dropdown-matched routes through a human-confirmation queue before it's trusted
3. Hedge Optimization Engine — pure functions (bonus-bet solver, boost solver), zero I/O, fixture-tested, kept fully decoupled from DB/API layers
4. Opportunity Ranking + Web Dashboard — computed at read time from promo + cached odds + book preferences, never stored as a stale derived value

### Critical Pitfalls

1. **Bonus-bet math treated as stake-returned** — implement bonus-bet hedge math (`H = B×(Ob−1)/Oh`) as its own explicit formula, never a parameterized variant of the boost formula; unit-test against published conversion-rate benchmarks (~70-80% at longshot legs).
2. **Profit boosts and bonus bets sharing one calculation path** — model promo type as a first-class discriminator with two distinct, independently-tested math modules from day one.
3. **Odds API free-tier budget silently exhausted** — cache aggressively, fetch only on user action (never poll), request only the specific market/region needed, track `x-requests-remaining` and degrade gracefully (stale-cache badge) rather than erroring.
4. **Event/market mismatch across books** — normalize team names/markets through a canonical mapping table and require human confirmation for any match not made via direct dropdown selection; a silent mismatch produces confidently-wrong stakes.
5. **Push/void outcomes ignored** — whole-number spread/total hedges can push; flag push risk explicitly and show worst-case, not just a single "guaranteed profit" figure, when a push is mathematically possible.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Core Hedge-Math Engine
**Rationale:** This is the entire correctness-critical core of the product and has zero external dependencies (pure functions over plain data) — build and prove it before anything else touches it, per architecture and pitfalls research.
**Delivers:** Bonus-bet solver and profit-boost solver (both mechanics: boost-to-profit and boosted-price) as separate, fixture-tested TypeScript modules using decimal.js; max-stake/max-winnings cap clamping; push/void risk flagging.
**Addresses:** Bonus bet hedge calculator, profit boost hedge calculator (FEATURES.md table stakes)
**Avoids:** Pitfalls 1, 2, 6, 7 (stake-returned confusion, shared-formula bugs, push/void blindness, cap/rounding errors)

### Phase 2: Odds Ingestion + Quota-Safe Caching
**Rationale:** Both calculators are non-functional without real hedge-side odds; this is the second hard dependency and the one place a naive implementation can silently break the entire free-tier budget, so it needs to be built deliberately, not bolted on.
**Delivers:** The Odds API client with quota tracking, TTL-based Postgres cache, two-tier bulk vs per-event fetch strategy, "odds as of" timestamping.
**Uses:** The Odds API, Neon Postgres, Drizzle ORM (STACK.md)
**Implements:** Odds Ingestion Layer, quota-aware caching pattern (ARCHITECTURE.md Pattern 4)
**Avoids:** Pitfalls 3, 4 (quota exhaustion, stale odds trusted as live)

### Phase 3: Promo Capture — Manual Entry + Event Matching
**Rationale:** Manual entry is the guaranteed-complete path and should ship before scraping; it also exercises the event-matching layer that both promo sources will share.
**Delivers:** Dropdown-first manual promo entry form (book, type, amount/boost %, market, caps, expiration) matched to canonical Odds API events via the free `/events` endpoint; human-confirmation queue for anything not directly dropdown-matched.
**Addresses:** Hybrid promo discovery — manual entry path (FEATURES.md, PROJECT.md)
**Avoids:** Pitfall 5 (event/market mismatch), Anti-Pattern 2 (auto-trusting fuzzy matches)

### Phase 4: Opportunities View + Book-Selection Filter + Private Dashboard
**Rationale:** With the math, odds, and promo data flowing, the remaining work is presentation and per-user filtering — this is where the project's actual differentiator (private multi-user dashboard with per-user book filtering) is realized.
**Delivers:** Auth-gated dashboard (iron-session), per-user book-selection preference applied consistently to both promo side and hedge side, ranked opportunities list computed at read time, staleness/push/account-risk advisory messaging.
**Addresses:** Book-selection filter, opportunities view, private dashboard access (FEATURES.md P1)
**Avoids:** Pitfall 9 (account-detection advisory), UX Pitfalls around missing freshness/risk context

### Phase 5 (optional, post-validation): Promo Scraping Supplement
**Rationale:** Scraping is explicitly lower-priority than manual entry per all four research files; only invest here once the core loop (Phases 1-4) is validated with real usage and a specific book's manual-entry burden justifies automation.
**Delivers:** Playwright scraper(s) for public, unauthenticated promo pages only, run via scheduled GitHub Actions, feeding the same pending-review queue as ambiguous manual entries.
**Avoids:** Pitfall 8 (ToS violations, credential storage, anti-bot escalation) — scope explicitly limited to public pages, no stored sportsbook credentials

### Phase Ordering Rationale

- Hedge math has no dependencies and is the highest-risk-if-wrong component — it comes first so every later phase can build against a proven, tested core.
- Odds ingestion must exist before either calculator can produce a real (non-fixture) result, and its quota-safety design cannot be retrofitted cheaply — it comes second, before UI work that would otherwise be tempted to fetch odds naively.
- Manual promo entry is prioritized over scraping in every research file (STACK, FEATURES, ARCHITECTURE, PITFALLS all independently converge on this) because scraping is explicitly brittle/best-effort and manual entry is the only path guaranteed to work on day one.
- The dashboard/filtering phase comes last because it is presentation over already-correct, already-fetched, already-captured data — sequencing it last avoids building UI against unstable math or unbounded odds-fetch patterns.
- Scraping is deliberately deferred past the validated core loop, consistent with FEATURES.md's "Add After Validation" tier and STACK.md's scraping-feasibility assessment (LOW-to-MEDIUM feasibility for automated, unattended scraping).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Odds Ingestion):** Needs a live API call against The Odds API before finalizing which Colorado bookmaker keys are actually free-tier-accessible (see Open Conflicts below) — STACK.md and FEATURES.md disagree on Caesars/Fanatics tier placement, and the ESPN Bet → theScore Bet key rename needs live confirmation.
- **Phase 3 (Promo Capture / Event Matching):** The fuzzy-matching/normalization layer has no single authoritative reference architecture (ARCHITECTURE.md notes this explicitly) — worth a focused spike on team-name alias tables against the actual CO book list before committing to a matching approach.
- **Phase 5 (Scraping):** Feasibility is genuinely uncertain per-book (anti-bot posture varies); research per target book as this phase is planned, not upfront.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Hedge Math):** Formulas are verified against multiple independent, cross-checked sources (OddsJam, Betstamp, Smarkets) with matching worked examples — implement directly from PITFALLS.md/FEATURES.md's documented formulas.
- **Phase 4 (Dashboard/Auth/Filtering):** Standard CRUD + session-auth patterns, well-documented in STACK.md/ARCHITECTURE.md; no novel domain risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Framework/library versions and Odds API credit mechanics verified against official docs/npm; Colorado-specific bookmaker-key roster and free-vs-paid tier boundaries are MEDIUM/LOW and explicitly flagged for live verification |
| Features | MEDIUM-HIGH | Hedge-math formulas independently verified and arithmetically reproduce published worked examples (HIGH); competitor UI/feature-list details reconstructed from search snippets after several 403s (MEDIUM) |
| Architecture | MEDIUM-HIGH | Odds API mechanics/quota model HIGH confidence (official docs); overall matching+promo pipeline design is synthesized from domain patterns since no single authoritative "matched-betting app architecture" reference exists (MEDIUM) |
| Pitfalls | MEDIUM-HIGH | Hedge-math and odds-API pitfalls verified against multiple matched-betting/API-docs sources (HIGH-MEDIUM); account-limiting detection signals are community-sourced (MEDIUM/LOW); Colorado regulatory pitfall (HB25-1311) verified against news coverage of signed legislation (HIGH) |

**Overall confidence:** MEDIUM-HIGH — the math and core architecture are solid; the Colorado-specific bookmaker/API-coverage details need one live verification pass before Phase 2 is built.

### Gaps to Address

- **Odds API live bookmaker coverage for Colorado** — STACK.md and FEATURES.md draw somewhat different conclusions about which CO books are free-tier-accessible (see Open Conflicts below). Resolve with one real `/sports/{sport}/odds` call before finalizing the book-selection UI in Phase 2/4.
- **Official Colorado operator list** — the state's own gaming site (sbg.colorado.gov) returned HTTP 403 to automated fetch in both STACK and FEATURES research passes; the current book list (DraftKings, FanDuel, BetMGM, Caesars, bet365, Fanatics, BetRivers, theScore Bet, Bally Bet, BetMonarch, Circa Sports, SBK Sportsbook, Hard Rock Bet) is triangulated from third-party trackers only — worth a manual spot-check before Phase 3/4, and should be stored as configuration data (per Pitfall 10) so it can be corrected without a code change.
- **Regulatory drift (HB25-1311)** — Colorado's July 2026 change to free-bet promo tax treatment may reduce future promo volume/generosity; don't build features (e.g., "browse all-time promo history") that assume ever-growing promo supply. Revisit each milestone, not just at project start.
- **Push/void UX design** — pitfalls research flags this as commonly skipped and hard to retrofit; needs a concrete UI decision (e.g., dual best-case/worst-case display) made during Phase 1 design, not left as a TODO.

## Open Conflicts / To Verify

These are direct discrepancies (or apparent discrepancies) between the four research files that should be resolved with a live API check early in Phase 2, before the book-selection UI is built:

1. **Caesars (`williamhill_us`) and Fanatics — free vs. paid tier.** STACK.md's bookmaker table lists both under the `us` region (implying availability) but its own free-tier description notes bookmaker coverage is "most bookmakers" on free vs. "all bookmakers" on paid, per The Odds API's pricing page — i.e., STACK.md does not actually claim these two are free-tier-included, it just maps them to the `us` region key. FEATURES.md states more directly that `williamhill_us` and `fanatics` are "reported as paid-subscription-only" despite being live CO books. **These are not necessarily contradictory** — a bookmaker can have a defined region key in the docs while still being gated to paid plans for actual data access. Resolve by making one real `/sports/{sport}/odds?apiKey=<free-tier-key>&regions=us` call during Phase 2 setup and checking whether `williamhill_us`/`fanatics` odds are actually returned. If they're paid-only, add them to the "manual odds entry required" book list alongside bet365/Circa/SBK/BetMonarch (see #3).
2. **ESPN Bet vs. theScore Bet.** STACK.md and FEATURES.md are consistent here, not conflicting: ESPN Bet rebranded to theScore Bet effective December 1, 2025 after Penn Entertainment and ESPN ended their partnership, and theScore Bet is confirmed live in Colorado post-rebrand. PROJECT.md's original book list (which names "ESPN Bet") is simply out of date and should be updated to "theScore Bet" as the live successor brand. One open technical detail: The Odds API's bookmaker *key* for this book may still read `espnbet` internally even though the product is now branded theScore Bet — verify the live key name via API call in Phase 2 before wiring the book-selection UI, so the UI can display "theScore Bet" while the backend still queries the (possibly still-named) `espnbet` key.
3. **bet365, Circa Sports, SBK Sportsbook, BetMonarch — no API coverage.** All three research files agree these Colorado-legal books are not present in The Odds API's documented US bookmaker list. This is not a conflict to resolve but a product decision to make explicit: these books must be flagged in the data model as "manual odds entry required" rather than "API-sourced," and any user who selects one of these books in their book preferences should see odds-entry UI (not an automatic hedge search) for hedges involving that book. This reinforces — rather than undermines — the project's existing decision to treat manual entry as a first-class, not fallback-only, path (PROJECT.md Key Decisions).

## Sources

### Primary (HIGH confidence)
- https://the-odds-api.com/liveapi/guides/v4/ — credit-cost formula, free `/sports`/`/events` endpoints
- https://the-odds-api.com/#get-access, https://the-odds-api.com/manage/faqs.html — free tier terms, credit reset timing
- https://the-odds-api.com/guide/rate-limit.html — quota exhaustion behavior (401/429), rate limits
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — Hobby plan cron limits
- npm registry (registry.npmjs.org) — verified current package versions (next, drizzle-orm, playwright, iron-session, etc.)
- Colorado Politics / NPR coverage of HB25-1311 (signed 2026) — free-bet tax deduction change effective July 2026

### Secondary (MEDIUM confidence)
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html — US region bookmaker keys (docs snapshot, live roster needs re-verification)
- OddsJam, Betstamp, DarkHorse Odds, Action Network product pages — competitor feature landscape and worked hedge-math examples (arithmetically reproduced/verified)
- LegalSportsReport, OddsAssist, RotoWire, SportsHandle — Colorado sportsbook operator list (triangulated; official state source returned HTTP 403)
- matchedbets.com, OddsMonkey, SharkBetting, ClawArbs — account-limiting/gubbing detection signals
- WebSearch aggregation — ESPN Bet → theScore Bet rebrand confirmation (multiple industry-press sources)

### Tertiary (LOW confidence)
- Competitor free-tier/bookmaker-count marketing claims (OddsJam, SportsGameOdds, OddsPapi, SharpAPI) — sourced from competitors' own SEO/marketing content, not verified against live docs; only relevant if switching odds providers
- Free-tier RPS limit claims from third-party comparison sites — inconsistent with official docs, treated as unreliable

---
*Research completed: 2026-09-25*
*Ready for roadmap: yes*
