# Phase 2: Private Access & My Books - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 02-private-access-my-books
**Areas discussed:** Accounts & login, My Books setup, Where my books apply, Shared vs per-user state

---

## Accounts & login

| Question | Options | Selected |
|----------|---------|----------|
| How a friend gets an account | Seed script / One-time invite link / Owner admin page | One-time invite link |
| Login identifier | Email + password / Username + password | Email + password |
| Session length | 30 days / 7 days / Until logout | 30 days |
| Forgotten password | Owner resets via script / Self-serve change only / Both | Owner resets via script |
| How invites are created | Script prints link / Button in the app | Script prints link |
| Invite expiry | 7 days / 48 hours / Never (single-use) | 7 days |
| Invite page fields | Email, name, password / Password only | Email, name, password |

## My Books setup

| Question | Options | Selected |
|----------|---------|----------|
| When books are picked | Step after invite signup / Settings page only | Step after invite signup |
| Default selection | Nothing ticked / All books ticked | Nothing ticked (≥1 required) |
| Books in picker | Only the 7 with odds / All 13 Colorado books | Only the 7 with odds |
| Settings location | Settings page from header / Third top-level tab | Settings page from header |

## Where my books apply

| Question | Options | Selected |
|----------|---------|----------|
| Bonus-book dropdown | My books only / All 7 books | My books only |
| Arbitrage tab | Both legs in my books / Unfiltered / Toggle mine-all | Both legs in my books |
| Games my books can't hedge | Hide / Show greyed "needs another book" | Hide |
| Multiple books badge | Only my books / All tied books | Only my books |
| Same-book hedges | Keep with badge / Exclude | Keep with badge |
| Books changed while results show | Recompute on next view / Keep until re-search | Recompute on next view |

**Notes:** User first picked "All 7 books" for the bonus-book dropdown, then changed it mid-discussion to "just users books".

## Shared vs per-user state

| Question | Options | Selected |
|----------|---------|----------|
| Who can spend credits | Any logged-in user / Owner only for spreads-totals / Owner only for both | Any logged-in user |
| Spend attribution | Yes ("last refreshed by Mike") / No | Yes |
| Stake/precision/cap prefs | Keep in browser / Save to account | Keep in browser |
| Finder advisory placement | Same as Arbitrage tab / Small footnote | Same as Arbitrage tab |

## Claude's Discretion

- Password hashing library, password rules, login rate limiting
- Invite token format and storage, script names
- Route protection mechanism (middleware vs per-action checks)
- Logged-out visitor experience (redirect to login)
- Copy for invite errors, empty states, attribution line

## Deferred Ideas

None.
