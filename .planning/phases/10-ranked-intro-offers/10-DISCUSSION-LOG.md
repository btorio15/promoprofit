# Phase 10: Ranked Intro Offers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 10-ranked-intro-offers
**Areas discussed:** Which offers count, Valuing 'bet & get' offers, Best intro offers section, Tracking & recording profit

---

## Which offers count

**Hand entry of intro offers?**

| Option | Selected |
|--------|----------|
| Yes, in this phase |  |
| No, scraped only | ✓ |

**User's choice:** No, scraped only (hand entry stays a future idea; BetMGM waits for Phase 11's scraper)

**Which books count as 'have'?**

| Option | Selected |
|--------|----------|
| Your saved books | ✓ |
| A separate 'used intro' list |  |

**User's choice:** Your saved books (My Books), same as today's Sign-up offers screen

**Non-bettable sign-up offers (deposit match, Crown Cash, sweepstakes)?**

| Option | Selected |
|--------|----------|
| Hide from ranking | ✓ |
| Show under 'can't price' |  |

**User's choice:** Hide from ranking; they stay in the plain list on Sign-up offers only

**Several usable offers at one book?**

| Option | Selected |
|--------|----------|
| Best one per book | ✓ |
| Every offer separately |  |

**User's choice:** Best one per book in 'Best intro offers'; full list on Sign-up offers shows the others marked 'pick one'

---

## Valuing 'bet & get' offers

**Qualifying bet**

| Option | Selected |
|--------|----------|
| Minimum stake, hedged |  |
| Minimum stake, no hedge |  |
| Bigger stake when it pays more |  |

**User's choice:** Minimum required stake, hedged at the member's books on the least-losing line

**Win-only offers**

| Option | Selected |
|--------|----------|
| Bonus x chance of winning |  |
| Hedge to lock part of it | ✓ |
| Skip win-only offers |  |

**User's choice:** Hedge to lock part of it (size a hedge so the member comes out ahead either way)

**Historical rate statistic**

| Option | Selected |
|--------|----------|
| 14-day median of top-5 |  |
| 14-day median of the best |  |
| 7-day median of top-5 |  |

**User's choice:** Per book: 14-day median of the recorded median-of-top-5

**Before enough history**

| Option | Selected |
|--------|----------|
| Today's rate, labelled |  |
| Whatever history exists |  |
| Fixed default rate | ✓ |

**User's choice:** Fixed default rate

**Default value and threshold**

| Option | Selected |
|--------|----------|
| 70% until 3 days |  |
| 65% until 7 days |  |
| 70% until 14 days |  |

**User's choice:** 65% until a book has 7 days of snapshots

**Installments**

| Option | Selected |
|--------|----------|
| Same rate for each | ✓ |
| Small discount for later ones |  |

**User's choice:** Same rate for each; each shown with its own expiry

**Apply historical rate to feed no-sweats too**

| Option | Selected |
|--------|----------|
| Yes, same rate everywhere | ✓ |
| Intro offers only |  |

**User's choice:** Yes, same rate everywhere (feed no-sweats and intro offers)

---

## Best intro offers section

**Placement**

| Option | Selected |
|--------|----------|
| Below the promos | ✓ |
| Above the promos |  |
| Collapsed at the bottom |  |

**User's choice:** Below the promos

**How many**

| Option | Selected |
|--------|----------|
| Top 3 + See all |  |
| Top 5 |  |
| All of them |  |

**User's choice:** Top 3 + 'See all' link to the full ranked list on Sign-up offers

**Ranking**

| Option | Selected |
|--------|----------|
| Total estimated value | ✓ |
| Value for cash put up |  |

**User's choice:** Total estimated value, biggest first

**Row style**

| Option | Selected |
|--------|----------|
| Same as the no-sweat row |  |
| Simple summary row |  |

**User's choice:** Same as the approved no-sweat row (sketch 001): est. figure, expand for waterfall bars + whole plan, notices in one (i) popover

**Sort switch**

| Option | Selected |
|--------|----------|
| No, always by value |  |
| Yes, follow the switch |  |

**User's choice:** No: intro offers always rank by value, ignoring the Profit/ROI switch

---

## Tracking & recording profit

**How to work through an offer**

| Option | Selected |
|--------|----------|
| Track it like a no-sweat | ✓ |
| Just mark it done |  |

**User's choice:** Track it like a no-sweat: step checklist in the Tracking strip

**Where intro profit counts**

| Option | Selected |
|--------|----------|
| Its own 'Intro offers' total | ✓ |
| Dashboard total, not the graph |  |
| Nowhere |  |

**User's choice:** Its own 'Intro offers extracted' total on the Dashboard (not the green total, not the graph)

**When the book joins My Books**

| Option | Selected |
|--------|----------|
| When you tap Track |  |
| Ask at Track |  |
| Leave it to me |  |

**User's choice:** Automatically when you tap Track

**What profit is recorded**

| Option | Selected |
|--------|----------|
| Real total, like no-sweats |  |
| Enter one total |  |

**User's choice:** Real total like no-sweats (qualifying + hedge result + each bonus's actual conversion), editable

---

## Claude's Discretion

Storage shape for structured intro terms (INTRO-06), win-only hedge-sizing math, exact median/7-day counting, copy.

## Deferred Ideas

- Hand entry of intro offers
- Separate 'intro used' list
- Value-per-dollar ranking / Sort switch for intro offers
