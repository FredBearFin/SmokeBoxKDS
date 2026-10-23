# Engine and store chaos review (round 13)

`test/chaos-store.test.mjs` (25 tests, Node only, fake clock and memory storage with injectable quota failures) tries to break the features added in rounds 10 to 12. Result: nothing crashed and no invariant broke. What was tried and held:

- Money in whole cents: random prices, tax rates (0 to 20, including 8.875), tips and discounts over many orders never left a fraction of a cent, totals always equal subtotal minus discount plus tax, hostile numbers (NaN, Infinity, negatives, strings, 1e308, half cents) are refused or rounded, a refused payment changes nothing, a second payment is refused, reopen then pay again stays consistent.
- Counter service: paid orders finish and bump all their tickets, reopen then add a round then pay again finishes only the new item, voids and 86 items in the same order keep the books balanced, a 600-step random mix with counter service switched on and off kept every engine invariant.
- Start over: wrong or odd confirm words (including non-strings), a bad `keepSettings`, the demo, double calls, quota errors at 7 different points (the kitchen after a reload is always either the whole old one or the whole new one), demo keys untouched.
- Old demo tickets: only pure demo tickets are counted and removed, a demo order that got a real round is left whole, a second clear says nothing to do, the demo refuses, the keep answer survives a reload and a forged value does not count.
- PIN recovery code: only a hash is stored, 5 wrong tries lock for 15 minutes even for the right code, the lock survives a reload and ends on time, a negative or garbage saved counter cannot buy extra tries, odd inputs (objects, arrays, a million characters, full-width letters) never succeed or throw, a spent code cannot be replayed, a new code replaces the old one.
- Order drafts: corrupt, oversized, stale, future-dated and array drafts are dropped and removed, a quota error keeps the older draft, a draft naming a dish that was archived or never existed cannot become a ticket, no prototype pollution.
- Last-good copy: a damaged live save recovers from the copy and the damaged text is kept aside; a damaged copy starts fresh instead of crashing.
- Two tabs racing Start over and an order in separate realms: both tabs end with the same consistent state and no ticket for a dish that no longer exists; real and demo keys never mix.

## One design question (owner A5), marked todo in the test

Start over refreshes the rolling last-good copy before erasing (so a failed erase can be recovered). That copy keeps the old customers and orders in browser storage until the next snapshot (6 hours or close of day), and a later damaged save restores them. For an owner who erases to remove personal data this is surprising. Suggested fix: after a successful erase, replace the copy with the new empty state (or delete it). Failing reproduction: the test "startOver then a damaged save" in `test/chaos-store.test.mjs` (it reports `todo` until fixed).

## Behaviors that look odd but are by design

- Ticket numbers start again at 101 after Start over (the doc says "exactly like a brand-new install"), so an old backup and the new kitchen can both contain ticket #101.
- `clearDemoLeftovers()` reports `ok: false, report: 'nothingToDo'` when there is nothing to clear.
