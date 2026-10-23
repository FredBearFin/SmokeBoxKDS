# Storage budget: what each browser key holds and how big it gets

Measured on `night/a5-r6` with the engine in Node (sizes are JSON characters, which is what `localStorage` counts; a character may take 1 or 2 bytes depending on the browser). Browser limits were NOT measured on a real device: a common figure is about 5 million characters per site, but that is an assumption, not a test.

## The keys

Kitchen data (separate copy in the demo, saved as `smokebox.demo.<name>`): see `U.dataKeys` in `src/js/00-util.js`.

| Key | Holds | Size |
|---|---|---|
| `smokebox.v1.state` | the whole kitchen: settings (including the PIN hash), menu, ingredients, tickets, orders, batches, stock, events, the books | blank 1.4 KB; sample kitchen 15 KB; 150 dishes with two-line recipes 38 KB; 80 ingredients 9 KB; one finished one-line ticket 0.55 KB plus its order 0.3 KB plus about 8 events (1 KB); a full 5,000-ticket history of two-line tickets 12.6 MB |
| `smokebox.v1.sid` | the id of the last save, for two-tab sync | under 40 characters |
| `smokebox.v1.outbox` | actions not yet confirmed by a server (only with a server transport) | up to 5,000 actions, about 1.5 MB at the worst; empty in the Solo package |
| `smokebox.v1.corrupt` | a copy of a damaged save, kept aside | as big as the damaged save (it can double the storage in use). Cleared automatically 30 days after it was set aside, once a working save is running. |
| `smokebox.v1.corruptat` | when that copy was set aside (a time) | 13 characters |
| `smokebox.v1.lastgood` | one rolling "last good copy": the menu, ingredients, settings (PIN), batches, safety records and the latest 300 tickets and 2,000 events | 8 percent of the live save at full size (about 1 MB against 12 MB); about the same as the live save for a small kitchen |
| `smokebox.v1.names` | owner station, category and channel names | under 2 KB (at most 8 stations, 12 categories, 8 channels, 24 characters each) |
| `smokebox.v1.sample` | whether the back office shows sample history | 5 characters |
| `smokebox.v1.welcome`, `lastbackup`, `pinlock`, `paymethod`, `initials` | small flags and times | under 100 characters each |
| `smokebox.v1.dlog` | discard-log column settings, initials and notes per batch | a few hundred characters; grows by about 40 per discarded batch note |
| `smokebox.v1.alertlog` | the last 400 warning sounds | about 60 KB at the cap |
| `smokebox.v1.lastbatch` | last batch weights per product | under 2 KB |
| `smokebox.v1.setup.draft`, `lastZone` | a half-typed dish, the last station | under 200 characters |
| `smokebox.v1.setup.examples`, `hiddenStations` | up to 200 ids each | under 5 KB each |

Device settings (same in the demo and the real kitchen, `U.sharedKeys`): theme, otheme, textsize, density, hints, zone, role, sound, volume, speech, voicelevel, callouts, far, wall, dock. Each is a word or a number; together under 1 KB.

In `sessionStorage`: `smokebox.mode` ('demo' or absent), one word, per tab.

## The last good copy (round 7)

Taken after a whole (untrimmed) live save in a real kitchen only (never in the demo): the first save of a session, after every close day, and every 6 hours. It is validated before it is kept and replaces the previous copy. If the live save is found damaged at start-up, the copy is loaded in its place, the damaged text stays set aside under `smokebox.v1.corrupt`, and a notice tells the owner the time of the copy and that later orders are missing. Under quota pressure it is the first thing dropped: when a live save is refused, the copy is deleted and the save retried before any history is trimmed; when the copy itself does not fit it is simply not kept. It is trimmed history, so it never competes for the bulk of the space.

## What happens when the browser is full

`persistNow` (30-store.js) saves everything in one value. If the browser refuses it:
1. The last good copy (next section up) is deleted and the full save is tried once more.
2. It tries again with at most 1,500 tickets and 10,000 events kept (about 2.7 MB for one-line tickets).
2. (Before that, the last good copy is deleted and the full save retried once.) Then it halves both, up to 12 times (750/5,000 is 1.4 MB, 375/2,500 is 0.7 MB, 100/500 is 0.16 MB), stopping when history is already tiny.
4. If nothing fits, the copy in memory stays whole, `status().lastSaveOk` is false and the start-up toast already warns "This browser is not letting Smokebox save".

What is trimmed: the oldest finished tickets and the oldest events. The books stay balanced (used and wasted grams of trimmed tickets move into the ledger).

What is never trimmed (tested in `test/scale-quota.test.mjs`): settings including the PIN hash, the whole menu, the whole ingredient list, stock, open tickets and open orders, batches, the `catalog` marker, and the safety records (temperature readings, discards, cooling, sanitize, keep-serving), which move to the `safetyKeep` bucket and are only dropped after 400 days. The test loads a kitchen with 5,000 tickets into storage that holds a quarter of it and checks all of these after a reload.

Risks to know:
- A paid-up history of 5,000 two-line tickets is 12.6 MB, well over a 5 MB browser limit, so a busy kitchen will see trimming after a few weeks of full history. The backup export allows up to 20 million characters. Recommendation: nudge for a backup, and offer "close the month" that exports and prunes.
- The `corrupt` key can hold a second copy of a large state. Recommendation: remove it after the owner has downloaded it or after 30 days.
- A damaged smaller key never stops start-up (tested for names, sid, outbox, discard log, setup keys, flags): the reader falls back to empty.

## Downgrade note

A kitchen that began empty (`catalog: 'own'`) opened by an older build would have the 21 sample dishes and 15 sample ingredients added back (an older check restores them), and the unknown `modules` setting and `exact`/`hidden` ingredient flags would be ignored. Nothing is lost, but the menu is cluttered and portion-counted dishes lose their counting. Roll back only after taking a backup. Kitchens that are not blank-start (every kitchen saved before the clean start) open in older builds as before, except that settings written by `setPortions`, `addIngredient` and the module switch are ignored.
