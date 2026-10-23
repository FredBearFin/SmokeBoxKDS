# History storage design: closed days in their own keys (design only, not built)

Written on `night/a5-r11`. Nothing here is implemented. Numbers come from `docs/audit/performance.md` and `storage-budget.md`.

## 1. The problem

Every save writes the whole kitchen as one value (`smokebox.v1.state`). At full size (150 dishes, 5,000 tickets of history) that is 12 MB: 60 ms to stringify in Node, plus the browser's own write of 12 MB on the main thread, repeated every 400 ms to 5 s during a rush. By bytes the history is: tickets 41 percent, events 49 percent, orders 12 percent; menu and ingredients together are 0.4 percent. Browsers allow about 5 million characters, so a busy kitchen reaches the limit after some weeks and the only remedy today is trimming (oldest finished tickets, orders and events go first).

Goal: a normal save writes kilobytes (today's open work plus the small core), and old days are written once and never rewritten.

## 2. Recommendation in one paragraph

Split persistence only; leave the engine and the in-memory state exactly as they are. The store writes a small **core** key plus one **day key** per closed service day, assembles the full state when it loads, and writes back only the core and the days that changed. Export, import, the last good copy, the engine, the metrics and every screen keep seeing one whole state. Ship it behind a switch that defaults to the old single key, migrate lazily, and keep the single-key writer as the rollback.

## 3. Layout

| Key | Holds | Size |
|---|---|---|
| `smokebox.v1.state` | the core: `v`, `rev`, settings (PIN), menu, ingredients, stock, ledger, batches, open and today's tickets and orders, undo, `seq`, `learned`, `sanitize`, `catalog`, `manifest`, and the recent events | tens of KB plus today's work (about 100 to 600 KB on a busy day) |
| `smokebox.v1.day.<YYYY-MM-DD>` | `{ date, tickets, orders, events, rev, sum }` for one closed service day | about 5 to 15 KB per 10 tickets of that day; one busy day is 100 to 400 KB |
| (inside the core) `manifest` | `{ days: { "<date>": { n: tickets, o: orders, e: events, sum, bytes } }, writing: null }` | about 60 characters per day |

Names are sorted by date and use the service date (`U.serviceDate`), so the key order is the time order. The demo uses the existing `smokebox.demo.` mapping (they would be classified as kitchen data in `U.dataKeys`; the guard test already fails on an unclassified key).

Not moved out of the core: safety events (`safetyKeep`, kept 400 days), `lastClose`, the books (`ledger`, with the grams of removed history already folded into `prunedUsed` and `prunedWaste`), `learned`, and anything about open work.

## 4. When a day becomes "closed"

A service day D is closed for storage when all of these hold on a save:
1. D is earlier than today's service date (it rolled over at the day-start hour, now correct on daylight-saving nights),
2. every ticket of D is finished (bumped or voided) and every order whose tickets are all in D is paid or voided, and
3. a `day_closed` event exists for D, or D is more than 24 hours old (so a forgotten close does not keep a day in the core forever).

An order that spans two days (opened Monday night, paid after the day turn) stays in the core until it is settled; its tickets move with it. A reopened order or a recalled ticket pulls its day back: the day is "opened" again, merged into the core, and its day key is rewritten when it closes again. Closing a day twice just rewrites that day key.

## 5. Save, load, crash safety

Save (`persistNow`): (a) for each newly closed or changed day, write `day.<date>` first; (b) then write the core with its `manifest` updated; (c) then remove day keys no longer in the manifest. The core is the commit point: a crash after (a) leaves harmless orphan day keys (swept on the next start); a crash before (b) leaves the old core pointing at the old days. The `sum` in the manifest (a short hash of the day text) lets load detect a day key that does not match.

Load (`init`): read the core; for each day in the manifest read its key, check `sum`, and merge tickets, orders and events back into the state (tickets stay sorted by number within date; events chunk as today). A missing or mismatched day key is reported ("the history of <date> could not be read") and the rest still loads; it never makes the core unreadable. The damaged-save path (`corrupt`, last good copy) applies to the core only; the last good copy keeps its own 300 tickets and 2,000 events, so it can restore the core and the recent days without any day key.

Two tabs: the tab-sync messages carry the core `sid`; a tab that sees a newer core re-reads only the day keys whose `sum` changed. Day keys are written by whichever tab closes the day; since the content for a closed day is the same in both, a double write is harmless.

## 6. Backup, restore, import

Export builds the same single envelope as today from the assembled state (all days). The format does not change, so every old backup and every old build can read what the new build exports, and the new build reads every old backup. Import validates the whole state, then writes it as core plus days. "Start over" and "Close the month" (section in `close-month-design.md`) go through the same writer. The last good copy is taken from the assembled state, trimmed as today.

## 7. Quota pressure: trimming order

Today the order is: last good copy, then halve tickets and events together. With day keys the order becomes finer, and stops losing the newest history first:
1. delete the last good copy;
2. delete the oldest day keys one at a time (whole days, oldest first), refreshing the manifest, until the save fits; the grams used by those days move into the books exactly as `prune` does now;
3. only then trim inside the core as today.
Never dropped: menu, ingredients, settings and PIN, open work, batches, safety records. The owner sees one notice saying which dates were dropped; the backup reminder wording is unchanged.

## 8. Migration of existing single-key saves

On first load by the new build with the switch on: the state loads from the single key as today; the store then writes day keys for every closed day, writes the new core (with manifest), and only after both succeed removes nothing (the single key IS the core key, so it is overwritten by the smaller core). To protect against a crash in the middle, the first migration also keeps a copy of the old text under `smokebox.v1.premigrate` until the next successful full save, then deletes it (this temporarily doubles the storage, so it is skipped if the browser refuses it and the migration proceeds in that case only after the last good copy has been refreshed).

Rollback: set the switch off. The store writes the single key again from the assembled state (it already has everything in memory), deletes the day keys and the manifest, and is back to today's layout. An older build that opens a new-layout save sees only the core (no manifest support): the history of closed days seems missing, but the day keys stay on disk and the next new-build start restores them. The old build must not run long enough to trim or sweep: it does not know the day keys, so it never deletes them; the cost is only a smaller visible history until the owner returns to the new build, and the downgrade note in the release notes needs this sentence.

## 9. Tests needed

- layout: core plus days reassemble to a state equal (canonical) to the original, for blank, sample and all six old-save fixtures;
- a save after one new order writes only the core (spy storage: no day key written); a day closing writes exactly one day key; reopening and closing again rewrites it;
- crash points: a spy that throws after writing the day but before the core, after the core but before the sweep; load is whole in both cases;
- damaged day key: load reports it and carries on; damaged core falls back to the last good copy;
- two tabs: close in one tab appears in the other; both closing the same day is idempotent;
- export and import: backup text from the new layout equals the old layout's text for the same kitchen; old backups import into the new layout;
- quota: the trimming order above, with a capacity-limited storage (the harness in `test/safety-net.test.mjs`);
- migration: from each old-save fixture, then rollback to the single key and compare; the premigrate copy appears and disappears;
- start over and the demo: neither touches the other namespace's day keys; start over removes the real day keys;
- performance: a save with 5,000 tickets of closed history is under 5 percent of today's bytes (guard in `test/performance.test.mjs`);
- the key-classification guard test (new keys are kitchen data).

## 10. Size and risk of the change

Size: about 300 to 400 lines in `30-store.js` (writer, loader, migration, trimming), a few lines in `00-util.js` for the key classes and a prefix lister (already added in round 4), no engine change, and 11 test files that read `smokebox.v1.state` directly need their helper updated (they use the assembled state through the store, except the quota and old-save tests that inspect the key).

Risks, most serious first:
1. A bug between day keys and the core (partial write, stale manifest) makes history look lost. Mitigated by write order, sums, orphan sweep, and the whole-state backup reminder; the switch keeps the single key as the default until the tests and a soak have run.
2. Two tabs closing the same day while one has older data. Mitigated by deterministic day content and rewriting on `sum` change.
3. Downgrade shows a smaller history (section 8).
4. More keys to keep in sync with the demo mapping and Start over (covered by the guard test and new tests).
5. The assembled state still holds everything in memory (about 40 MB for the full history in Node); this design does not change memory use. Lazy loading of old days is a later step that would need the engine and metrics to ask for ranges.

## 11. Stepwise plan

1. (Done in round 7) Adaptive save delay. (Cheap, small effect.)
2. Build the pure helpers: split a state into core and days, and merge back, with property tests that `merge(split(s))` equals `s`. No storage involved.
3. Add the day writer and loader behind the switch (default off); make the quota trimmer day-aware.
4. Add migration and the premigrate copy; run all six old-save fixtures through it.
5. Soak: the existing fuzz and scale tests with the switch on; two-tab tests.
6. Turn the switch on for new installs only; keep upgrading kitchens on the single key for one release.
7. Turn it on for everyone once the release has no reports; remove the switch only after two releases.
8. Optional later: load old days lazily for the office pages.

"Close the month" (`close-month-design.md`) can ship first and independently: it also shrinks the single key, and it prepares the owner's habit of keeping files off the device.
