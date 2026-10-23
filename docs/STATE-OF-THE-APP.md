# State of the app (for Freddy)

Written from the code, the tests and `git log`, on the main track (`kds/main`, which at this moment equals `kds/integration-main`). Where I could not verify something, it says "not verified". Nothing here has been tried on a real tablet or in a real kitchen.

Short version:
- Smokebox is one HTML file (`dist/smokebox.html`) that runs in a browser with no internet. It is a kitchen board, simple order entry, a cabinet for food cooked ahead, a thrown-out log, a Guide, and back office pages. It starts as an empty kitchen.
- Main track: everything above, one device. Connected track (`kds/connected`): a prototype for several screens through a "main computer" (the hub), pairing and offline page loading. Not part of the normal install.
- Automated checks pass in a desktop browser. Real devices, real kitchens and real servers have never been tried.

## 1. What the app does today, screen by screen

How to open it: build with `node tools/build.mjs --quiet`, then open `dist/smokebox.html` in Chrome or Edge. Add `?demo` to the address for the demo kitchen. Menu paths below start from the board.

**The board (first screen).** Header buttons: station tabs (a tab shows only when a dish is made there; with one station there are no tabs), **Recall**, **86 board**, **Demo**, **New ticket**, **Orders**, **Back office**, and the three-line **Settings** button. A strip under the header shows warnings. On an empty kitchen it offers **Add your first dish**, **Show me how it works** and **Try the demo**.

**Add dishes.** First screen button, or Settings, **Dishes and prices**. Name, price (it shows "Reads as $12.50"), station, **Save and add another**. Rows can be reordered, moved to another menu section, removed (with **Bring it back**), counted ("I count what I made"). **Change stations** renames or hides stations. **More ways to add dishes**: **Have a menu file? Import it** (spreadsheet, or Square, Toast, Clover, Lightspeed item exports) with a preview and **Remove these**.

**Take an order.** **New ticket**: tap dishes, customer, order type (Dine-in, Takeout, Drive-thru, Delivery app), allergy, notes, **Rush ticket**, **Cash** / **Card** / **Pay later**, **Send to kitchen**. An unfinished order is saved and comes back after a reload.

**Run the line.** Each ticket shows a clock and each dish **Start** / **Done**; **Bump** sends the ticket off; **Void ticket** and **Undo** (10 seconds); **Recall**; **86 board** for sold-out items. **Orders** lists open and paid orders and takes payment; **Close the day** is at the bottom of Orders (it can show a drawer count if you type the cash you started with).

**Cabinet (only when "Do you cook food ahead?" is Yes).** A tab on the board with batch cards: **Pull**, **Log temp**, a "..." menu with **Start cooling** and **Discard**. Hot items have a quality limit or a throw-out time; cold items use days in the fridge and hours out of the fridge that the owner types, with **Take out** and **Put back**. Warnings come as a chime, a voice and a strip row. They sound only while the screen is on and the page is open.

**Settings sheet (the three-line button).** Look (Day/Night, text size, ticket size), Sound, Far display, voice call-outs, and links: **Help and about**, **Guide**, **Thrown-out log** and **Readings** (the last two only with cook-ahead on), **Tax, hours and PIN**, **How you serve** (counter service, order buttons, currency symbol), **Tablet checks: screen, sound, home screen**, **Set up this tablet: first steps**, **Pilot visit checklist**, **Start over with an empty menu**, the demo.

**Back office** (the **Back office** button; asks for the PIN if one is set). Seven pages: **Speed**, **Tickets**, **Stations**, **Sales and money** (including Best day of the week), **Safety** (including **Print the food safety record**), **Stock and 86**, **Menu and settings** (Data: backup, restore, spreadsheet files and the pilot report, **Erase tickets and records**, **Erase everything**, safety limits, pacing).

**Guide.** Settings, **Guide**, or `#/guide`: 22 pages and 6 print cards, with search. Source is `docs/sop`; `tools/build-guide.mjs` builds it into the app.

**Tour.** **Show me how it works** on an empty board, or Help and about, **Replay the walkthrough**: eight steps on one demo ticket.

**Demo.** **Try the demo**: a separate kitchen with sample dishes, tickets and history. Its data is kept apart from the real kitchen; **Back to my kitchen** returns.

## 2. Two tracks

| | Main (`kds/main`) | Connected (`kds/connected`) |
|---|---|---|
| What it is | The single-device app above, plus review fixes | Main plus a prototype for several screens |
| Extra | | A "main computer" (the hub, `server/server.mjs`) that keeps one kitchen; **Show only** screens; tablets that take orders through it; pairing codes and per-screen tokens; offline page loading (service worker); `beta.sh` |
| Status | Installable; nothing on a real device | Experimental. The app never starts a hub. Do not run a real kitchen on it. |
| Behind | 41 commits main has that connected does not | 118 commits connected has that main does not |

How to try each:
- **Main:** open `dist/smokebox.html`. Guide: Settings, Guide. Try script: `docs/try-this-first.md`.
- **Two-tab follower trial (connected):** `PORT=8787 SMOKEBOX_FOLLOW_CODE=ABC123 SMOKEBOX_STARTER=1 node server/server.mjs`, then `/?hub&code=ABC123` in one tab and `/?follow&code=ABC123` in another. Steps and a `curl` example: `docs/connected-howto.md`.
- **Two real tablets:** `docs/connected-test-plan.md` (parts 1 to 5, a "what to write down" table and an "if it goes wrong" list).
- **Beta instance on a server:** `bash beta.sh` (connected branch only). It installs a second, separate Smokebox next to the real one. Read `docs/connected-howto.md`. Not run on a real server.
- **Server install:** `go.sh` (installs the app, HTTPS and a nightly update), `tunnel.sh` (a Cloudflare address), `harden.sh` (Caddy access log, fail2ban, security upgrades). All three have tests with stand-ins only.

## 3. What has been verified, and how

Run on this machine today, on the main track, headless Chromium, simulated data:

| Check | Result |
|---|---|
| Unit suite (`node tools/test.mjs`) | 880 of 880 pass on this run. An earlier run the same day, with other agents loading the machine, had 3 timing failures (`metrics.test.mjs` performance limits and `hub-sync` "offline client"). |
| Smoke (`node tools/smoke.mjs`) | 11 of 11 |
| Guide test (`node --test test/guide.test.mjs`) | 15 of 15 |
| Guide walk (`tools/guide-walk.mjs`) | 324 of 324 |
| Guide accessibility (`tools/guide-a11y.mjs`) | 34 of 34 |
| Browser journeys (`node tools/qa.mjs`, `test/e2e/`) | 44 of 45 journeys pass (1085 checks). The one failure is `11c-sixty-tickets`, a timing journey: the 1 Hz tick median (25 ms limit) failed in the full run and the worst single tick (120 ms limit) failed when run alone. The same journey passed in the earlier run today. Machine-dependent. About 17 minutes. |
| Other browser suites | 47 `test/*.e2e.mjs` files exist; I did not run them today (individual agents ran the ones for their own changes). `docs/audit/e2e-triage.md` is from round 1 and is out of date. |

Everything above runs in a desktop browser. "Passes" never means "works on a tablet".

### The independent review (16 findings)

An outside reviewer read the code cold (`docs/audit/independent-review.md` on `kds/night/review-r1`, against `kds/main` 524477d). Status on main now, from the code and the regression tests named `test/review-fix-*.test.mjs`:

| # | Finding | Status |
|---|---|---|
| 1 | A damaged save was overwritten even when the set-aside copy could not be written | Fixed. Never replaced without a kept copy; a boot screen offers **Download the old data** / **Show the data so I can copy it** (`review-fix-store`, `board-review-fixes.e2e`) |
| 2 | Records dropped at load were lost, and the note said nothing changed | Fixed. They are parked, counted in the load message |
| 3 | The hub overwrote an unreadable `state.json` | Fixed. Set aside first; rolling `.bak`; refuses to start on another version (`review-fix-hub`) |
| 4 | A cook could replace the manager PIN and the recovery code | Fixed. Changing the PIN or making a new code asks for the current PIN (the Guide walk drives it) |
| 5 | One forward clock blip moved the app clock and discarded every batch | Fixed. A jump over 36 hours is held and the owner is asked: **Keep the old time** / **Use the new time** |
| 6 | The thrown-out log covered only the last 150 to 200 batches | Fixed. Built from the safety record; says what range it covers |
| 7 | One stalled event-stream client made hub memory grow | Fixed. Dropped past a backlog limit |
| 8 | Backups with huge prices produced Infinity/NaN totals | Fixed. Bounded (`review-fix-money`) |
| 9 | The order screen's tax preview could differ by a cent | Fixed. It uses the engine's own whole-cent rule |
| 10 | Re-paying a reopened order from a closed day counted it twice | Fixed. Reopening is refused in plain words |
| 11 | Spreadsheet formula injection in the thrown-out log CSV | Fixed. One guarded CSV cell helper |
| 12 | The menu importer was quadratic on long runs of spaces | Fixed. Linear time and a "line too long" message (`review-fix-import`) |
| 13 | PIN and recovery hashes were unsalted | Partly. Salted and slowed (PBKDF2). A 4-digit PIN is still a door latch (`review-fix-pin`) |
| 14 | The nightly update ran at 04:30 UTC; the hub forgot answered actions on restart | Partly. The update timer now uses the server's time zone. The main-track hub has no write-ahead log; the connected hub has one |
| 15 | Update and install trust one unsigned branch download as root | Partly. Special files in the archive are rejected, and signed builds are checked only if a public key is installed. `tunnel.sh` still installs the latest `cloudflared` without a checksum. No Content-Security-Policy. |
| 16 | Start over was not behind the PIN and erased before the backup download | Fixed. PIN first, backup file downloaded and confirmed before anything is erased |

The 8 "suspected" items: cold time above the limit now adds up across readings (fixed); two tabs overwriting each other (fixed, `review-fix-twotabs`); the safety record keeps entries for about 400 days (changed; the app's own setting, read from the engine); safety-limit changes are recorded with old and new values (done, shown in the safety record); a restore keeps a copy for 7 days (done, with **Undo this restore** on the Data page); invisible direction characters are stripped from names (fixed, `review-fix-text`); Caddy password rate limit (`harden.sh` adds a fail2ban jail, not run on a real host); hostile backup data in the screens (A1's pass, `docs/audit/dom-injection.md`, found one tour selector, since fixed).

Not covered by the review: real browsers, the connected branch, `tools/`, performance.

## 4. What has never been verified

- Any real tablet, phone, TV or iPad, including Android Chrome and Safari on iPad (sound unlock, keep-awake, storage eviction after about a week).
- Any real kitchen, cook, owner or service. The 15-minute setup time is a model, not a person.
- Audio: tones and the spoken voice have never been heard through a real speaker or from the pit.
- Printing: the Guide cards, the thrown-out log, the daily summary and the recovery code print only in the test browser's print mode.
- Real server runs of `go.sh`, `tunnel.sh`, `harden.sh`, `beta.sh` and the nightly updater. They are tested against scratch folders with stand-ins for systemd, Caddy and `useradd`.
- The hub on a real network: Wi-Fi drops, captive portals, proxies that buffer streams, a long run, a power cut.
- Offline page loading on a real device; plain-http limits and iPad storage clearing are reported by the builders, not tested.
- Pairing on real hardware.
- Whether any local health department accepts the printed record. Nothing in the app is a compliance claim, and none of the legal numbers in the research were read from the codes themselves (`docs/research` says so).
- Whether anyone would pay for it. That is a business question and is not covered here.

## 5. Known bugs and limits

| Item | Owner |
|---|---|
| Single device: no sync between tablets on main | A5 (connected track) |
| Warnings sound only while the screen is on and the page is open | A1 |
| Main-track hub has no write-ahead log; an answered action resent after a hub restart can be applied twice | A5 |
| Updates are unsigned unless a public key is installed; `tunnel.sh` takes the latest `cloudflared` with no checksum; no Content-Security-Policy | A6 |
| A 4-digit PIN stays a door latch; a copy of a backup can be attacked offline (slowed, not stopped) | A5 |
| Timing tests (`metrics.test.mjs` performance limits, `11c-sixty-tickets`) fail on a slow or loaded machine; `hub-sync` "offline client" is flaky under load | A6 |
| `docs/audit/e2e-triage.md` is round 1 and out of date | A6 |
| Demo kitchen and the first starter names are barbecue; new kitchens start with neutral names | A2 |

Done since the first version of this page: the thrown-out log and safety record read the keep time from the engine (about 400 days, no number repeated in the Guide) and the log says how far back it goes; **Undo this restore** on the Data page (kept for N days, confirm, then the PIN if one is set); the safety record has "Changed the cold limit from X to Y" lines and cold readings say "above the cold limit" with the minutes already used. The Guide describes each and the walk checks each label. **Close the month** (three steps, five downloaded files, typed word CLOSE, Undo for 7 days, refusals for out-of-date files, hub tablets, the demo and nothing to close) is in the build, has a Guide page, and the walk runs all of it. Its limits: the last 35 days and all safety records always stay, the files are the only copy afterward, and there is no Data page button for it in the build yet.

## 6. Change log by day part

Times are commit timestamps on `kds/main` (465 commits). The first 41 were the handoff on 2026-10-18.

**Before the night (10-18 to 10-22, 44 commits):** the handoff import (engine, board, back office, hold cabinet, 86 board, warnings, pilot report), then the pilot report and a saved sound log.

**Overnight (10-23, 00:00 to 06:59, 178 commits)**
- *Empty first run:* real kitchens start empty; "Add your first dish", Dishes and prices, Tax, hours and PIN; the demo is isolated with its own saved keys.
- *Board:* roles and routes, quiet board and overdue ranking, wall mode, voice call-outs, allergy-first notes, far display, Night contrast.
- *Setup:* station rename and hide, undo and bring-back, cook-ahead setting, portions on hand, dish reorder, price reading, menu importer.
- *Back office:* at a glance, Close the day, three-card Data flow, typed-word reset, sales CSV, honest analytics wording.
- *Guide:* 14 pages, pictures, print cards, search, walk and accessibility checks.
- *Storage and speed:* last-good copy, adaptive save delay.
- *Hub prototype:* SSE broadcast, action log, client sync, one-command server setup.

**Morning (10:00 to 12:59, 100 commits)**
- *Money and time:* whole-cent money with half-cent tax rounded up, prices and tips bounded, DST-safe service days.
- *Start over with an empty menu*, with a backup.
- *Counter service, order buttons, currency symbol, draft order restore.*
- *Server:* one-line installer with a nightly self-update, then a safe updater with rollback; hub security limits and a cross-site guard.
- *Guide:* setup recipes, During service card, tour cut to eight steps, wording audits; wording changes to throw-out time, Keep serving, no Taste-it advice.
- *Research:* market practice and food-holding research notes.

**Afternoon (13:00 to 18:59, 122 commits)**
- *Cold items:* fridge days and hours out typed by the owner, **Take out** / **Put back**, cooling readings, a safety record that now includes readings, thermometer checks and strip entries.
- *Tablet:* Tablet checks and a pilot visit checklist; Readings.
- *Pilot report:* unknown discard cost stays unknown, acknowledged warnings, undo counts, a Gates block (on A3's branch history).
- *Guide:* cold items page, Readings page, Get the tablet ready, owner quick start, a research cross-check, PIN recovery code and Start over flow updates.
- *Review fixes (1 to 3, 7, 12, 13, thrown-out log, CSV guard)*, optional hardening scripts, the cold-time accumulation fix, new Start over flow and PIN guards, clock-jump strip.
- *Merged into main late:* A5's fix2 (restore copy, 400 days, limit-change recording) and A3's fix2 (Undo this restore, the new safety record lines, the log range sentence, keep time read from the engine).

The connected track (118 commits not on main) added: the follower, tablets writing through the hub, undo rules, last-known kitchen, pairing, offline loading, beta scripts, and their docs.

## 7. How to run the tests

Needs Node 22 or later. The browser tools need Playwright and the Guide and audit tools need `acorn`: put them in `node_modules` here, or set `SMOKEBOX_TOOLS=/path/to/folder` (a folder with `node_modules`, or the `node_modules` itself). The old default `/opt/npm-tools` is also tried. Chromium is taken from Playwright, or set `PW_CHROMIUM`; some of my scripts also use `/opt/pw-browsers/chromium`.

| Command | What it runs | Time on this machine |
|---|---|---|
| `node tools/build.mjs --quiet` | builds `dist/smokebox.html` (run first) | seconds |
| `node tools/test.mjs [pattern]` | every `test/*.test.mjs` unit file (868 tests) | 13 s early in the day; about 200 s today with other agents running |
| `node tools/smoke.mjs` | 11 boot checks in a browser | 5 s |
| `node tools/comment-audit.mjs` | comment rules (needs `acorn`) | seconds |
| `node --test test/guide.test.mjs` | Guide data, word limits, bold labels exist in the app | 5 s |
| `node tools/build-guide.mjs --check` | the Guide in the app matches `docs/sop` | 1 s |
| `node tools/guide-walk.mjs` (`WALK_ONLY=recipes|import|cold|readings|screens|pairing|startover|notices`) | clicks through the built app for every step the Guide describes (273 checks) | about 4 to 5 minutes; the several-screens part waits about a minute |
| `node tools/guide-a11y.mjs` | 34 accessibility and print checks on the Guide | about 1 minute |
| `node tools/qa.mjs [--only word] [--no-report]` | the `test/e2e/` journeys | 15 minutes or more |
| `node tools/run-slow.mjs <name>\|all` | one slow suite, or all of them, with a time limit and a log | varies |
| `node test/<name>.e2e.mjs` | single browser suites (for example `board-round16`, `follower`, `hub-client`) | 5 seconds to several minutes |
| `npm run bootcheck` | old saved kitchens still load | seconds |
| `node tools/extract-strings.mjs` | writes `docs/audit/strings.tsv` (every owner-visible string) | seconds |

Known flaky or machine-dependent: `11c-sixty-tickets` in `tools/qa.mjs` (timing limits); the 5000-ticket performance tests in `metrics.test.mjs` (timing limits); `hub-sync` "an offline client queues actions" under load; the follower "Out of date" banner check in the Guide walk if two walks run at once (they use fixed local ports); `ux-sound-leader` under load (round 1 note). Run the walk and the `qa` journeys one at a time.

Never run a test file in `test/e2e/` with plain `node`: it "passes" having run nothing. Use `tools/qa.mjs`.
