---
phase: 9
slug: no-sweat-promos-in-the-feed
status: draft
shadcn_initialized: true
preset: base-nova (neutral, lucide) - already initialized, no change
created: 2026-10-22
---

# Phase 9 - UI Design Contract

> Visual and interaction contract for Phase 9. The design system already exists (shadcn base-nova, Tailwind v4, tokens in `src/app/globals.css`). This phase adds NO new tokens, fonts, colors or ui primitives. Everything below reuses what is shipped. Sources: 09-CONTEXT.md (D-01..D-23, A-01..A-12), 09-RESEARCH.md, and a scan of `src/components/{opportunities,promos,settings,ui}`, `RiskAdvisory.tsx`, `globals.css`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (components.json present, style base-nova, baseColor neutral, cssVariables) |
| Preset | base-nova, unchanged |
| Component library | base-ui via shadcn (`render={...}` prop pattern, e.g. `TooltipTrigger render`, `Button nativeButton={false} render={<Link/>}`) |
| Icon library | lucide-react (new icons this phase: `Pin` for Tracking strip heading and Track button, `Hourglass` for waiting; reuse `TriangleAlert`, `Undo2`, `Pencil`, `Trash2`, `Clock`, `ChevronDown`, `CheckCheck`) |
| Font | Geist Sans (`font-sans`) for text; Geist Mono via the existing `num` utility for every money, odds and percentage figure |
| Dark mode | OS `prefers-color-scheme` only (existing). Every new element must use token classes so both modes work. No raw hex in components |

New ui primitives needed: none. Use existing `Badge`, `Button`, `Card`, `Alert`, `Collapsible`, `Tooltip`, `Input`, `Label`, `Checkbox`, `AlertDialog`, `Select`, `ToggleGroup`, `Separator`.

---

## Spacing Scale

Same 4-multiple scale the app already uses (Tailwind 1 unit = 4px):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Icon gaps, gap between badge and text |
| sm | 8px | `gap-2` between badges, buttons in an action row, warning line spacing |
| md | 16px | `p-4` card padding (same as PromoRow/PairCard), `gap-4` form fields |
| lg | 24px | `p-6` Settings card padding, `gap-6` between screen sections |
| xl | 32px | `gap-8` between feed sections / Settings cards |
| 2xl | 48px | not used |
| 3xl | 64px | not used |

Exceptions (all already in the codebase):
- 12px (`gap-3`) inside row grids and card stacks, copied from PromoRow/PairCard.
- Touch targets: every new button, toggle row, input and segmented control is `min-h-11` (44px). Inputs `h-11`. Ghost `size="sm"` buttons get `min-h-10` as MarkUsedButton does; the new primary Track and outcome buttons use `min-h-11`.
- Icon-only controls: none introduced.

Phone-first: every new card is a single column below `md`; the 6-column desktop grid in PromoRow is reused as is for the no-sweat row (see Component Inventory).

---

## Typography

Only the sizes and weights already used by the app. Exactly 3 sizes. Weights 400 and 600 are the only ones this phase's new markup sets; 500 appears only as the shared Button/Badge weight in existing, unchanged ui components (400/500/600 total in the app).

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / row text (`text-base`) | 16px | 400 | 1.5 |
| Label / secondary / helper / badges / warnings (`text-sm`) | 14px | 400 (labels and buttons use the shared Button/Badge style, which ships at 500 and is not changed) | 1.5 |
| Heading (`text-xl`, section titles like "Tracking") | 20px | 600 | 1.2 |
| Estimate figure (`text-xl`, `num`) | 20px | 600 | 1.2 |

Rules:
- All money, odds, percentages use `num` (Geist Mono, tabular). Money is always `formatUsd` (cents shown); odds `formatAmerican`; percent `formatPct`.
- The headline estimate on a no-sweat row is `num text-xl font-semibold` like the guaranteed profit figure, but NOT `text-primary` (see Color: estimates are never green).
- Secondary line "at 78% - worst case -$3.10" is `text-sm text-muted-foreground`, figures inside it `num`.
- No new type sizes. Display (28px) is not used.

---

## Color

Existing tokens only. 60/30/10 unchanged.

| Role | Token | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` (white / oklch .145) | Screen background |
| Secondary (30%) | `--secondary` (`bg-secondary`), `bg-secondary/40` for muted rows, `--card` | Feed rows, Tracking cards, review cards, Settings cards |
| Accent (10%) | `--primary` emerald-600 / dark #10b981 | See reserved list |
| Warning | `--warning` amber (`text-warning`) | Account-risk and low-profile warnings, waiting reminder, price-changed notices |
| Destructive | `--destructive` | Delete and error text only ("Bet lost" is NOT destructive) |

Accent reserved for (unchanged rule, extended for this phase):
1. Guaranteed-profit figures and the primary CTA, as today.
2. The recorded REAL profit on a settled no-sweat (Done row, the "Recorded" figure after Bet won / Mark done). This is the only no-sweat number that may be green.
3. Focus ring, active sport chip, and the "Track bet" primary button.

Hard rule (supports FEED-04, D-12): **an estimate is never `text-primary`.** The "est." figure uses `text-foreground`, with the `est.` Badge (`variant="outline"`) next to it. Green means guaranteed or recorded money only. The Refund hedge card in the Tracking strip IS guaranteed (it is a plain bonus-bet conversion), so its profit figure is `text-primary`.

Amber (`text-warning`, with `TriangleAlert size-4`) is used for: account-risk line, specific low-profile warnings, waiting reminder, "can't price" note. Never destructive red for these. "Worst case -$3.10" is plain `text-muted-foreground`, not red (it is information, not an error).

Bet won / Bet lost / Push buttons are all `variant="outline"` (neutral), so the app never nudges the member toward a result. Only "Track bet" is the filled primary button.

---

## Copywriting Contract

Plain, everyday English. No jargon, no decision IDs. Money to the cent.

### No-sweat row (Opportunities feed)

| Element | Copy |
|---------|------|
| Type badge | `No-sweat` (Badge outline) |
| Estimate label badge | `est.` (Badge outline), tooltip: "An estimate. It assumes you turn the refund bonus bet into cash at today's best rate, so it can change." |
| Headline | `+$14.20` (num text-xl) with `est.` badge |
| Secondary line | `at 78% · worst case −$3.10` (full phrase per D-09: "est. +$14.20 at 78% · worst case −$3.10" when read as one line by screen readers via aria-label) |
| ROI column label | `Est. ROI` (replaces "ROI" label under the % for no-sweat rows; sort caption also reads "Est. ROI" when any no-sweat is in the list) |
| Row detail summary | "Bet {qualifyingStake} on {selection} {odds} at {book}, hedge {hedgeStake} on {selection} {odds} at {hedgeBook}. If your bet loses you get back a {refundAmount} bonus bet." |
| Primary CTA | `Track bet` (replaces Mark done on no-sweat rows) |
| Track helper (under button when expanded) | "Track bet pins this to the top so you can finish it after the game." |
| Account-risk line (D-20, every no-sweat row and Track confirmation) | "You only get one shot at this at each book. Mix in some normal bets and skip very long odds so your account looks like a regular customer." |
| Added-by-you badge | `Added by you` (existing) |
| Odds changed on Track | "Odds changed, so the numbers were updated. Check them and tap Track bet again." |

Never write: "guaranteed" on a no-sweat estimate, "free money", "multiple accounts", "VPN", "location".

### Low-profile warnings (D-22), shown only when that protection is OFF and the suggestion trips it
Amber `text-sm` line with `TriangleAlert`, one line each, stacked:

| Trigger | Copy |
|---------|------|
| Long odds (beyond the +300 cap) | "Long odds. A bet this far out is easy for the book to notice." |
| Alternate line | "This is an alternate line, not the main one. Books watch for those." |
| Exact-cent stake | "This stake has cents in it. Real bettors usually bet whole dollars." |

When filters hide lines and nothing is left: "No line fits your Low-profile settings right now." with link text "Change Low-profile settings" to `/settings`. When filters hid some lines but a row still shows: footer note under that row, `text-sm text-muted-foreground`: "{n} lines hidden by your Low-profile settings."

### Can't price list (D-10)

| Element | Copy |
|---------|------|
| Section heading | `Can't price yet` (text-xl font-semibold, same as other source headings) |
| Section sub-copy | "We have no odds for the refund at these books, so there is no estimate to show." |
| Per-row note (amber) | "Can't price - no odds at {book}." |
| Row content | type badge, book, title, scope, cap, expiry. No dollar amount, no ROI, no Track button |
| Negative-estimate no-sweats (D-11) | Go in the existing greyed "unprofitable" treatment (`UnprofitablePromoRow` look, `opacity-60`): note "Not worth it right now." No Track button |

### Tracking strip (D-02)

| Element | Copy |
|---------|------|
| Strip heading | `Tracking` (text-xl font-semibold) with count badge, e.g. `2` |
| Strip subtitle | "No-sweats you've placed. Finish each one when the game is over." |
| Strip empty state | Strip is not rendered at all when nothing is tracked (no empty box) |
| Card title | "{away} @ {home}" + `No-sweat` badge + book name |
| State: tracking, before kickoff | Status line "Game starts {formatKickoff}. Come back after it ends." No result buttons (D-03) |
| State: tracking, after kickoff | Question "How did it go?" with four buttons: `Bet won`, `Bet lost`, `Push`, `Game voided` |
| Push / void helper | "No money changes hands, so this counts as $0.00." (A-09) |
| Won confirmation line | "Recorded +$21.40" (num, text-primary) |
| Edit link on card | `I bet different amounts` (opens correction inputs) |
| Correction inputs (A-09) | Labels: `What you bet`, `Odds you got`, `Hedge amount`, `Hedge odds`. Helper: "Change these if you didn't bet exactly what we showed. We'll work out the profit again." Buttons: `Recalculate profit` and `Keep original amounts`. Recomputed preview line: "Profit would be +$20.10" before the member confirms |
| State: awaiting_refund heading | "Your bet lost. Turn your {refundAmount} bonus bet into cash." |
| Refund card body | Priced like the finder: top 3 conversion options (see Component Inventory) each "{selection} {odds} at {book}, bonus bet {stake}, hedge {hedgeStake} at {hedgeBook} -> +${profit}". Footer: "Lost bet: −{qualifyingStake}. Hedge on the first bet pays back +{hedgeWinnings}." and "All in, this one comes to {total}." |
| Refund CTA | `Mark done` (reuse MarkUsedButton label; records the real total, D-05) |
| Refund no odds | "No odds to price your bonus bet right now. Refresh odds, then check back." |
| Waiting reminder (D-07) | Amber, `Hourglass`: "Still waiting on this one. It counts as $0.00 until you tell us how it went." Shown on a card once kickoff + 6 hours has passed with no result (executor constant `WAITING_REMINDER_AFTER_HOURS = 6`) |
| Undo | `Undo` (existing MarkUsedButton undo style, `Undo2` icon), aria-label "Go back one step". On a card in `awaiting_refund` it steps back to the question; on a Done no-sweat row it returns the card to its previous state in the strip |
| Stop tracking (only while state=tracking and before a result) | `Stop tracking`, confirm dialog below |
| Price-changed on refund | "Odds moved. Showing the latest." (inline, muted, no dialog) |

### Add promo form (D-13, D-14)

| Element | Copy |
|---------|------|
| Type option | `No-sweat` (sits beside Bonus bet and Profit boost in the existing type selector) |
| Field: Refund cap | label `Most you get back`, prefix `$`, helper "The biggest refund the promo gives you." Error: "Enter a whole-cent amount, like 25 or 25.00." |
| Field: Min odds | label `Min odds`, placeholder `-200`, helper "Leave blank if the promo has no odds rule." |
| Field: Sport / league | label `Sport or league`, Select of existing sports, helper "Which games count." |
| Field: Expires | existing `ExpiryField`, helper "No-sweats usually end in 7 days." |
| Optional field: Bet type | under "More details (optional)": label `Bet type`, options `Any`, `Moneyline`, `Spread`, `Total`, helper "Pick one if the promo only works on that kind of bet." |
| Refund note (static, muted) | "The refund is paid as a bonus bet." |
| Submit | existing `Add promo` |
| Saved toast/state | existing "Promo added" pattern |

### Review queue (D-15)

| Element | Copy |
|---------|------|
| Card heading | "Scraper and reader disagree" |
| Left column label | `Scraper read` , value e.g. "No-sweat, $25 refund, -200 or longer" |
| Right column label | `Reader read`, value e.g. "Bonus bet, $25" |
| Promo text | Shown above both columns in the existing quoted promo-text block |
| Buttons | `It's a no-sweat`, `It's a bonus bet`, `Skip` (all outline, equal width on phone stacked, `min-h-11`) |
| Cash refund item (D-17) | Card heading "This refund may be cash". Body "We only price refunds paid as a bonus bet." Buttons `It's a no-sweat (bonus bet refund)`, `Skip` |
| After choosing | Card collapses with "Saved as no-sweat" / "Saved as bonus bet" / "Skipped" for 2 seconds, then removed (same as current review card behavior) |
| Parlay skip reason (D-16) | Appears only in skipped lists, not review: "Skipped: parlay refund. We only handle single bets." |

### Settings: Low-profile card (D-21)

| Element | Copy |
|---------|------|
| Card heading | `Low-profile` (text-xl font-semibold) |
| Card intro | "Settings that make a no-sweat bet look like a normal bet, so sportsbooks are less likely to limit your account. They only affect no-sweat suggestions." |
| Toggle 1 label | `Skip long odds` with helper "Don't suggest a bet longer than the odds below." Value field `Longest odds` with prefix `+`, default `300`, helper "300 means +300." Field disabled and dimmed when toggle off. Default: on |
| Toggle 2 label | `Main lines only` with helper "Only suggest regular moneyline, spread and total bets, not alternate lines." Default: off |
| Toggle 3 label | `Whole-dollar stakes` with helper "Round no-sweat bets to whole dollars so they look like a normal bet." Default: off |
| Save | `Save changes` (same pattern as SettingsBookCapsForm: explicit save, disabled while pending) |
| Saved | "Saved" inline success (same as caps form) |
| Error | "Couldn't save your Low-profile settings. Try again." |
| Validation | "Enter odds of +100 or longer, like 300." |

Placement: new `Card className="p-6"` on `/settings` AFTER "Max bet per book", inside the existing `max-w-[480px]` column. Component `SettingsLowProfileForm` mirrors `SettingsBookCapsForm` (server-read initial values, `setLowProfileAction`). Stake precision (whole/cents) is NOT a Settings item (client localStorage on the Arbitrage tab); do not add one. Intro line for Whole-dollar stakes states it overrides the precision setting for no-sweats only.

### Empty / error states

| Element | Copy |
|---------|------|
| Opportunities empty (no-sweats count toward not-empty, A-10) | existing variants unchanged; "nothing-profitable" fires only if no guaranteed AND no ranked/can't-price no-sweats exist |
| Track failure | "Couldn't track this one. Try again." |
| Settle failure | "Couldn't save that result. Try again." (reuse `ACTION_FAILED_MESSAGE` for thrown errors) |
| Load failure | existing destructive Alert in OpportunitiesScreen |

### Destructive and irreversible actions

| Action | Confirmation |
|--------|--------------|
| Delete a hand-added no-sweat | Existing `DeletePromoDialog`: unchanged copy. Not offered once the promo is tracked or done |
| Expire now (hand-added) | Existing `ExpirePromoDialog` |
| Stop tracking | AlertDialog: title "Stop tracking this bet?" body "It goes back to the feed. Nothing is recorded." actions `Keep tracking` / `Stop tracking` |
| Bet won / Bet lost / Push / Game voided | No dialog (reversible with Undo). Result buttons show a pending state and inline error; they never auto-fire from a card tap |
| Bet lost | Not destructive, outline button, no red |

---

## Component Inventory and Layout

### 1. No-sweat row (Opportunities feed) - `NoSweatRow` (new, sibling of `PromoRow`)
- Same shell as `PromoRow`: `Collapsible group rounded-lg border border-border bg-secondary`, empty full-card `CollapsibleTrigger` overlay, `pointer-events-none` content, `p-4`, `min-h-11`. Same `md:grid` columns: details | qualifying bet | hedge | estimate | Est. ROI | chevron.
- Column "Promo" shows `No-sweat` badge, selection, odds, book. Column "Hedge" shows hedge selection, odds, book. Both reuse PromoRow markup.
- Estimate column: `+$14.20` `num text-xl font-semibold text-foreground`, `est.` Badge beside it, beneath it `text-sm text-muted-foreground` "at 78% · worst case −$3.10".
- Est. ROI column: `num text-base` percent, caption "Est. ROI" (`text-sm text-muted-foreground`).
- The whole row must expose `aria-label` with the full spoken form: "Estimate plus 14 dollars 20 cents at 78 percent, worst case minus 3 dollars 10 cents."
- Warnings block (collapsed view, under the scope line): up to one risk line. Order: low-profile specific warnings (D-22) first, only when relevant. The generic account-risk line (D-20) lives in the EXPANDED panel and in the Track confirmation, so a collapsed row stays scannable on a phone.
- Track button: `Button` default (filled primary), `min-h-11`, label `Track bet`, `CheckCheck` is NOT used (use `Pin`). Placed in the collapsed row where MarkUsedButton sits, plus repeated at the bottom of the expanded panel for thumb reach on phone.
- Expanded panel (`NoSweatDetails`, mirrors `PromoDetails`): step list "1. Bet {stake} on ... 2. Hedge {stake} on ...", "If it wins: +${qualifyingWinnings − hedgeStake}", "If it loses: refund of {refund} bonus bet worth about {convertedRefund} at {rate}%, hedge pays {hedgeWinnings}", worst-case line, `PriceAgeNote` (includes the refund-conversion game age), the account-risk `Alert`-style line, then actions.
- Hand-added no-sweats: expanded panel footer shows `AddedPromoActions` (Edit, Expire now, Delete). This resolves the open question (see below).
- Sorting: inline with other promos by estimate (D-08). The existing `SortSwitch` Profit/ROI stays; caption for no-sweat sorts becomes "est." Do not add a third sort option.
- No-sweat estimates are visually distinguishable from guaranteed rows by: `est.` badge, non-green figure, `Est. ROI` caption. No extra background color, no dashed border.

### 2. Can't price list
- Separate `OpportunitySection` titled `Can't price yet`, rendered last on the screen, unsliced (not subject to top-5 `pickTop`). Rows are non-expandable plain divs in the `UnprofitablePromoRow` visual style (`bg-secondary/40 opacity-60 p-4`), listing badge, title, book, scope, and the amber note. No Track, no figures.

### 3. Tracking strip - `TrackingStrip` + `TrackedNoSweatCard`
- Rendered directly under the "Opportunities" h2 and the stale-odds line, above `SortSwitch`, so it is pinned at the top of Opportunities (D-02). Dashboard totals and the profit graph stay above it.
- Strip = `section` with heading row (`Pin` icon, `Tracking`, count badge) and a `flex flex-col gap-3` list of cards. Cards: `rounded-lg border border-border bg-secondary p-4`, never collapsible (all actions must be one tap away), single column at every width (max readable width follows the screen's existing container).
- Card anatomy top to bottom: meta line (sport · kickoff, `text-sm muted`), title row (teams, `No-sweat` badge, book), the snapshot summary (qualifying bet, hedge bet, as `text-sm`, figures `num`), state area (below), `Undo`/`Stop tracking` row on the right.
- State area by state:
  - Tracking before kickoff: muted status line only.
  - Tracking after kickoff: "How did it go?" `text-base font-semibold`, then a 2x2 grid on phone (`grid grid-cols-2 gap-2`), 4-up row from `sm`: `Bet won`, `Bet lost`, `Push`, `Game voided`, each `variant="outline" min-h-11`. Under them the `I bet different amounts` text-button opens the correction panel inline.
  - Correction panel (A-09): inline expand inside the card, 2-column grid on `sm`, 1 column on phone, four `Input`s (`h-11 num text-base`, `inputMode="decimal"` for money, `inputMode="text"` for odds), a live preview line, `Recalculate profit` (primary) and `Keep original amounts` (ghost). Server recomputes; client numbers are never trusted. Refund = min(actual stake, cap) is shown as "You'd get back {refund}."
  - Bet won: on tap, record from snapshot immediately, card shows "Recorded +$X" for 2 seconds then moves to the Done list. A "Fix amounts" link remains on the Done row for the correction path.
  - Bet lost: card transitions (no page navigation) to `awaiting_refund`: heading line, then the refund conversion block (see below).
  - Awaiting_refund block: up to 3 option rows (`rankRefundOpportunities limit 3`), each a compact row: selection, odds, book, stake, hedge stake and book, profit (`num text-primary` because this IS guaranteed). The top option is expanded by default; others are collapsed in `Collapsible`. A summary line of the all-in total sits below. `Mark done` (filled primary, `min-h-11`) records.
  - Waiting reminder: replaces nothing; renders as an amber line above the buttons.
- Loading/pending: each button disables on its own transition (useTransition) and shows the inline `role="alert"` error text like MarkUsedButton.
- After Mark done / settle, the card leaves the strip and a no-sweat `DonePromoRow` shows in the existing Done list.

### 4. Done row (no-sweat) - extend `DonePromoRow`
- Badge `No-sweat`, outcome chip text: `Won`, `Lost, refund converted`, `Push`, `Voided` (Badge outline). Final recorded profit `num text-primary` (real money, may be green). If negative, `text-foreground` with the minus sign (never green, never red). Undo button as today.

### 5. Add promo form
- New `NoSweatFields` sibling of `BonusBetFields`/`BoostFields` (same structure: top fields visible, "More details (optional)" `Collapsible` for market limit). Refund cap uses the `$`-prefixed `Input` pattern from BonusBetFields. Sport/league uses the existing Select + ScopePicker conventions. Reuse `ExpiryField`. Type selector adds a third option in the same control.

### 6. Review queue - extend `QueueItemCard`
- New `DisagreementCard` variant: promo text block on top (existing quote style), below it a two-column comparison (`grid grid-cols-1 sm:grid-cols-2 gap-3`), each column a `rounded-md border border-border bg-background p-3` with a `text-sm text-muted-foreground` label (`Scraper read` / `Reader read`) and `text-base` value. Differences between the two are not highlighted with color. Buttons row beneath: three equal outline buttons (`grid gap-2 sm:grid-cols-3`), `min-h-11`; `Skip` last and `variant="ghost"`.

### 7. Settings
- `SettingsLowProfileForm`: three rows, each `min-h-11` with `Label` on the left and a `Checkbox` (existing ui primitive; the app has no Switch component and none is added). Odds value `Input` beneath toggle 1, `h-11 num`, width `w-28`. One Save button at bottom, `min-h-11`.

### 8. Decision: where hand-added no-sweats are edited and deleted (open question resolved)
Hand-added no-sweats do not appear on the Promos tab, so management lives where the member sees them:
- **Opportunities no-sweat row, expanded panel**: `AddedPromoActions` (Edit, Expire now, Delete), shown only for promos the viewer added and only while not tracked.
- **Can't-price and negative-estimate rows**: same `AddedPromoActions` below the note (a promo with bad data must be fixable from where it shows).
- **Tracking card**: no Edit/Delete/Expire once tracked (the snapshot is the source of truth, A-03). Only `Stop tracking` (while in `tracking`, before a result) and `Undo`.
- Edit opens the same prefilled Add promo form the Promos tab uses; Opportunities hosts it with the same `onEdit(promoId, trigger)` signature so focus returns to the trigger. If the Promos form host cannot be lifted cheaply, executor opens it in the same `Dialog`/sheet pattern PromosScreen uses. No new Promos-tab list is added.
- Deleting a promo that has a tracked or done record is blocked with: "This one is already being tracked. Stop tracking it first."

---

## Interaction and State Contract

- Track: tap, server recompute, on `odds_changed` the row updates in place and shows the odds-changed message (mirrors MarkUsedButton). Track never navigates away; the row animates out of the ranked list into the strip via the usual refetch (`onChanged` bumps `promosVersion`).
- Result buttons are hidden, not disabled, before kickoff (D-03). Clock comparison is computed on the server for correctness; the client shows buttons only if the server flags `pastKickoff: true`.
- Undo steps exactly one state back (Done -> previous strip state; awaiting_refund -> asked question; tracking -> feed).
- Keyboard and a11y: all buttons real `button`, focus ring from existing classes, `aria-live="polite"` on the "Recorded +$X" line, `role="alert"` on inline errors, warnings are text (never color-only, always with icon and words), tooltips are supplementary (the `est.` meaning must also be in the row aria-label).
- Reduced layout shift: the Tracking strip reserves nothing when empty; cards use fixed button heights.
- Dollar rounding: every displayed amount is server-computed; Natural stakes ON means displayed hedge stakes are whole dollars and the profit shown is recomputed from them.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none new (existing alert, badge, button, card, checkbox, collapsible, input, label, select, tooltip, alert-dialog) | not required |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
