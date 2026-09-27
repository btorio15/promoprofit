# Phase 3: Promo Scraping & Review - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers three things (CALC-02, CALC-03, PROMO-03, PROMO-04):

1. **Profit-boost hedge math.** It works from either a boost % applied to profit or a book-published boosted price. It gives exact stakes, guaranteed profit and ROI % on cash risked, and it respects max-stake and max-winnings caps, choosing the best stake when a cap limits it.
2. **A scheduled GitHub Actions scraper.** It reads public, no-login promo pages for at least one Colorado book and adds the promos it finds automatically.
3. **A review queue.** Any scraped promo whose event or market match isn't certain waits there. Members confirm, correct or dismiss it before it's used in hedge math.

The hedges this produces show up on a new **Promos** tab.

Not in this phase:
- The opportunities feed and its sorting across promos, plus tandem/competing-promo hedges (Phase 4: DASH-01, DASH-03, DASH-05, CALC-07).
- Group-added (manual) promos and editing or deleting them (Phase 5: PROMO-01, -02, -05).
- Parlay, same-game-parlay and prop boosts.
- Deposit and sign-up offers.
- Authenticated scraping.

</domain>

<decisions>
## Implementation Decisions

### Boost math & where it shows
- **D-01:** Scraped promos and their computed hedges appear on a **new top-level "Promos" tab**, a third tab after **Bonus bets | Arbitrage** that shares the same status bar. Each active promo shows its best hedge book, both stakes, guaranteed profit and ROI %. Phase 4 grows this tab into the opportunities feed rather than replacing it.
- **D-02:** A boost hedge uses the **stake that maximizes guaranteed profit within the promo's caps**. That is usually the max stake, or less when the max-winnings cap binds. The stake is **shown, not editable**.
- **D-03:** When a book shows a **boosted price, the math uses it**, because books round their own boosted odds. The app works out the boosted price from the boost % and current odds **only when no boosted price is shown**.
- **D-04:** A boost **may be hedged at the same book** that offered it. Such rows get the existing **"Same book"** badge, as in the finder (Phase 1 D-17 and Phase 2 D-15).
- **D-05 (carried):** Hedge books are limited to the **user's selected books** among the 7 API-covered books (Phase 2 D-10/D-14). Only 2-way markets with no push qualify: moneylines, half-point spreads and half-point totals (CALC-05). Stake rounding follows the existing precision setting: whole dollars by default, exact cents as an option (01.1 D-02). The shared RiskAdvisory appears on this tab too (CALC-06).

### Scraping targets & schedule
- **D-06:** **Research picks the first book.** It chooses the most feasible public, no-login promo page among the 7 covered books, judged on reachability and anti-bot posture. At least one book must work this phase. Others are added opportunistically.
- **D-07:** The scraper runs **a few times a day** on a GitHub Actions `on: schedule` cron. Research proposes exact times that match when books post daily promos, for example around 8am, noon and 5pm Mountain Time; cron runs in UTC, so convert. The scraper writes straight to Neon Postgres, and scraping spends no Odds API credits.
- **D-08:** A failed run (blocked, layout changed, or zero promos parsed) **stores a per-book last-run status**. The Promos tab shows it, for example "DraftKings promos updated 3h ago · last run failed". Promos that already exist **stay until they expire** and are not wiped by a failed run.
- **D-09:** **Anti-bot tooling:** the `playwright-extra` stealth plugin is **allowed**. **No paid or residential proxies.** Whether to use stealth, or to skip a book, is decided **book by book after research reports** each book's defences. The owner wants to review that together, so research must report per-book posture and not quietly pick an approach. Never log in, never store credentials (PROJECT.md).

### Match certainty & review queue
- **D-10:** Matching uses a **confidence score with a strict auto-accept threshold**. A promo above the threshold goes live automatically. Anything below it goes to the review queue and is left out of hedge math until confirmed (success criterion 4). Research proposes the threshold and **tunes it on real scraped samples** against cached Odds API events: team aliases, start time and market/side.
- **D-11:** Auto-matched promos carry a visible **"Auto-matched"** tag. **Any member can flag one**, which pulls it out of hedge math and sends it back to the review queue. This is the safety net against ARCHITECTURE.md Anti-Pattern 2 (auto-trusting fuzzy matches).
- **D-12:** **Any logged-in member** can confirm, correct or dismiss a queued promo. The app **records who did it**, following the "Refreshed by" attribution pattern from Phase 2 D-21.
- **D-13:** The queue is a **"Needs review (N)" section inside the Promos tab**, above the active promos, with actions inline. There is no separate route.
- **D-14:** Reviewer actions:
  - **Confirm** the suggested match.
  - **Correct** it by picking the right event and market/side from cached games. Picking from a dropdown follows ARCHITECTURE.md Pattern 1.
  - **Dismiss** it, for example a boost we can't hedge. A dismissed promo is **not re-queued** by later scrapes of the same promo.

### Scraped promo lifecycle
- **D-15:** Keep only **single-game promos on a 2-way market we can hedge**: profit boosts **and** bonus-bet offers on a moneyline or half-point spread/total. Skip parlay, same-game-parlay, prop, deposit and sign-up offers.
- **D-16:** A promo **expires**, and drops off the Promos tab, at whichever comes first:
  - it no longer appears on a later **successful** scrape of that book;
  - its stated expiry;
  - the game's start time.
  A failed run does not expire anything (D-08).
- **D-17:** Fine print:
  - **Max stake, max winnings and minimum odds** are parsed into structured fields that the math uses (CALC-03).
  - Other terms, such as opt-in required or eligibility, are kept and **shown as a short note** on the promo row.
- **D-18:** A boost whose **cap can't be parsed goes to the review queue**, where a member enters it. The math never guesses a cap.
- **D-19:** The same promo seen across runs is **deduplicated**, not inserted again. Dismissals (D-14) and confirmations persist across runs.

### Claude's Discretion
- How promos are stored: the promo table shape, per-book scrape-run status table, alias table, and the key used for dedupe.
- The confidence-scoring method and features. The strictness is the user's call (D-10/D-11); the method is not.
- Promos tab row layout and sorting, reusing the compact expandable row pattern from the finder and Arbitrage tab. Bonus-bet promos show conversion %, boosts show ROI %.
- The boost formula implementation as pure decimal.js functions next to `src/domain/hedge/bonusBet.ts`, following Phase 1's pure-engine convention, with known-answer tests correct to the cent.
- Scraper code layout, as a separate script and workspace run by Actions and not bundled into Next.js (CLAUDE.md), and how scraped text is parsed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Boost math
- `.planning/research/FEATURES.md` §2 "Profit boost / odds boost hedge": boost formulas and worked examples.
- `.planning/research/PITFALLS.md` Pitfall 2: boosts and bonus bets need different formulas. Pitfall 7: caps, minimums and stake increments.
- `src/domain/hedge/bonusBet.ts`, `src/domain/hedge/americanOdds.ts`, `src/domain/hedge/arbMath.ts`: the existing pure decimal.js engine to extend.

### Matching & review
- `.planning/research/ARCHITECTURE.md` Pattern 1 (dropdown-first entry), Pattern 3 (human-confirmed matching), Anti-Pattern 2 (auto-trusting fuzzy matches), and "Promo → Opportunity Flow".
- `.planning/research/PITFALLS.md` Pitfall 5: event and market mismatch across books.
- `.planning/research/SUMMARY.md` "Research Flags": no reference architecture for matching. It recommends a spike on team-name aliases against the real Colorado book list.

### Scraping
- `.planning/research/PITFALLS.md` Pitfall 8: ToS, anti-bot and credential risks.
- `.planning/research/STACK.md`: Playwright feasibility, and GitHub Actions scheduling instead of Vercel Cron.
- `CLAUDE.md`: "Scraping: Playwright — feasibility assessment" and "Hosting & Scheduled Jobs".

### Account risk
- `.planning/research/PITFALLS.md` Pitfall 9: precise stakes can get accounts limited. The advisory is already built in `src/components/RiskAdvisory.tsx`.

### Prior phase decisions
- `.planning/phases/01-bonus-bet-finder/01-CONTEXT.md`: pure engine, compact rows, same-book badge.
- `.planning/phases/01.1-arbitrage-tab/01.1-CONTEXT.md`: precision toggle, market rules, tabs.
- `.planning/phases/02-private-access-my-books/02-CONTEXT.md`: user book scoping, attribution, `requireUser` on actions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/hedge/*`: pure decimal.js hedge engine (bonus bet, arb, `marketFilter` with `allowedBookKeys`, half-point spreads/totals filter). The boost math goes here.
- `src/db/queries.ts` `getUsableUserBooks` / `getHedgeBookKeys(allowedKeys)`: per-user hedge book scoping.
- `src/components/AppShell.tsx` (tabs), the finder/arb compact rows (`ResultsList`, `ArbResultsList`), `EmptyState`, `OddsStatusBar`, `RiskAdvisory`, and the `MultipleBooksPopover` pattern.
- `src/ingestion/odds/*`: cached Odds API events. These are what scraped promos get matched against.
- `scripts/*.ts` using `tsx --env-file`: the pattern for CLI scripts. The scraper entry point can follow it.

### Established Patterns
- Server actions follow this shape: `requireUser()` first, then Zod `safeParse`, then a pure domain function, then a typed result union.
- Drizzle migrations are generated and committed (`db:generate` + `db:migrate`, never `push`).
- Doc comments cite decision and requirement IDs.
- Every credit spend and user action is attributed to a user (`triggered_by_user_id`).

### Integration Points
- A new Promos tab in `AppShell` next to Bonus bets | Arbitrage.
- New tables for promos, scrape runs and aliases, in one migration.
- A new `.github/workflows/*.yml` scheduled job. None exists yet. It needs a `DATABASE_URL` secret.

</code_context>

<specifics>
## Specific Ideas

- The owner wants to **review the anti-bot and stealth choice book by book** once research reports what it found (D-09). Research must present each book's posture as a comparison and not quietly pick an approach.
- The status line format follows the existing odds-age line: "{Book} promos updated N h ago · last run failed".
- The auto-match safety net is visible: an "Auto-matched" tag plus a flag-back action.

</specifics>

<deferred>
## Deferred Ideas

None — the discussion stayed within the phase's scope. The feed, tandem hedges and manual promos are already in Phases 4 and 5 on the roadmap.

</deferred>

---

*Phase: 03-promo-scraping-review*
*Context gathered: 2026-09-27*
