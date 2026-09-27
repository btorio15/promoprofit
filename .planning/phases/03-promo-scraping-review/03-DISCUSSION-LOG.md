# Phase 3: Promo Scraping & Review - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-09-27
**Phase:** 03-promo-scraping-review
**Areas discussed:** Boost math & where it shows, Which book(s) to scrape, Match certainty & review queue, Scraped promo lifecycle

---

## Boost math & where it shows

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Promos' tab | A third top-level tab listing active scraped promos with their hedges. Phase 4 grows it into the feed. | ✓ |
| Review screen only | Boosts only visible on the review queue this phase | |
| Manual boost calculator | A form to type in a boost. PROJECT.md dropped a standalone calculator from v1. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Optimal within caps | Automatic stake that maximizes profit given caps, not editable | ✓ |
| Optimal, but editable | Prefilled, user can lower it | |
| User enters stake | No default | |

| Option | Description | Selected |
|--------|-------------|----------|
| Published boosted price | Trust the book's rounded boosted odds; use the % only as a fallback | ✓ |
| Always compute from % | Ignore the displayed boosted price | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with 'Same book' badge | Consistent with the finder | ✓ |
| No, other books only | Avoids a same-book account-limiting signal | |

**User's choice:** all recommended options.

---

## Which book(s) to scrape

| Option | Description | Selected |
|--------|-------------|----------|
| Let research pick | Easiest feasible public page among the 7 covered books | ✓ |
| DraftKings / FanDuel / a smaller book | Fixed target | |

| Option | Description | Selected |
|--------|-------------|----------|
| Every 2 hours | | |
| Every hour | | |
| A few times a day | Aligned with when books post promos | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Show status in app | Per-book last-run status on the Promos tab; existing promos kept | ✓ |
| Status + GitHub failure email | | |
| Silent skip | | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, public pages only | Skip blocked books | |
| Stealth plugin OK, no proxies | playwright-extra stealth allowed | ✓ |

**Notes:**
- The user asked what the anti-bot question meant. After the explanation (plain headless, stealth plugin, or stealth plus residential proxies), they chose the stealth plugin with no proxies, "but we can work through it case by case when research comes back."
- The user didn't give exact schedule times, so research will propose them.

---

## Match certainty & review queue

| Option | Description | Selected |
|--------|-------------|----------|
| Exact match only | Aliases, start time and an unambiguous market/side | |
| Everything goes to review | | |
| Confidence score threshold | Fuzzy score with auto-accept above a threshold | ✓ |

Follow-up on threshold strictness and the safety net:

| Option | Description | Selected |
|--------|-------------|----------|
| Strict + visible + reportable | Research-tuned strict threshold, "Auto-matched" tag, any member can flag it back to the queue | ✓ |
| Moderate + visible | | |
| Strict, hidden | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Any member reviews | Attributed | ✓ |
| Owner only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Section in Promos tab | "Needs review (N)" | ✓ |
| Separate review page | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm, correct, or dismiss | Dismissed promos are not re-queued | ✓ |
| Confirm or correct only | | |

**Notes:** The follow-up was added because success criterion 4 requires uncertain matches to be held for review, and ARCHITECTURE.md warns against auto-trusting fuzzy matches.

---

## Scraped promo lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Hedgeable single-game only | Boosts and bonus bets on 2-way markets with no push | ✓ |
| Boosts only | | |
| Keep everything, flag unhedgeable | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Expire it | When it's missing from a later scrape, at its stated expiry, or at game start | ✓ |
| Keep until game start | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parse caps, show rest as text | | ✓ |
| Exclude restricted promos | | |
| Show raw text only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Send to review | A boost with no readable cap is queued | ✓ |
| Assume a default cap | | |

---

## Claude's Discretion
- Storage schema, the confidence-scoring method, Promos tab row layout and sorting, boost formula implementation, and scraper code layout.

## Deferred Ideas
None.
