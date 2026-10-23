# Performance of the engine, store and screens' data, at full size

Measured in Node on one machine with other work running, so treat numbers as orders of magnitude (they moved by up to 40 percent between runs). Not measured: a real tablet, a browser, rendering. The kitchen: 150 dishes with two-line recipes, 80 ingredients, 200 open tickets, 5,000 tickets of paid history (about 12 MB saved, 40,000 events).

## Numbers (milliseconds per call)

| What | Before (start of round 7) | After | Note |
|---|---|---|---|
| createTicket / advanceItem / completeItem / toggle86 | 0.04 to 0.14 | 0.04 to 0.16 | apply() copies only what it changes; history size does not matter |
| moveMenuItem, updateMenuItem, restock | 0.10 to 0.21 | 0.12 to 0.16 | |
| idle tick (nothing due) | 0.002 | 0.002 | remembered deadline, O(1) |
| computeAvail / views.counts / allDay (200 open) | 0.06 / 0.28 / 0.24 | 0.10 / 0.34 / 0.67 | noise; all under 1 ms |
| deadline feed (SB.deadlines.build) | 1.2 | 1.3 | |
| checkInvariants (tests and tools only) | 22.6 | 31.0 | never run in the app |
| serialize the whole state | 62 | 60 | 12.1 million characters |
| JSON.parse of it | 77 | 84 | |
| validateBackup (startup, import, other-tab load) | 189 | 259 | plus parse: a cold start with the full history is about 0.3 s |
| prune to 1,500 tickets / 10,000 events | 5.3 | 7.3 | used when the browser is full |
| dispatch (no save) | 0.15 | 0.08 | |
| full save (flush) | 63 | 72 | stringify dominates; the browser's own setItem is on top and was not measured |
| analytics (sales, by item, anatomy, food cost, by hour) | 11 to 24 | 13 to 50 | each, over 5,000 tickets; the office pages share one pass |
| memory | heap 38 MB after building, 160 MB after analytics | same | Node numbers, not a browser's |

## Where the time goes

Everything an order does is under a millisecond, whatever the history. The one cost that grows with history is the save: the whole state (12 MB at full size) is written as one value. By bytes the history is: tickets 41 percent, events 49 percent, orders 12 percent (full-size run), against 0.4 percent for menu and ingredients together.

## What changed

- Adaptive save delay (`30-store.js`): a save is debounced 400 ms as before, but after a slow save the next wait is eight times what the last save took, between 400 ms and 5 s (`status().saveCostMs`, `status().saveDelayMs`). At 60 ms per save the wait is about 0.5 s, so the gain at this size in Node is small. It matters where a browser's write of a 12 MB value takes 0.3 s or more: the wait grows to 2.4 s so a rush spends most of its time serving, not writing. Not measured in a real browser.
- Dead code removed (see below); no speed effect.

## What I did not do, and recommend

- **Write history in pieces.** Keep the live state small (open tickets, menu, settings) in one key and move closed days into separate append-only keys, so a save writes kilobytes instead of megabytes. This is the one change that would make saves cheap at any history size. It touches persistence, backup and import, the trim logic and every test that reads the saved key, so it needs its own round and a migration; the 5,000-ticket history already fits the trim rules in `docs/audit/storage-budget.md`.
- A "close the month" action (export, then prune) is a smaller step toward the same thing.

## Guards

`test/performance.test.mjs` builds this kitchen (2,000 history tickets to keep the test fast) and fails if an action takes 25 ms or more, a screen read takes 100 ms or more, a save or check of the whole kitchen takes seconds, or a burst of 100 actions writes before the pause. The bounds are about thirty times the measured values. `test/safety-net.test.mjs` covers the adaptive delay.

## Dead code removed in round 7

Found with an identifier count per file (declared, never referenced): `hmText` (25-deadlines.js), `num1`, `joinList` and an unused `lab` (50-charts.js), `startEmpty` (70-floor-board.js, a leftover "clear the demo tickets" button handler that reset a real kitchen), `zoneOf` (72-floor-sheets.js), `reduced` (80-office-core.js), `subHelp` (84-office-data.js). The engine, store, config, importer and util files have none. Exports used only by tests or tools (`pacingPlan`, `ticketProgress`, `serialize`, `deserialize`, `REPORT_IDS`, `ACTIONS`, `DISCARD_REASONS`, `estimate`, `syncDelayMs`) were kept: they are the engine's documented public surface. One leftover barbecue assumption outside the sample was removed: `85-office-stock.js` fell back to the id `'brisket'` when a kitchen had no tracked protein. Hard-coded sample ids that remain are all inside sample-only code (the simulator, the guided tour's preference list, the sample config).
