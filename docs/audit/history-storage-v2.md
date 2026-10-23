# History storage v2: moving closed history out of the browser's 5 MB (design only)

Written on `night/a5-history`. Not built. It follows `history-storage-design.md` (v1, which only split the save into day keys) and replaces its idea
with a real second store. All numbers are measured with `tools/endurance.mjs` unless marked as a guess.

## 1. The problem in numbers

- A browser gives the whole app about 5 million characters of localStorage (both bytes and characters, about 5 MB). Everything is one JSON value.
- A finished ticket costs about 1.64 KB saved: the ticket 510 B, its order 290 B, and about 6 events 840 B (events are half the bytes).
  The last-good copy (300 tickets and 2,000 events) is another 40 percent of a small kitchen's save.
- So 5 MB holds about 2,000 to 2,500 tickets once the copy and the settings are counted: **7 days at 250 tickets a day, 27 days at 80 a day**.
  The engine's own caps (5,000 tickets, 40,000 events) are looser than the browser's space, so the browser is the limit.
- When the space runs out the store halves the history it saves (1,500 tickets, 10,000 events, then less). Memory keeps everything until the
  page is reloaded, then the older days are gone. Without a nudge that is silent; v1 of this work (history fill, the 70 and 85 percent notices,
  Close the month with an adaptive window) makes the loss visible and avoidable, but it makes a busy kitchen export every 2 to 3 days.
- A kitchen that never closes the month, or a tablet that the browser clears (see section 6), loses everything older than a week.

## 2. What must stay synchronous

The engine is a pure function of the state and every tap calls it; the board redraws on the result; `pagehide` must save in the same task.
So the **hot state** stays in localStorage exactly as now: menu, ingredients, settings (PIN hash), stock and ledger, open tickets and orders,
batches, planned items, the undo list, the last few days of finished tickets and orders (the window), the recent events, and the safety records
(the safety bucket is small: about 250 B per entry, 10 to 20 a day, 400 days is about 1.5 MB at the very most, usually under 1 MB; this is the one
thing that must never go to a store that can be cleared separately).

## 3. What moves: closed days, as one record per service day

IndexedDB holds the **cold history**: one record per closed service day, `{ day, tickets[], orders[], events[] (non-safety), closedAt, schema }`,
key = the day text. `day_closed` events and all safety events stay hot (they are the books and the legal record). IndexedDB is asynchronous,
transactional, stores structured clones (no JSON round trip) and gives hundreds of MB (Chrome: a share of free disk; Safari: about a gigabyte
without asking, less in private browsing). A year of a 250-ticket kitchen is about 150 MB of JSON, about 90 MB structured; fine.

**Roll-off:** when a day is closed and older than the hot window (default 3 to 7 days), one transaction writes its record to IndexedDB, and only
after the transaction commits does the hot state drop those tickets/orders/events (this replaces today's silent drop). Close the month stays as the
export-to-files feature (the owner's own durable copy) and now reads cold days too.

**Reads:** office pages and metrics take a dataset. The dataset for "last 7 days" is the hot window and is synchronous as today. For a longer range
the page calls `await store.loadRange(from, to)`, which reads the day records and returns a merged dataset (memoized; kept off the main state).
Every metrics function stays pure; only the call that builds the dataset becomes async. This is the biggest change to the office pages (A3).

## 4. Migration of existing saves

First start of the new build: if the saved state has finished days older than the hot window, write them to IndexedDB (one transaction per day,
resumable), verify the count by reading back, then save the smaller hot state. If IndexedDB is missing or refuses (some private modes, lockdown
modes), nothing moves and the store behaves as today with the nudges. A marker `coldVersion` in the hot state says the split is active; a
downgrade to the old build still loads the hot state (it just does not see old days; a banner says so).

## 5. Backup, restore, hub

- **Backup** becomes async: `exportAll()` returns hot state plus all cold days (or the screen offers "last 30 days" and "everything"). The file
  format gains a `cold` section; old files still load. Size grows with history (a year about 150 MB: too big for one JSON string in memory on a
  tablet, so the file should be written in parts or as newline-separated day records; a real risk, see 8).
- **Restore** writes cold days to IndexedDB and the hot state to localStorage in that order; a failure in between leaves the old kitchen intact
  (the before-restore copy already exists and must include cold days or say it does not).
- **Hub:** the hub keeps its own full history in its data file (server disk), so hub-mode tablets need only the hot window plus a "load older days from
  the hub" call. Followers stay as they are (trimmed snapshots). The hub's write-ahead log is unaffected.
- **Two tabs:** IndexedDB is shared; roll-off runs under the existing Web Lock; readers see committed days only. A tab that sees a day in both hot
  state and cold (crash between write and prune) drops the hot copy (days are identified by id, so duplicates are harmless).

## 6. Safari and iPad

- Safari removes script-written storage (localStorage and IndexedDB, together) after about 7 days without the site being opened, **unless the page
  was added to the Home Screen** (installed). This is the largest risk to history on an iPad, independent of size. `navigator.storage.persist()` is
  supported in Safari 17+ for installed apps only; in a tab it answers false. v1 asks at start and `historyFill().persisted` reports the answer,
  so the owner can be told to install the app.
- Chrome grants persistence by heuristics (site engagement, installed); Firefox asks the user.
- Cold history is not safer than hot state against eviction (same origin storage). It only fixes **capacity**. The durable copy is still the owner's
  monthly files and the daily backup.

## 7. Failure modes and answers

| Failure | Answer |
|---|---|
| IndexedDB unavailable or refuses | Do not split; keep today's behavior and nudges; say so in the Data page. |
| Browser clears IndexedDB but not localStorage | Hot state records `coldDays` and a count; a mismatch shows "older days are missing from this tablet; restore the monthly files". |
| Crash between the cold write and the hot prune | Duplicates are harmless (same ids); the next roll-off removes the hot copy. |
| Crash after the hot prune but before the cold commit | Impossible by order: the prune happens only after the commit callback. |
| Quota error on IndexedDB | Stop rolling off, nudge, keep hot history (falls back to today's behavior). |
| Slow reads on old tablets | Day records are small (about 150 KB); reads are one `getAll` over a key range; load only what the page asks for. |
| A bug corrupts cold records | Each record carries a checksum (sha256 of its JSON); a bad day is skipped and reported, never half-shown. |

## 8. Stepwise plan (agent-rounds are my estimate; one round = one focused session of one agent plus review)

1. **Event diet (cheap, no new store).** Drop non-safety, non-day-closed events older than 3 days from the saved copy (or never write
   `item_fired`/`item_done`/`order_opened` events once the ticket carries the same timestamps). Events are 51 percent of the bytes, so
   250 a day goes from 7 to about 14 days, 80 a day from 27 to about 55. **1 round.** Risk: metrics that read events (check each).
2. **Compact saved form: DONE on `night/a5-compact`** (keys and repeated strings dictionary-coded, lossless, 56 percent of the plain size, 250 tickets a day now
   lasts about 15 days instead of 7). The event diet in step 1 was not done: the events are read by metrics, undo and the event export, so removing them is not
   lossless for those readers.
3. **Cold store module:** an IndexedDB wrapper with per-day records, checksums, lock, in-memory fake for tests, feature test, fallbacks. **2 rounds.**
4. **Roll-off and hot window, migration.** **2 rounds.** Riskiest part for data (the order of write and prune, the first run on real saves).
5. **Async dataset for office pages and metrics.** **2 to 3 rounds** (A3's pages; every page that reads `dataset()`); riskiest for regressions.
6. **Backup/restore/export with cold days** (streamed file format). **2 rounds.** Riskiest for losslessness and memory on tablets.
7. **Hub: load older days from the hub; follower unchanged.** 1 round.
8. **Eviction detection, persist UX, Data page wording.** 1 round.

Total about 12 to 14 rounds; steps 1 and 2 are worth doing alone (about 2 rounds for a 2 to 3 times larger window). Steps 3 to 8 are the real fix.

## 9. Recommendation

1. Ship now what exists: history fill, the 70 and 85 percent nudges, Close the month with the adaptive window, `persist()`. They stop silent loss.
2. Do steps 1 and 2 next (about 2 rounds, no new storage, no migration risk beyond a changed save shape).
3. Decide on the IndexedDB split after the pilots: if pilot kitchens stay under about 100 tickets a day, steps 1 and 2 plus monthly files are enough
   (a month of 100 a day is about 2,900 tickets after the diet and compaction would fit in about 3 MB). If pilots show 150 a day or more, build
   steps 3 to 8, starting with a flag-guarded cold store (3, 4) and only then touching the office pages (5).
4. Whatever is built: keep the safety records and the books hot, never let a roll-off run without a committed cold write, and keep the owner's
   monthly files as the durable record (Safari can clear everything).
