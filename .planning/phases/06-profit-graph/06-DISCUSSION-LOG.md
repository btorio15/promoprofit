# Phase 6: Profit Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 06-profit-graph
**Areas discussed:** How ranges behave, What counts as available, Size and placement, What tapping a day shows
**Todo:** "Stats overhaul" graph notes folded in (todo stays open for Phase 7)

---

## How ranges behave

| Question | Options | Selected |
|---|---|---|
| Where lines start on Last 7 days | Start at $0 / All-time total zoomed | Start at $0 ✓ |
| Default range | Last 30 days / Last 7 days / All time | Last 30 days ✓ |
| Remember last pick | Remember on this device / Always reset | Remember on this device ✓ |
| All time start | Sept 27 for both / Green from first Mark done | Sept 27 for both ✓ |

## What counts as available

| Question | Options | Selected |
|---|---|---|
| Include private hand-added promos | Yes / Scraped only | Yes ✓ |
| Pairs | Best of pair vs singles (feed rule) / Always singles | Feed rule ✓ |
| Your cap | Use your cap / Full max stake | Use your cap ✓ |
| Which day | Day first seen / Day of the game | Day first seen ✓ |

**Notes:** Claude flagged that stored observations are group-level at full stake without pairs; feasibility goes to research (D-09), a schema change is acceptable if needed.

## Size and placement

| Question | Options | Selected |
|---|---|---|
| Size | Compact (~160px) / Full-size (~300px) | Compact ✓ |
| Collapsible | Yes, remembered / Always shown | Yes, remembered ✓ |
| Headline numbers | Two totals above / Graph only | Two totals above ✓ |
| Line style | Step / Smooth / You decide | You decide ✓ |

## What tapping a day shows

| Question | Options | Selected |
|---|---|---|
| Extra detail (multi) | That day's gain / Gap left on table / Nothing more | That day's gain ✓ |
| Phone readout | Tooltip at finger / Fixed readout above | Tooltip at finger ✓ |
| Idle numbers | Totals for the range / Today's totals | Totals for the range ✓ |

## Claude's Discretion

- Line style, charting library, exact shades, axis ticks, header-row layout

## Deferred Ideas

- Gap / "left on the table" readout figure
