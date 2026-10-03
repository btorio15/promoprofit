# Phase 4: Opportunities Feed - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-29
**Phase:** 04-opportunities-feed
**Areas discussed:** Feed vs Promos tab, Paired promos display, Sorting, Book filtering

---

## Feed vs Promos tab

| Question | Options | Selected |
|----------|---------|----------|
| Where should the feed live? | Promos tab becomes the feed / New separate Feed screen / Promos tab, not landing | New separate Feed screen |
| Tab name | Opportunities / Promos (keep) / Feed | Opportunities |
| Review queue + scrape freshness | Below rows / Above rows / Own tab | Own tab |
| What stays on Promos? | Promo list + Done / Merge into Opportunities / Done + totals only | Free text (below) |
| Landing tab | Opportunities / Bonus bets | Opportunities |
| Profit totals | Top of Opportunities / Promos only / Both | Top of Opportunities |
| Sources in Phase 4 | Promo hedges / Paired promos / Arbitrage / Bonus bets you hold | Promo hedges, Paired promos, Arbitrage |
| How much to show | Top 10 + see all / Everything ranked / Top 5 per source | Top 5 per source |

**User's free text:** "Kalshi/Polymarket arb data will come later, so have Opportunities will just grab the top profit opportunities across the site."
**Notes:** Opportunities = site-wide top view built from sources; Kalshi/Polymarket deferred (currently out of scope).

---

## Paired promos display

| Question | Options | Selected |
|----------|---------|----------|
| How a pair shows | One combined card / Linked rows | One combined card |
| When to show | Only when pairing beats separate / Always with comparison | Only when pairing beats separate |
| Mark done on a pair | Marks both / Each leg separately | Marks both |
| Pair types | Boost+boost and boost+bonus / Also bonus+bonus | Boost+boost and boost+bonus |
| Totals | Count pair once / Keep counting singles | Count pair once |
| Many possible pairs | Best pair per promo / List every pair | Best pair per promo |

---

## Sorting

| Question | Options | Selected |
|----------|---------|----------|
| Where the switch appears | Opportunities and Promos / Promos only / Opportunities only | Opportunities and Promos |
| Default | Guaranteed profit / ROI | Guaranteed profit |
| Remember choice | Per device / Reset each visit | Per device |

---

## Book filtering

| Question | Options | Selected |
|----------|---------|----------|
| Other-book promos on Opportunities | Exclude / Include dimmed last | Exclude |
| Hedge books | Only yours / Any CO book flagged | Only yours |
| Pairs and arbs | Both books yours / At least one yours | Both books yours |
| Promos tab rule | Keep / Show-all switch / Hide | Keep |

---

## Claude's Discretion
- Card layouts, section headings, empty states, odds-age display, "see all" behavior, pair search algorithm, whether profit summary also stays on Promos.

## Deferred Ideas
- Kalshi/Polymarket arbitrage source (needs scope change).
- Scheduled scrape fix (Phase 3 open item, infrastructure).
- Phase 5 add-promo should use the search/date-range picker.
