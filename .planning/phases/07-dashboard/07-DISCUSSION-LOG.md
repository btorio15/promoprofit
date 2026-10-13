# Phase 7: Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-13
**Phase:** 07-dashboard
**Areas discussed:** Which numbers count, Top-of-page layout, The three counts, Tab name and header

---

## Which numbers count

| Option | Description | Selected |
|--------|-------------|----------|
| Your own record | Same as the graph's grey line; only counts from Oct 13 | ✓ |
| Old group-wide record | Longer history, full max stakes, all books; won't match the graph | |
| Both, labeled | Own record as headline, group-wide as secondary line | |

**User's choice:** Your own record (available).

| Option | Description | Selected |
|--------|-------------|----------|
| All-time headline | Everything marked done; graph keeps its since-Oct-13 framing | ✓ |
| Since Oct 13 only | Everything agrees with the graph; earlier completions hidden | |
| Fold old into Oct 13 | Draw pre-Oct 13 completions as a starting amount on the graph | |

**User's choice:** All-time headline (extracted).

| Option | Description | Selected |
|--------|-------------|----------|
| Extracted, with available | "Last 7 days: $X extracted of $Y available" | ✓ |
| Extracted only | Simplest | |
| Available only | Today's behavior | |

**User's choice:** Extracted, with available (7d / 30d).

| Option | Description | Selected |
|--------|-------------|----------|
| Label the start date | "Available since Oct 13" / "Extracted all-time" | ✓ |
| Small footnote | Plain labels plus a muted footnote | |

**User's choice:** Label the start date.

---

## Top-of-page layout

The owner first asked for mockups of each option, then specifically desktop-sized ones (https://claude.ai/artifact/M1k9kqahCUcGAnLPGu8NwV, built with the owner's real figures).

| Option | Description | Selected |
|--------|-------------|----------|
| A: one card | Totals, graph and counts in one card | |
| B: two cards | Totals card, then the graph card as today | ✓ |
| C: chips row | Sideways-scrolling number chips above the graph | |

**User's choice:** B: two cards.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the totals | Hide graph removes only the chart | ✓ |
| Hide everything | Collapse to a one-line bar | |

**User's choice:** Keep the totals.

| Option | Description | Selected |
|--------|-------------|----------|
| 2 × 2 grid | Extracted / Available on top, 7d / 30d below; counts line under | ✓ |
| Headline + small rows | Only extracted large | |
| You decide | | |

**User's choice:** 2 × 2 grid on phones.

---

## The three counts

| Option | Description | Selected |
|--------|-------------|----------|
| All-time | Picker only changes the graph | ✓ |
| Follow the picker | Counts change with 7d / 30d / All | |

| Option | Description | Selected |
|--------|-------------|----------|
| $ + book + promo name | "Best $9.05 · DraftKings · College Football 50% Profit Boost" | ✓ |
| $ + book only | | |
| $ + book + date | | |

| Option | Description | Selected |
|--------|-------------|----------|
| As one promo | 10 done, avg $3.31 | ✓ |
| As two promos | 12 done | |

**Notes:** Found during the discussion: 2 of the owner's 12 completion rows are pair marker rows at $0.00, so counting rows directly would show 12 done / avg $2.76.

---

## Tab name and header

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard + new subtitle | "Your profit so far, and the best money available right now at your books." | ✓ |
| No heading | Start with the totals card | |
| Keep it as is | "Opportunities" heading under a Dashboard tab | |

| Option | Description | Selected |
|--------|-------------|----------|
| "Opportunities" section heading | Above Sort by | ✓ |
| No heading | | |

---

## Claude's Discretion

- Best promo label when it is a pair ("<BookA> + <BookB> pair").
- Empty states for no completions / no member observations.
- Component structure, where totals are computed, cleanup of unused summary code paths.
- Whether the internal tab id is renamed.

## Deferred Ideas

- No-sweat bet misclassification fix (owner hasn't asked for it yet).
- Audit-page backlog items (CI checks, Odds API timeouts, scrape alerts, login rate limit, retention).
- 2-bet pair solver 1¢ rounding todo (reviewed, not folded).
