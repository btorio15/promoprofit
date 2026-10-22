# Research Summary — v1.2 Intro Offers & No-Sweat

**Researched:** 2026-10-22 · **Overall confidence:** MEDIUM · Sources: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (this folder)

## Executive Summary

v1.2 needs no new runtime library. The no-sweat bet (NSB) hedge is one linear equation solved in decimal.js with the same floor/ceil cent search as `bonusBet.ts`: with stake S at decimal odds Oa, refund R = min(S, cap) paid as a bonus bet valued at the finder's live conversion rate v, and hedge odds Oh, the equal-outcome hedge is `H = (S·Oa − v·R) / Oh` and profit `= S·(Oa − 1) − H`. Profit is linear in v, so it is always an **estimate**; show the floor (v = 0) too.

The real risks are integration risks: estimated profit leaking into guaranteed totals, the reader misclassifying NSB as a bonus bet (happened 2026-10-08), a `profit_boost ? boost : bonus` ternary in `rankPromoHedges.ts` that would silently price a new promo type as a bonus bet, scrapers that hit block pages / return empty and expire good promos, and untested datacenter-IP reachability for every new book.

## Resolved conflicts

- **NSB wording:** always "Estimated"; show the rate used and the floor. Never "guaranteed" (owner decision).
- **NSB placement in the feed:** its own section / source (`nosweat`), not interleaved with guaranteed items.
- **Scraper feasibility:** live probes on 2026-10-22 (residential CO IP) override old recon notes:
  - Hard Rock Bet — HIGH: public JSON CMS feed `api.hardrocksportsbook.com/cms/v2/carousels/COLORADO_ONLINE/NATIVE/sbk.home` (old "DNS failure" was a wrong host).
  - BetMGM — MEDIUM: server-rendered marketing HTML `sports.betmgm.com/en/blog/betmgm-state-promos/colorado-sportsbook/` through the Haiku reader; terms incomplete.
  - BetRivers, theScore Bet — LOW (no amounts / auth-gated) → manual entry.
  - Caesars, Fanatics — blocked (CloudFront / Imperva / Akamai 403) → manual entry.
- **Hard Rock offer structure:** live feed wins over affiliate pages — $5 qualifying bet, odds −500 or longer, up to $500 in No Sweat Bets as 10 daily tokens up to $50, refunded as bonus bets.
- **Caesars / Fanatics pricing:** their odds are paid-tier only, so offers can be entered but not priced exactly → "can't price" tail with the headline only. No invented odds, no fixed rate.
- **Scraper contract:** no Playwright, stealth or proxies (D-09); only `BookScraper.sourceFormat` widens to `"json" | "html"`.
- **Out of scope:** bet365 (no odds), deposit-match; Fanatics FanCash informational only.

## Open owner decisions

1. **Conversion statistic:** finder's top-1 (owner's stated choice; risk of winner's curse) vs a conservative statistic (median of top N). Default top-1 behind one injected function; confirm at the start of the NSB math phase.
2. **"Can't price" tail** for Caesars / Fanatics: accept headline-only display.

## Key findings

**Stack:** no new dependencies (`node-html-parser` optional only if a tag-strip helper is too fragile). Register new scrapers in `books/index.ts`, `SCRAPE_TARGET_BOOK_KEYS`, `SIGNUP_PAGE_URLS`; extend `signupOffers.ts` to accept directly parsed intro offers.

**Features — must have:** exact NSB solver (cap, min odds, both branches, floor); refund valued at the live rate with no fixed fallback; qualifying-line search ranked by estimated profit; NSB promos in the feed as labelled estimates; structured intro-offer fields (kind, stake, min odds, refund cap/kind, installments, requires-win, expiry); bet & get valuation separating win-only from win-or-lose with installments as N conversions; ranked Sign-up screen with exact line, hedge book, stakes and a pointer to the finder for converting the bonus; manual add for no-sweat promos and intro offers.
**Differentiators:** sensitivity range, whole-plan view, optional stake budget. **Deferred:** sign-up + held-book pairing, profit-per-day ranking, FanCash valuation, NSB in tandem pairs.

**Architecture:** `promo_type` is plain text (no enum migration); one additive nullable migration for refund fields on `promos` and intro-offer columns on `signup_offers`; conversion rate injected as `conversionRateFor(bookKey)`, memoized per request, 0 credits; NSB excluded from singles, recorders, Dashboard totals, the profit graph, Statistics and pairing; new-customer NSB → Sign-up offers, existing-customer NSB → feed; bump `PROMO_READER_PROMPT_VERSION`; convert binary promo-type branches (~60 files) to exhaustive switches. Teammate migrates directly — fetch and check numbering before adding a migration.

**Pitfalls:** estimates leaking into guaranteed aggregates (certainty discriminator + tests); NSB math (cap vs stake, refund is a bonus bet, min odds hard filter, pushes/voids pay no refund, profit from rounded stakes — fixtures + brute-force oracle); reader misclassification (regex pre-classifier, disagreements to review, 2026-10-08 regression fixture, clear reader cache); silent block pages (content signature, expire only after 2 empty runs, reject non-CO terms, alarm on Hard Rock 0 items); intro-offer terms (installments with per-piece expiry, one per person, KYC, demote "terms unclear"); NSB Mark done records the actual result, not the estimate; stronger "one chance per book" account-risk copy; Odds API credits must not grow (cached moneylines only).

## Suggested phase structure

1. **NSB math and conversion rate** — pure `noSweat.ts` + conversion-rate function, fixtures, oracle, Hard Rock worked example. Settle the conversion statistic.
2. **Types, schema and feed** — `no_sweat` promo type, exhaustive switches, additive migration, separate "Estimated" feed section, aggregate-exclusion tests, manual add, Mark done flow for NSB.
3. **Reader and ingestion (existing books)** — exclusions, reader kind + prompt version, reconcile/guard, regex pre-classifier, DK/FD/Bally NSB parsing; gates NSB visibility in the feed.
4. **Intro offers ranked** — structured extraction, `rankIntroOffers` (NSB first bet + bet & get qualifying-line optimizer), Sign-up screen rewrite, can't-price tail, terms-unclear demotion, one-chance warning.
5. **New-book scrapers** — Hard Rock JSON, then BetMGM HTML, then manual-entry seeding for BetRivers, theScore, Caesars, Fanatics; each needs a real GitHub Actions run before done.
6. **Integration verification** — guaranteed surfaces unchanged, odds age on NSB cards, NSB Mark done, dedupe across surfaces. (Fewer phases: merge 1→2 and 6→5.)

## Gaps

Datacenter-IP reachability untested for every new book; credit budget to confirm on paper; BetMGM headline conflicts across sources (extract only what the page states); voids/pushes excluded from the refund branch; NSB Mark done flow.
