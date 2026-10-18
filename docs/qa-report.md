# Smokebox QA report

Run: 2026-10-18 06:09 UTC  |  build: dist/qa.html, 1539 KB, source fingerprint 72a16f65  |  machine load 1.4 0.6 0.4  |  Chromium via Playwright

**45 pass, 0 fail, 0 skip** (45 tests, 1089 checks, 781 s of test time).

Run it again with `node tools/qa.mjs` (about every 10 minutes at most: the machine is shared). The suite never edits app files.

## Results

| id | test | result | s | checks | suspected owner |
|---|---|---|---|---|---|
| 01-first-run | First run boots clean and the board is ready to use | PASS (earlier run) | 4.8 | 23/23 | Floor board |
| 02a-send-ticket | Cook: New ticket with 4 items, a modifier, customer, channel, note, Send | PASS (earlier run) | 2.9 | 16/16 | Floor sheets |
| 02b-advance-bump-undo | Cook: tap items, All done here, Bump, Undo, 10 s drain | PASS (earlier run) | 19.0 | 21/21 | Floor board |
| 02c-bump-anyway-void-recall | Cook: Bump anyway confirm, Void with a reason, Recall sheet | PASS (earlier run) | 6.5 | 16/16 | Floor board |
| 02d-fire-rush | Cook: Start now on a waiting item, Rush toggle on a slip | PASS (earlier run) | 3.3 | 10/10 | Floor board |
| 03a-station-views | Station views PIT/HOT/FRY/CLD/EXP show the right items and the counts match | PASS (earlier run) | 4.8 | 32/32 | Floor board |
| 03b-keyboard | Keyboard shortcuts N R H 8 D 1..6 Z Esc work and stay quiet while typing | PASS (earlier run) | 13.8 | 30/30 | Floor board |
| 04a-hold-cabinet | Hold cabinet: log a temperature, thermal brisket batch yield, below 135 wording, safety line | PASS (earlier run) | 12.4 | 33/33 | Floor sheets |
| 04b-lockout-86 | A batch under 135 F for 2 hours is discarded and its menu items go 86 (safety hold) | PASS (earlier run) | 13.1 | 9/9 | Floor sheets |
| 04c-board-86 | 86 board: manual 86 hides the item from the order screen, Back on restores, sync strip is labelled Simulated | PASS (earlier run) | 8.7 | 17/17 | Floor sheets |
| 05-demo-flow | Demo: orders + crew at x15 move tickets, 12-ticket rush, Reset live data with confirm | PASS (earlier run) | 30.1 | 35/35 | Sim |
| 06a-gesture-and-exits | Secret door: 5 fast taps open, 4 or 5 slow taps do not, Ctrl+Shift+O, deep link, three ways out | PASS (earlier run) | 30.9 | 25/25 | Lead (wave-1 files) |
| 06b-reduced-motion | Secret door with reduced motion: short cross-fade, no ember ring or smoke | PASS (earlier run) | 6.1 | 6/6 | Lead (wave-1 files) |
| 06c-pin | PIN: set in Data, gates the next entrance, wrong PIN refused, 5 wrong lock 30 s | PASS (earlier run) | 28.8 | 28/28 | Office C |
| 06d-office-button | Back office button: named and visible at every width, opens the office, asks the PIN, header stays on one row | PASS | 23.1 | 23/23 | Office C |
| 07a-pages-sample | Office: all 7 pages render with the sample history, no NaN, no empty frames, View as table works | PASS (earlier run) | 11.8 | 101/101 | Office A |
| 07b-pages-live-only | Office: all 7 pages with Live only and no data say "Not enough data" and never draw zeros or NaN | PASS (earlier run) | 7.5 | 52/52 | Office A |
| 07c-filters | Office: range, channel and source filters change the numbers and add up | PASS (earlier run) | 11.4 | 15/15 | Office A |
| 07d-gantt-themes-keys | Office: ticket gantt opens from Tickets, Ember and Paper themes, [ and ] keys | PASS (earlier run) | 16.2 | 20/20 | Office A |
| 07e-data-page | Data page: edit a price, bounds refusal, export JSON, import valid file and garbage, reset flows | PASS (earlier run) | 21.3 | 49/49 | Office C |
| 08a-reload-keeps | Persistence: reload keeps tickets, item progress, 86, settings, theme and the running clocks | PASS (earlier run) | 6.4 | 11/11 | Lead (wave-1 files) |
| 08b-two-pages-sync | Persistence: two pages in one browser stay in sync and never duplicate ticket numbers | PASS (earlier run) | 39.9 | 15/15 | Lead (wave-1 files) |
| 08c-corrupt-storage | Persistence: corrupt or odd saved data starts fresh, keeps a copy, and TELLS the user | PASS (earlier run) | 13.4 | 50/50 | Lead (wave-1 files) |
| 08d-storage-blocked | Persistence: with browser storage blocked the app still runs and says it cannot save | PASS (earlier run) | 0.9 | 7/7 | Lead (wave-1 files) |
| 09a-floor-viewports | Viewports: the board at 2560, 1280, 1024, 390 and 280 wide in Day, Night and large text | PASS (earlier run) | 14.9 | 45/45 | Floor board |
| 09b-sheets-wide | Viewports: every sheet at 2560, 1280 and 1024 wide | PASS (earlier run) | 67.9 | 21/21 | Floor sheets |
| 09c-sheets-narrow | Viewports: every sheet at 390 (touch) and 280 wide | PASS (earlier run) | 43.8 | 14/14 | Floor sheets |
| 09d-office-wide | Viewports: the 7 office pages at 2560, 1280 and 1024 wide (Ember, and Paper at 1280) | PASS (earlier run) | 48.2 | 40/40 | Office A |
| 09e-office-narrow | Viewports: the 7 office pages at 390 (touch) and 280 wide (Ember, Paper, large text) | PASS (earlier run) | 47.7 | 40/40 | Office A |
| 10a-no-network | Offline: only Google Fonts is requested, no fetch/XHR/beacon/socket, and it works with the network off | PASS (earlier run) | 22.2 | 11/11 | Lead (wave-1 files) |
| 10b-artifact-host | Host: node test/artifact.e2e.mjs still passes (artifact build in a mock host page at 1280 and 390) | PASS (earlier run) | 3.2 | 1/1 | Lead (wave-1 files) |
| 11a-startup-and-sample | Performance: time to first paint, boot, SB.sim.sample() cold and memoised | PASS (earlier run) | 4.0 | 8/8 | Lead (wave-1 files) |
| 11b-office-render | Performance: render time of each office page (with 14 days of sample history) | PASS (earlier run) | 12.1 | 6/6 | Office A |
| 11c-sixty-tickets | Performance: 60 active tickets on the board, 1 Hz update cost and frame health | PASS (earlier run) | 7.8 | 10/10 | Floor board |
| 12a-structure | Accessibility: landmarks, names on every control, label-in-name, ids, roles, headings (floor, sheets, office) | PASS (earlier run) | 21.6 | 40/40 | Lead (wave-1 files) |
| 12b-keyboard | Accessibility: keyboard order, no trap on the board, sheets trap focus and give it back | PASS (earlier run) | 6.3 | 12/12 | Floor sheets |
| 12c-live-regions | Accessibility: screen reader announcements per minute while the demo runs | PASS (earlier run) | 33.1 | 7/7 | Floor board |
| 12d-contrast-floor | Accessibility: contrast of all visible text on the board and sheets, Day, Night and large text | PASS (earlier run) | 23.2 | 10/10 | Floor board |
| 12e-contrast-office | Accessibility: contrast of all visible text on the 7 office pages in Ember and Paper | PASS (earlier run) | 21.1 | 5/5 | Office A |
| 13a-tour-full-loop | Walkthrough: all nine steps with real clicks, from start to Done | PASS (earlier run) | 12.3 | 48/48 | Floor board |
| 13b-tour-skip-escape | Walkthrough: Skip and Escape stop it cleanly and put the clock back; restart begins again | PASS (earlier run) | 3.0 | 13/13 | Floor board |
| 13c-tour-out-of-order | Walkthrough: doing things in another order never strands the caption | PASS (earlier run) | 13.3 | 12/12 | Floor board |
| 13d-tour-pauses | Walkthrough: the caption steps aside for a sheet or the office and comes back at the same step | PASS (earlier run) | 6.8 | 11/11 | Floor board |
| 13e-tour-layouts | Walkthrough: the card stays on screen and off the ring on a phone and in Large text | PASS (earlier run) | 20.7 | 57/57 | Floor board |
| 13f-tour-busy-board | Walkthrough: with other tickets on the board the new ticket is found and the card sits beside it | PASS (earlier run) | 10.4 | 34/34 | Floor board |

## Failures by suspected owner

None.

## Skipped (feature not built yet, or not measurable here)

None.


## Measurements

Numbers from this run on a shared 2-core machine (several agents run at once), so read them as upper bounds.

| test | what | value |
|---|---|---|
| 02b-advance-bump-undo | undo toast lifetime | 9.8 s |
| 05-demo-flow | demo x15: real seconds until 3 tickets sent and 1 finished | 20 s |
| 05-demo-flow | demo x15: tickets sent while watching | 8 tickets |
| 05-demo-flow | demo x15: tickets finished by the crew while watching | 1 tickets |
| 05-demo-flow | clock speed after Reset live data (the demo was running at x15) | x15 |
| 06b-reduced-motion | reduced-motion open time | 20 ms |
| 06b-reduced-motion | normal motion: the ember ring stays in the page for | 442 ms (the ignition is meant to run about 720 ms) |
| 06c-pin | PIN grace: re-entry straight after leaving asks for the PIN? | no (2-minute grace, as the Data page says) |
| 07e-data-page | backup file size | 18 KB |
| 08c-corrupt-storage | browser dropped all storage on reload, case repeated: a bare number | 1 x |
| 09a-floor-viewports | inner horizontal scrollers (board 280) | day/normal: div.fl-dock-list 1706>94 | night/normal: div.fl-dock-list 1706>94 | day/large: div.fl-dock-list 1950>75 | night/large: div.fl-dock-list 1950>75 |
| 09a-floor-viewports | inner horizontal scrollers (board 390) | day/normal: div.fl-dock-list 1706>204 | night/normal: div.fl-dock-list 1706>204 | day/large: div.fl-dock-list 1950>185 | night/large: div.fl-dock-list 1950>185 |
| 09a-floor-viewports | inner horizontal scrollers (board 1024) | day/normal: div.fl-dock-list 1706>717 | night/normal: div.fl-dock-list 1706>717 | day/large: div.fl-dock-list 1950>680 | night/large: div.fl-dock-list 1950>680 |
| 09a-floor-viewports | inner horizontal scrollers (board 1280) | day/normal: div.fl-dock-list 1706>973 | night/normal: div.fl-dock-list 1706>973 | day/large: div.fl-dock-list 1950>936 | night/large: div.fl-dock-list 1950>936 |
| 09a-floor-viewports | inner horizontal scrollers (board 2560) | day/normal: div.fl-dock-list 2558>2119 | night/normal: div.fl-dock-list 2558>2119 | day/large: div.fl-dock-list 2925>2063 | night/large: div.fl-dock-list 2925>2063 |
| 09a-floor-viewports | at 280 wide the slips are this wide / in this many columns | 257, 257, 257, 264, 264, 264, 264 px / 2 |
| 09d-office-wide | inner horizontal scrollers (office 1024 ember) | Tickets: div.of-tablewrap 920>839 | Data and settings: nav.od-toc 931>921 |
| 09e-office-narrow | inner horizontal scrollers (office 390 ember) | Data and settings: nav.od-toc 923>375 |
| 09e-office-narrow | inner horizontal scrollers (office 390 paper) | Data and settings: nav.od-toc 923>375 |
| 09e-office-narrow | inner horizontal scrollers (office 390 ember large text) | Tickets: div.of-tablewrap 313>309 | Data and settings: nav.od-toc 1027>375 |
| 09e-office-narrow | inner horizontal scrollers (office 280 ember) | Tickets: div.of-tablewrap 279>199 | Data and settings: nav.od-toc 851>265 |
| 10a-no-network | built file size | 1519 KB |
| 10a-no-network | page requests (http/https) in a full walk of floor + 7 office pages | 1 requests |
| 10b-artifact-host | artifact host checks passed | 18 checks |
| 11a-startup-and-sample | machine load average (1 min, 2 cores shared) before the probes | 1.3 |
| 11a-startup-and-sample | first paint (median of 3 cold loads) | 280 ms |
| 11a-startup-and-sample | first contentful paint (median of 3) | 428 ms |
| 11a-startup-and-sample | DOMContentLoaded (parse + run all scripts, median of 3) | 354.7 ms |
| 11a-startup-and-sample | SB.booted true (median of 3) | 359.7 ms |
| 11a-startup-and-sample | board has slips or the empty state painted (median of 3) | 359.7 ms |
| 11a-startup-and-sample | JS heap after boot | 10 MB |
| 11a-startup-and-sample | SB.sim.sample() cold (14 days) | 963.6 ms |
| 11a-startup-and-sample | SB.sim.sample() generatedMs reported by the simulator | 963 ms |
| 11a-startup-and-sample | SB.sim.sample() second call (memoised) | 0 ms |
| 11a-startup-and-sample | sample history size | 2470 tickets, 33323 events, 14 days, tickets JSON 3174 KB |
| 11b-office-render | deep link #/office/pace to first chart in the DOM (includes the 0.7 s ignition) | 4 ms |
| 11b-office-render | office page "data" navigate to painted | 181.6 ms |
| 11b-office-render | office page "stock" navigate to painted | 282.9 ms |
| 11b-office-render | office page "safety" navigate to painted | 75.1 ms |
| 11b-office-render | office page "money" navigate to painted | 98.7 ms |
| 11b-office-render | office page "stations" navigate to painted | 81.3 ms |
| 11b-office-render | office page "tickets" navigate to painted | 92.2 ms |
| 11b-office-render | office page "pace" navigate to painted | 75 ms |
| 11b-office-render | office page "pace" navigate to painted | 13.3 ms |
| 11b-office-render | long tasks (over 50 ms) while paging through the office | 166, 276, 65, 76, 75, 82, 70 ms |
| 11b-office-render | Pace: change the date range to 7 days, until painted | 52.7 ms |
| 11c-sixty-tickets | slips on the board after creating 60 tickets | 63 slips |
| 11c-sixty-tickets | board full render with that many slips (lastRenderMs) | 66.3 ms |
| 11c-sixty-tickets | 1 Hz tick with 63 slips: median cost | 0.7 ms |
| 11c-sixty-tickets | 1 Hz tick: worst cost seen (maxTickMs) | 0.8 ms |
| 11c-sixty-tickets | frames in 6 s / frames slower than 50 ms / worst frame | 265 / 1 / 52 ms |
| 11c-sixty-tickets | long tasks over 50 ms during the 6 s | none ms |
| 11c-sixty-tickets | one "All done here" on a board of 60: dispatch to painted | 49.7 ms |
| 12a-structure | landmarks on the board | main 1, banner 1, nav 0, tablist 1, h1 1, skip link 1 |
| 12a-structure | interactive controls on the board | 49 controls |
| 12b-keyboard | distinct tab stops reached in 70 presses on the board | 45 stops |
| 12c-live-regions | screen reader announcements during 30 s of the demo at x15 (distinct) | 3 announcements |
| 12c-live-regions | announcements per real minute at x15 | 6 /min |
| 12c-live-regions | sample of what was announced | "Ticket #105 added for Grubhub 1539." | "Ticket #106 added for Lane 1 car 9." | "Ticket #112 added for Dev." |
| 12d-contrast-floor | board day: text elements checked / worst ratio / over an image or gradient (not judged) | 127 / 4.54 / 0 |
| 12d-contrast-floor | board night: text elements checked / worst ratio / over an image or gradient (not judged) | 127 / 4.54 / 0 |
| 12e-contrast-office | office ember: text elements checked | 1714 elements |
| 12e-contrast-office | office paper: text elements checked | 1714 elements |

## Visual defects seen in the screenshots

Found by looking at the contact sheets (not by a script).

| # | where | what | owner | screenshot |
|---|---|---|---|---|
| V1 | Board, all-day dock, 1280 and 390 wide | The last chip in the all-day bar is cut in half at the right edge ("Fried pickles x1" at 1280, "Co" and "Frie" at 390) and nothing shows that the bar scrolls sideways (no fade, arrow or scrollbar at rest). .fl-dock-list is the intended inner scroller, but a cook cannot tell that more chips exist. | Floor board | contact-floor.png |
| V2 | Office, page title of Tickets, Stations, Sales and money, Safety, Stock and 86, Menu and settings (Ember and Paper, also 280 and 390) | After moving to a page from the left rail the title (h1) is drawn inside a thick focus-ring box; only Pace (the first page) has no box. It looks like a stray frame around the heading. Move focus to the heading without a visible ring (the ring is for keyboard users on controls), or keep it only when the move came from the keyboard. | Office A | contact-office-ember.png |
| V3 | Office Tickets, "How long tickets take" chart | The reference-line label "Warn 7m 56s" runs into the red Overdue line: the last characters ("56s") are crossed by the line. The label should sit on the other side of its line or be pushed left. | Lead (wave-1 files) | contact-office-ember.png |
| V4 | Office Stations, "Items waiting at each station" area chart | The direct labels at the right end of the series (Cold and drinks, Fry, Hot sides, Pit) are packed 12 px apart and the lowest one, "Pit", sits on the x-axis baseline so the line strikes through the word. Readable but cramped. | Lead (wave-1 files) | contact-office-ember.png |
| V5 | Office Pace at 280 wide, headline | A duration is broken across two lines: "within 9m" at the end of one line and "03s;" at the start of the next. A time such as 9m 03s should never split (use a no-break space between the minute and second parts). | Office A | contact-narrow.png |
| V6 | Office bottom tab bar at 280 and 390 wide | The seven tab labels (Pace, Tickets, Stations, Money, Safety, Stock, Data) are 9.5 to 10.5 px (30-office.css lines 243 and 285): hard to read on a phone held at arm's length in a kitchen. | Office A | contact-narrow.png |
| V7 | Any sheet that is open when a toast appears (280, 390 and 1280) | The "Order discarded." toast is drawn over the lower part of the open sheet and hides content (the Nothing has been 86'd lines, the Discard button of a hold card). It goes away by itself after a few seconds, but while it is up it covers a control the cook may want. | Lead (wave-1 files) | contact-narrow.png |

## Screenshots index

Contact sheets (many pictures on one image, made by `node tools/qa-contact.mjs`):

- test/.out/qa/contact-floor.png
- test/.out/qa/contact-narrow.png
- test/.out/qa/contact-office-ember.png
- test/.out/qa/contact-office-paper.png
- test/.out/qa/contact-sheets.png

Per test (folder test/.out/qa/):

- 01-first-run: first-run-1280.png
- 02a-send-ticket: cook-order-filled.png
- 02b-advance-bump-undo: cook-after-undo.png
- 02c-bump-anyway-void-recall: cook-void-sheet.png
- 03a-station-views: stations-fry.png
- 04a-hold-cabinet: hold-new-batch.png, hold-below-135.png
- 04b-lockout-86: order-86-safety.png, hold-lockout.png, order-86-after-lockout.png
- 04c-board-86: board86-manual.png
- 05-demo-flow: demo-traffic-1280.png, demo-rush-sheet.png, demo-restarted.png
- 06a-gesture-and-exits: door-open.png
- 06b-reduced-motion: door-reduced.png
- 06c-pin: pin-keypad.png
- 07b-pages-live-only: office-live-only-empty.png
- 07d-gantt-themes-keys: office-gantt.png, office-paper-tickets.png
- 07e-data-page: data-import-refused.png
- 08c-corrupt-storage: corrupt-storage-board.png
- 09a-floor-viewports: vp-floor-280-day.png, vp-floor-280-night-large.png, vp-floor-390-day.png, vp-floor-390-night-large.png, vp-floor-1024-day.png, vp-floor-1280-day.png, vp-floor-2560-day.png
- 09b-sheets-wide: vp-sheet-order-1280.png, vp-sheet-hold-1280.png, vp-sheet-board86-1280.png
- 09c-sheets-narrow: vp-sheet-order-390.png, vp-sheet-hold-390.png, vp-sheet-board86-390.png, vp-sheet-order-280.png, vp-sheet-hold-280.png, vp-sheet-board86-280.png
- 09d-office-wide: vp-office-2560-ember-pace.png, vp-office-1280-ember-pace.png, vp-office-1280-paper-pace.png, vp-office-1024-ember-pace.png
- 09e-office-narrow: vp-office-390-ember-pace.png, vp-office-390-paper-pace.png, vp-office-390-ember-large-pace.png, vp-office-280-ember-pace.png, vp-office-280-ember-money.png
- 10a-no-network: offline-board.png
- 11c-sixty-tickets: perf-60-tickets.png
- 13a-tour-full-loop: tour-1-1280.png, tour-3-1280.png, tour-5-1280.png, tour-7-1280.png, tour-8-1280.png, tour-9-1280.png
- 13e-tour-layouts: tour-8-phone-390.png, tour-9-phone-390.png, tour-8-large-text-1280.png, tour-9-large-text-1280.png
- 13f-tour-busy-board: tour-8-busy-board-1280.png, tour-9-busy-board-1280.png

## Source files at run time

| file | KB | modified (UTC) |
|---|---|---|
| 00-util.js | 16 | 00:05 |
| 05-icons.js | 15 | 22:46 |
| 10-config.js | 19 | 22:54 |
| 20-engine.js | 155 | 06:02 |
| 30-store.js | 32 | 01:31 |
| 40-metrics.js | 133 | 06:06 |
| 45-sim.js | 64 | 04:17 |
| 50-charts.js | 177 | 22:51 |
| 60-shell.js | 103 | 04:14 |
| 70-floor-board.js | 82 | 06:06 |
| 71-floor-order.js | 47 | 04:35 |
| 72-floor-sheets.js | 125 | 06:07 |
| 74-floor-tour.js | 18 | 06:07 |
| 80-office-core.js | 72 | 06:06 |
| 81-office-pace.js | 38 | 06:06 |
| 82-office-money.js | 43 | 06:06 |
| 83-office-safety.js | 33 | 06:06 |
| 84-office-data.js | 108 | 06:06 |
| 85-office-stock.js | 37 | 23:49 |
| 99-boot.js | 7 | 00:05 |
| 00-tokens.css | 14 | 22:46 |
| 10-base.css | 46 | 00:49 |
| 20-floor.css | 37 | 05:47 |
| 21-floor-sheets.css | 33 | 23:31 |
| 22-floor-tour.css | 4 | 04:18 |
| 30-office.css | 23 | 06:06 |
| 31-office-money.css | 13 | 23:57 |
| 32-office-data.css | 17 | 06:06 |
| 40-charts.css | 14 | 22:53 |
