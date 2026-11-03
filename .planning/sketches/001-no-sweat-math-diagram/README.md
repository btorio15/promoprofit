---
sketch: 001
name: no-sweat-math-diagram
question: "Can a diagram of the no-sweat math replace the text-heavy row and panel, and what happens to the notices?"
winner: "B + notices 1"
tags: [opportunities, no-sweat, phase-9, mobile]
---

# Sketch 001: No-sweat Math Diagram

## Design Question
At the Phase 9 phone check the owner found the no-sweat row text-heavy and cramped. Can a diagram of the math replace the paragraph and bullet list, and how should the notices (account risk, Low-profile warnings, "est." explanation, Track helper) be handled?

## How to View
open .planning/sketches/001-no-sweat-math-diagram/index.html
(or serve `.planning/sketches/` and open on a phone at 375-390px)

## Variants
Diagram:
- **A: Two-outcome split.** The two bets on top fork into "wins" and "loses" boxes, each with its own lines and a Net.
- **B: Waterfall bars.** Each outcome is a mini waterfall (one bar per step, then Net), and the refund is a hatched, estimated bar.

Notices (combine with either diagram):
- **1: One (i) icon.** All notices go in a popover next to the estimate, and Low-profile warnings show as an amber dot on the row.
- **2: Risk line once.** One short account-risk line in the expanded panel, with everything else in the (i) popover.
- **3: None.** No notices at all.

## What to Look For
- Is the win/lose math readable at a glance on a phone?
- Are estimates clearly not green (they must never look guaranteed)?
- Does the collapsed row still feel scannable next to the guaranteed promo rows?

## Decision (owner, 2026-11-03)
- **Diagram: B, waterfall bars.** Each outcome is a step-by-step waterfall with dotted connectors, a labelled $0 line, a hatched estimated refund bar and a solid Net bar. On laptop the bets sit in a left column with the two waterfalls side by side; on phone everything stacks.
- **Notices: 1, one (i) icon.** The estimate explanation, account-risk warning, Low-profile warnings and Track helper all go in one popover beside the "est." badge. Low-profile warnings show as an amber dot on the row.
- The worst-case line ("If the refund is worth $0") stays under the diagram.
