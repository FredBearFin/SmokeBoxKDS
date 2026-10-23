# Close the month: export and prune (design only, not built)

Written on `night/a5-r11`. Product decisions that were open are marked DEFAULT with the least risky choice; Freddy can change any of them.

## What it is

An owner action in the back office, "Close the month". It saves the month's records to files the owner keeps off the device, and only then removes that month's finished tickets, orders and events from the live save, so the kitchen stays small and fast. It is never automatic and never runs without the files being saved first.

## What is exported (a ZIP is avoided: separate plain files)

1. **A full backup** (`smokebox-backup-YYYY-MM-DD.json`): the whole kitchen as today, taken before anything is removed. DEFAULT: always the whole kitchen, not only the month, so the file alone restores the kitchen.
2. **An orders file** (`smokebox-orders-YYYY-MM.csv`): every paid, voided and open order of the month, one row per order with date, order id, customer, channel, method, subtotal, discount, tax, total, tip (dollars with cents).
3. **A tickets file** (`smokebox-tickets-YYYY-MM.csv`) and a **daily totals file** (`smokebox-days-YYYY-MM.csv`: from the close-day records: orders, subtotal, discount, tax, total, tip by method).
4. **The safety log** for the month (`smokebox-safety-YYYY-MM.csv`): readings, discards, cooling, sanitize. The safety log is still kept inside the app for 400 days, so this is an extra copy, never a replacement.

The screen shows each file name and size and a download button for each; the next step stays locked until the owner confirms "I saved these files". DEFAULT: confirmation by checkbox (the browser cannot know a file really reached a safe place). The files are built from the same exporters the Data page already uses.

## What is pruned

For the chosen month M (any month before the current service month; the current month is refused): finished tickets whose service date is in M, paid or voided orders whose tickets are all in M, and ticket-related events of those. DEFAULT: nothing from an open order, an open ticket, a cabinet batch, the menu, ingredients, settings, PIN, stock, the books or the safety records is removed. The grams used by removed tickets move into the books (`prunedUsed`) so stock still balances (the engine's existing rule). The day totals (`day_closed` events) of the month are kept, so month-level reports survive; ticket-level analytics for that month are gone from the live app and live in the files.

A new engine action `pruneMonth { month }` (not built) does the removal as one transaction, refuses with a plain report if a day of the month has an open order, and writes one `month_closed { month, tickets, orders, events }` event. It is not undoable; the backup is the undo.

## How to restore

- **Whole kitchen:** import the full backup from before the prune (Data page, Restore). This brings everything back, including the month.
- **Only to look at the month:** open the CSV files in a spreadsheet. There is no import of CSV history in this design (adding old orders back to the live app would double-count money).
- **After a mistake:** the last good copy is refreshed before the prune, so a damaged save can still come back to the pre-prune state.

## Interactions

- **Start over:** unchanged. Start over takes its own full backup first. Closing the month before starting over is not required. After Start over there is nothing to close; the month files already saved stay valid as records.
- **Last good copy:** taken just before the prune (reason `closeMonth`) and again after, so a damaged live save restores to a state that either has or lacks the month, never to a half state. It is a trimmed copy, so it does not contain the whole month anyway; the backup file is the real record.
- **Demo:** the action refuses in the demo (it only acts on the real kitchen).
- **History storage split** (`history-storage-design.md`): closing the month would drop the month's day keys in one step; the two features are independent, and closing the month alone already keeps the single key small.
- **Backups and the reminder:** the full backup counts as the daily backup (sets `lastbackup`).
- **Two tabs:** the action runs in one tab and is broadcast like any save; another tab must show the removed history after the next sync.

## Tests needed

- exported files add up to the live data for the month, to the cent (reuse the reconciliation tests);
- pruning leaves open work, menu, settings, stock and safety records identical; the books balance (I2) and invariants hold;
- restore from the full backup returns the exact pre-prune kitchen;
- refusal cases: current month, open order in the month, demo, unknown month, double run (second run is `nothingToDo`);
- quota: after pruning a month from a near-full storage the save succeeds without trimming;
- fuzz mix with Start over and close day.

## Size and risk

About 150 lines for the action and the exporters' glue, and a screen (A2). Main risk: the owner prunes without really saving the files; mitigated by the file list, the confirmation, the full backup inside the app's own last good copy, and refusing the current month. Second risk: ticket-level analytics for old months disappear from the app by design; the screen says so before the prune.
