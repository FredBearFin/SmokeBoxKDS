# Back office audit, night round 1 (A3)

Method: the built app (`dist/smokebox.html`) driven in headless Chromium by hash (`#/office/<page>`), seven pages, in four states (empty first run, demo loaded, demo with four tickets bumped, sample history on), Ember and Paper, at 1024x768, 1280x800, 1280x2400 (to see whole pages), 1920x1080 and 390x844. Screenshots: `docs/ux-shots/night/a3/` (names: state-page-size-theme). Everything is simulated in a browser; nothing here was checked on a real tablet or in a real kitchen. No horizontal page scroll was found at any size, and no console errors. Not every state/size/theme combination was looked at by eye (see the end).

## P0 (broken or misleading)

1. **Pace, empty first run: "86 list 17" and a red-toned "Brisket: None".** A new owner who has cooked and sold nothing is told 17 items are 86'd and no brisket is ready. It is true to the engine (zero stock means out) but reads as an alarm. Cause: `src/js/86-office-glance.js` readLive/glanceModel (`out86` from `select.unavailable()`). FIXED: when there are no batches and no tickets the panel says "Nothing cooked yet" (test added in `test/glance.test.mjs`). The same logic should be used wherever stock is shown while the owner does not track stock (later round).
2. **Mentions of Pitcall in owner-facing text.** Stock page "What to cook tomorrow" ends with "Pitcall can use the sell-out time to decide tomorrow's cook count... nothing is sent to Pitcall" (`src/js/85-office-stock.js:280`), and the sell-out explanation in `src/js/40-metrics.js:1605`. A small owner has never heard of Pitcall; it is also an internal product name. NOT FIXED: `test/office-b.e2e.mjs` asserts the `seam` element and I may not run e2e. Suggested: delete both sentences and the `seam` assertion together.

## P1 (hurts daily use)

3. **Filters ate about 180 px before any number (two wrapped rows at 1280).** Range, Day, Channel, Source did not fit one row. FIXED: the Day picker only shows for Yesterday or One day (`src/js/80-office-core.js` dayGroup, `.of-fg[hidden]` in `30-office.css`), gap tightened. At 1280 the bar is one row (empty Pace content starts at y=217 instead of 292). At 1024 it still wraps to two rows (acceptable). Phone already folds the filters behind one line, which works well.
4. **"Sample" pages with nothing to say outside sample.** With sample off and no tickets, every page shows the same dashed "Take your first order" card; fine and honest, but the banner line "Sample history is switched off in Menu and settings" gives no button to turn it on. Suggested: a "Show sample data" link in the banner (`80-office-core.js` around line 168).
5. **Three different "money" numbers on Sales.** Headline "The till took $69,835", tile "Food sold $66,147", table "Net sales $66,598.72" and "Collected in all $69,834.72". Each is defined, but an owner will ask which is the sales number. Suggested: lead with net sales, label the rest as "plus tips" (`src/js/82-office-money.js`, headline in `40-metrics.js` headline('money')). Also the tile rounds ($66,147) while the table shows cents.
6. **Jargon.** "Waiting under the lamp" (tiles on Tickets, Stations, 81-office-pace.js:281), "Slowest 1 in 10", "Plate spread", "Pacing hold", "Waiting at expo", "Items 86'd", "Drifted", "response and work time", "starter estimate", "median" everywhere. Suggested plain words: "Waiting to be picked up", "Slowest tickets (1 in 10)", "Out of stock items".
7. **"Simulated 86 updates reached every channel in a median of 0m 19s"** in the Stock headline (`40-metrics.js:1772`). This is simulator output presented as a finding; an owner has no such sync. Should be hidden unless real sync exists.
8. **KPI rows say "No comparison" under every number on a fresh 14-day range**, six times in a row, plus a footnote. It is honest but noisy. Suggested: show one footnote and leave the tile line empty (`80-office-core.js:452`).
9. **Pace headline wraps mid-value** ("9m / 01s") at 1280; the `<strong>` runs break across lines. Add `white-space: nowrap` to the headline numbers (`.ch-big-h strong` in `40-charts.css` or the kit headline style).
10. **Stock "What to cook tomorrow" cards are long paragraphs** (about 120 words each, repeated "simulated sample data (not your kitchen)"). Cook 20.90 kg is the useful part. Suggested: one short line plus a "why" disclosure (`85-office-stock.js`).
11. **Menu and settings page: every dish is a 250 px form** with long help text repeated ("One tap: done when... Start, then done: ...") on each card. Twenty-one dishes is a very long scroll. Suggested: collapse to a row with expand (A2 shares this file).

## P2 (polish)

12. Open-orders tile on Pace is not tied to the date range but sits under the range filter (it says so in the footnote below, small). Consider putting the glance in its own labeled band "Right now".
13. Pace and Tickets charts show a stray rise at the right edge (3 am) when demo tickets exist at the current clock; looks like a data glitch on "Tickets per 15 minutes" and "Items waiting at each station".
14. "Pace right now" ring card is mostly an empty dashed box when no tickets finished in 45 minutes; it takes the same space as a chart.
15. Ticket-time histogram bars are grey with four thin channel outlines; hard to read in Ember. Use filled stacked bars or one series with a channel toggle.
16. Bottom-left "New tablet? Run the 6-step setup" toast sits over the last chart row in every screenshot until dismissed (floor shell, A1's area).
17. Sticky backup banner above the office title ("Service is over. Save today's backup") stays in office on every page; it is fine but pushes the title down about 60 px.
18. Date input shows "10/22/2026" US style next to chart labels "Fri 10/9"; consistent, fine. Day picker has no label for the date format.
19. Safety: "Compliance score 91%" tile next to the headline "97%... 85%"; the average of two different bases (checks vs rounds) is not a meaningful percentage. Consider dropping the ring.
20. Phone: tiles are readable; the tab bar labels ("Settings" vs "Menu and settings") are shortened inconsistently with the rail.

## Fixed in this round
- Finding 1 (glance empty state) with a unit test; finding 3 (filter row) with a script check (Day group hidden on Today and 7 days, shown on Yesterday and One day) and before/after screenshots (`empty-pace-1280-ember.png` is the after).

## Left, with reason
Findings 2 and 4 to 11 and all P2: wording and layout changes that touch tests I may not run (office e2e), or the shared data page, or need Freddy's call on what the owner should see.

## Not checked
Every state at every size and both themes by eye (about 15 of roughly 100 screenshots were opened); 1920x1080; keyboard and screen reader paths; the PIN gate (no PIN is set in these runs); after-closing-tickets state looked at only through pass/fail of page render; real device behavior. The two unit-suite failures seen (engine soak throughput, metrics 250 ms budget) are timing budgets that failed while six agents shared the CPU, not caused by these edits.

---

## Round 2 update (branch night/a3-r2)

Screenshots: `docs/ux-shots/night/a3/r2-*` (empty 1280x800; sample 1280x2400 for all seven pages; header strip at 1024, 900, 760, 700, 390 as `r2-hdr-*`).

Fixed since round 1, with the finding numbers above:
- **5 (three money numbers).** One primary figure: Sales (food sold after discounts, from paid orders). Headline now reads "You sold $66,599 of food in 2,269 paid orders ($29.35 average). With tax and tips, $69,835 was collected, $3,236 of it tips." The tiles are Sales, Average order (the same $29.35), Food cost, Items sold; the table rows are Sales, Tax, Tips, Total collected. "Takings" became "Money collected". The old "Food sold" tile (menu value of finished food) is gone because it cannot be explained in one line. Food cost now shows "Cost not recorded" when no item has a recorded cost (the metric already skips lines with unknown cost; if A5's data change is not merged yet a dish with cost 0 would still count, which is the data side).
- **2 (Pitcall).** Removed from the Stock page and the sell-out finding. Left in two places that are not in my files: the About list in Menu and settings (`84-office-data.js:1676`, asserted by `test/office-data.e2e.mjs:874`) and a help line in `72-floor-sheets.js:1834`.
- **4 (empty states).** Empty pages now have a "Show sample numbers" button and a line saying the numbers are made up, labeled and never mixed with your own. It turns sample history on and shows the last 14 days with the Sample data chip.
- **6 jargon.** "Waiting under the lamp" to "Finished food waiting"; "Plate spread" to "First to last dish"; "Pacing hold" to "Held back"; "Waiting at expo" to "Waiting to go out"; "Drifted" to "Off estimate"; "Items 86'd" to "Items sold out"; "Pace index" to "Busyness"; "Line friction" to "Slip-ups on the board" with plain bar names; "90th percentile" to "the slowest tenth".
- **7 (simulated sync).** The Stock headline no longer reports simulated sync times. The "Channel sync (simulated)" section lower on the Stock page is still there, labeled simulated (left: remove or hide it; it needs a decision).
- **8 (No comparison).** Tiles with no earlier period now leave the line empty; the single footnote under the tiles explains it.
- **9 (headline wrap).** Bold numbers no longer break across lines.
- **10 (cook tomorrow).** Cards cut to two short paragraphs each; the basis ("typical demand plus 10%") moved to the section caption.
- **11 (menu list).** Each dish is one row (name, station and category, price, prep time, "Starter prep time" tag) and opens to the full form on tap. The new-dish form opens its row. Duplicate "Hot sides, Hot sides" avoided.
- **Theme switch.** Between 521 and 720 px the Ember/Paper button showed its word squeezed into vertical letters (48 x 101 px); it is now an icon button below 720 px and never shrinks.

Still open: 12 to 20 (P2), the Safety compliance ring (19), the "New tablet?" toast (A2 is removing it; it still showed on the round-1 deploy build I started from, so verify in the merged build), "channel" and "protein" words on Stock, remaining jargon in 84-office-data (not renamed here: wording decisions for A2/Freddy).

---

## Round 3 update (branch night/a3-r3)

Screenshots: `docs/ux-shots/night/a3/r3-*` (blank kitchen 1280x800 Ember; demo with sample history 1280x2400 Ember; demo with four tickets sent out 1280x800 Paper and 390x844 Ember; 1920x1080 Paper for Pace, Money, Stock). Demo loaded with `resetLive({keepSettings, starter, stagger, catalog:'sample', replaceOwn})`, then nine demo tickets.

Fixed:
- **Blank kitchen is honest.** When the cook-ahead module is off (`SB.engine.moduleOn(state,'cookAhead')`; absent means on, so the demo and old saves are unchanged), the Safety and Stock pages show one card instead of empty charts: "You are not tracking cooked-ahead food... Turn it on in Settings", with a button "Yes, I cook food ahead" that sets the same flag as A2's setup question. Their rail entries say "Not tracking", and the filter bar is hidden on those pages. Turning the switch on or off elsewhere redraws the page within a refresh. Checked live: button works, switch off hides the page again.
- **Cooked yield section on Money** is no longer brisket-only. It uses the first ingredient that has a yield model, and the whole block (section, yield chart, cost of a fixed yield, what-if) is hidden when cook-ahead is off or no ingredient has a yield to compare. Plain titles ("Cooked yield", "What a fixed yield costs you"); the what-if says its model is based on published brisket research.
- **Pace glance** no longer hard-codes brisket. It shows the cooked-ahead item that runs out soonest (else one with a known pace, else the one with most on hand) under its own name, and no card at all when nothing is cooked ahead or the module is off.
- **Settings labels** (labels and help text only, ids and grouping untouched): "Menu and bills of materials" now "Dishes and what goes in them"; "Par (opening stock)" now "Opening amount (par)"; "86 point" now "Sold out at"; "Pull size (one set unit)" now "Amount per take-out"; "Static yield" now "Cooked yield"; "Learning strength" now "How fast it learns your real times"; "Trim a very long timing at" now "Ignore a timing longer than" (units "times the starter time"); "Hard cap" now "Longest any batch may stay"; "Wait before channels hear a quality 86" now "Wait before other apps are told an item is past best-by". "Legal minimum/maximum" now "FDA Food Code minimum/maximum" with a note that the local health code applies and may be stricter; the "never lets hot hold go below 135" promise is reworded to "refuses a limit below 135 F (the FDA Food Code minimum...)". Backup import errors say "could not be read" instead of "not readable JSON". The About list no longer mentions Pitcall. "Takings" in the tax help text now says "Money collected".
- **Channel sync** on Stock is labeled "practice only" and only shows when demo tickets or sample history are in play; a real kitchen does not see it.
- The compliance ring wording was already handled by A4 in Safety.

Left: "Meal pacing" section title (Freddy's call on Finish together), the About "What is simulated" row, "protein" wording on Stock, Day/Night vs Ember/Paper, P2 items 12 to 17 and 20, a forgot-the-PIN path (60-shell, not mine). Not re-checked by eye: Paper at 1920 for every page, Safety and Stock pages with real cooked-ahead data other than the demo.

---

## Round 4 update (branch night/a3-r4)

Screenshots: `docs/ux-shots/night/a3/r4-*` (Close the day open, ready, done at 1280x800 Ember and 390x844; printed summary at 1024x768; Appearance with units; blank-kitchen dish list at 1280 and 390; stock with pounds).

**Close the day** (`src/js/87-office-closeday.js`, `src/css/33-office-closeday.css`). A sheet opened by `SB.office.openCloseDay()`, by the "End of day" card on Sales and money, or by the address `#/office/money?close=1`. It shows: a plain line on what closing does; open orders with a button that opens Orders (the button is the only way to close while any order is open); money by cash, card and other (orders, sales, tax if any, tips, collected) and a "Cash in the drawer should be $X, plus the cash you started with" line; counts of tickets and voids; leftover food keep or throw out only when cooked-ahead food is tracked and some is left; then Close the day. The done state says "Back up today's data now" (downloads the backup and tells the app a backup was made), plus Print today's summary and Done. The print summary is a one-page table (paid orders, sales, tax, tips, collected, by method, cash expected, voids, food thrown out with cost where known) with a practice-numbers note when demo tickets exist; it prints through a print-only block. A "?" opens the Guide page `closing-the-day`.

What closing does in the engine (checked in `A.closeDay`): it refuses while any order is open; otherwise it logs one `day_closed` event with the day's totals and counts, optionally throws out every batch with food, and records `lastClose`. It does not lock the day and does not move the clock: the service day still turns over at the set hour (4 am), orders taken after closing are allowed, and closing again the same day covers the whole day. The sheet says this in plain words. There is no starting-cash setting, so the drawer line says "plus the cash you started with".

**Units.** Appearance now has Temperatures (F or C) and Weights (kg and g, or lb and oz), saved in the settings. Office text follows them: tile and card weights (`kit.fmt.g`), the Pace glance, charts (g and temp formats in `50-charts.js`, axis labels too), thrown-out sentences, the safety page temperatures and the Settings read-outs. Left in the stored unit by design: the entry fields (Ingredients amounts in grams, Food safety limits in F), money per kg labels, and chart tick positions (they stay at round gram and F values; only the labels change).

**Hidden counted-stock ingredients** ("Portions of X") are filtered out of the Settings ingredient list, the add-an-ingredient pick list, and the stock chart picker; a name shown anywhere reads as the dish.

**Help links** added: Close day sheet and Sales and money card, Data Export (`backup-and-restore`) and Import (`replacing-a-device`). The Safety page "?" is in 83-office-safety.js (A4).

**Blank dish list** says "No dishes yet. Add your first dish to start taking orders." with an "Add your first dish" button that opens the dishes sheet.

Floor-side call sites for A1 that still show weights or temperatures without the units helpers (not touched, not mine): hold cabinet cards and sheets (72-floor-sheets.js), the ticket and board cards (70-floor-board.js), 76-floor-discards.js; use `U.weightText(g)` and `U.tempText(f)`.

Left: starting-cash setting, Safety "?" link, tax percentage in the print summary, a printed layout check on a real printer.

---

## Round 5 update (branch night/a3-r5)

Screenshots: `docs/ux-shots/night/a3/r5-*` (Data in the real and demo kitchens at 1280 and 390, restore previews, the typed-word reset box, the safety bar, the print sheet and printed record, Pace, Tickets and Stations at 390, 1024, 1280 and 1920 in Ember and Paper). Browser checks used `?demo` for the demo kitchen and a plain load for the real one.

- **Data page is a three-card flow** (`84-office-data.js`, `88-office-backup.js`, `32-office-data.css`): 1 Back up now (a red line when never backed up, amber after about a day, red after three days; the Download backup (JSON) and Copy backup buttons keep their names because the Guide quotes them), 2 Restore from a backup (choose a file or paste; the preview shows saved date, kind (your own kitchen or practice), dishes, orders, tickets and whether a PIN is set; a backup from the other kind of kitchen is refused in plain words before anything is touched; checked both directions), 3 Replacing this device (numbered steps and a Guide link). Spreadsheet files and the pilot report moved into a closed group. Below it: stored counts and sample history as before, then a Danger zone. Reset live data and Reset everything now open a box that says what will be erased and needs the word RESET or ERASE typed before the red button turns on (checked: disabled until typed, Enter and Escape work). The old confirm dialogs are gone.
- **Printable food safety record** (`89-office-inspector.js`, `34-office-inspector.css`): a bar at the top of the Safety page (only when cooked-ahead food is tracked) with Print the safety record and a Guide "?"; a sheet with a date range (Today, 7, 30, 90 days) and a preview; print page with a header that says it is the owner's record and not an inspection result, "Entries are never edited; corrections are added under the entry they correct", a repeating table header, a Reviewed by line and page numbers (margin box, which an older print engine may ignore). Rows come from the engine's `safetyLog` (read only): readings, reheats, cooling, sanitize rounds, thrown-out food with cost where known, who logged it, corrections under their entry. No safety page file was edited (83 is untouched).
- **Pace, Tickets, Stations:** four tiles each (Pace: median, slowest 1 in 10, on time, per hour; Tickets: finished, median, overdue, voided; Stations: overdue, first to last item, finished food waiting, items per hour), the lead chart or two visible, and the rest behind one "Show more charts and findings" button. Pace's lead chart is now full width.
- **Motion:** tiles, cards and section heads ease in once (a 320 ms fade and 6 px rise, small stagger); no looping, numbers do not animate. Off for prefers-reduced-motion and when `--motion-on` is 0 (defined as 1 in `30-office.css`; there is no `--sb-motion` on this merge).
- Printing fix: the Close the day and safety print blocks now share the `sb-printroot` class, because one hiding rule had been hiding the other's block.

Left: a calmer first screen when the day has no data yet (four "Not enough data" tiles still show above an empty chart); the glance panel duplicates a few numbers the tiles also show; real-printer checks.

---

## Round 6 update (branch night/a3-r6)

Screenshots: `docs/ux-shots/night/a3/r6-*` (Close the day open, ready and done at 1024 Paper, 1280 Paper and 1920 Ember; Data real and demo at 1024 Paper and 1920 Ember; Pace, Tickets, Stations at 1280 Paper).

- **Wording from A4's round 5 list applied** (line numbers checked on the merged build): the "Settings" pointers now say Menu, Dishes and prices, "Yes, I cook ahead" (80-office-core.js); "line screen" is now "kitchen board" (80, 82, 83); the Sales yield section no longer says smoked meat or smoker ("cooked meat", "while it cooks", "your main cooked-ahead meat", "raw weight put in to cook"); "discards" is now "thrown-out batches" (83-office-safety.js:102, the one line allowed); the Fahrenheit sentence reads "The limits on the Food safety page are always entered in °F."; "nothing is 86" is now "nothing is sold out"; the channel sync strip (practice-only, hidden for real kitchens) now says "Practice only: this shows how a sold-out dish would reach other ordering systems. Nothing is sent."
- **Calmer first screen.** Pace, Tickets and Stations treat "no finished tickets" as empty: one card, "Nothing to show yet. Take an order and send it out when it is done, and the times appear here" (or "The tickets on the line are not finished. Send one out and its times appear here"), no row of "Not enough data" tiles over an empty chart, and no duplicate headline. The glance panel and tiles no longer repeat each other (tiles are the four speed numbers; the glance holds money, open orders, late tickets, 86 list and the run-out item).
- **Themes and contrast.** A script walked every text element on all seven pages in Ember and Paper (demo data, extra charts open) and found no text under 4.5:1 (3:1 for large text). Keyboard focus rings are 3 px and solid in both themes (light on Ember, near-black on Paper). Status colors always come with an icon and a word; charts use an orange and blue pair with dashes and labels. Print pages are black on white. Not measured: UI-component 3:1 for every chart mark, and color-blind simulation of every chart.
- **Keyboard and screen reader.** Tab order on the Data page runs top to bottom; the typed-word box describes what will be erased (aria-describedby), takes focus when it opens, closes on Escape and returns focus to the button that opened it; the Close the day leftover choice is a labeled radio group; the done state moves focus to "The day is closed."; backup and restore results are polite status messages and refusals are alerts; the show-more button has aria-expanded. The Orders footer's Close the day button opens the sheet (browser check `test/office-closeday.e2e.mjs`). No screen reader was run.
- Rail words "Not tracking" are hidden below 1100 px wide.

---

## Round 7 update (branch night/a3-r7): the owner's week

Method: a three-week history for a blank own kitchen (12 own dishes, no ingredients, cook-ahead off: 403 orders over 21 days, with Friday and Saturday busiest and a peak slowdown at lunch and dinner) was generated with the real engine (scratch script, not committed) and loaded into the real kitchen; the barbecue demo (`?demo`, 14 sample days, cook-ahead on) stood in for the cook-ahead kitchen, since the simulator only makes that one. Pages were walked with owner questions. Screenshots: `docs/ux-shots/night/a3/r7-*`.

Found and fixed:
- **First screen was empty on a normal morning.** With nothing ordered yet today the office opened on "Today" and every page said there was nothing, although three weeks of data existed. It now starts on the last 7 days when today has no tickets but the week does (`defaultFilters`). "What did I take this week" is now one tap (Sales and money) and reads "$2,558 was collected, $122 of it tips".
- **"What sold best Friday"** took the Range buttons, the date box and typing. One day now shows seven weekday buttons (Mon to Sun) that jump to the latest such day (today only counts if something was ordered today). Sales, then One day, then Fri: three taps, and the page shows that day's sales, payment mix and top items.
- **The End of day card sat above the charts** and pushed Top items off the first screen; it is now at the bottom of Sales and money (the Close the day button on the Orders sheet is unchanged).
- "When was I slowest", "was a station behind": answered by the headline on Tickets ("1 to 2 pm is the slowest hour at a median of 16m 07s") and Stations ("Pit finished last on 63% of tickets") in one tap, on the new default range.
- "How much did I throw away": Safety and Stock correctly say "Not tracking" for the blank kitchen; in the demo the Safety headline now says "thrown out" instead of "discarded" (`40-metrics.js`), and the timeline mark reads "Thrown out".
- **Sales CSV for an accountant** (Data page, Spreadsheet files group, first button "Sales by day (for your accountant)"). One row per service day with plain column names: Date, Orders paid, Sales (after discounts), Discounts given, Tax, Tips, Total collected, Collected in cash, Collected by card, Collected other; then a Total row; plain digits with two decimals and no dollar signs so a spreadsheet adds them up; demo files carry `-demo` in the name. Tested in `test/office-inspector.test.mjs`.
- **Colour-blind check.** A simulation of the 8 series colors and the 4 status colors (protan, deutan, tritan, Ember and Paper) shows several close pairs (orange and brass under protan, slate and violet, ok and bad under deutan). Status colors always carry a glyph and a word. Charts with three or more plain lines now give the third and fourth a dotted and a dashed pattern, as do the histogram outlines, so no mark relies on color alone; two-series charts, stacked areas and bars still rely on legends and direct labels. Legend samples for the histogram outlines are still solid lines.
- **Re-checked:** inspector sheet in Paper at 1920, the erase box in Paper at 1920 (its label touched the field; spaced), all seven office pages at 390 in Ember and Paper with the week data (no sideways scroll).
- **Wording:** one verb for each Data page erase action (Erase live data, Erase everything, in the buttons, boxes, toggle and Guide); the confirm sentence no longer names themes; "Practice kitchen (the demo)" is now "Demo kitchen"; dish-row examples are neutral; "quality limit" kept where the cabinet says it (inspector labels "Kept serving past its quality limit").

Left: charts in black and white print (only the two print pages are print-styled); Legend dash samples for histograms; a weekday sales chart; Friday's busiest dish still needs the page scroll to Top items.

---

## Final summary (round 8, branch night/a3-r8)

**What each page answers** (for a small owner; numbers come from the app's own records)
- **Pace:** "How is the kitchen doing right now?" The glance cards (paid so far today, open orders, late tickets, 86 list, the cooked-ahead item that runs out soonest) plus four speed tiles and the ticket-time-by-hour chart. More charts sit behind one button.
- **Tickets:** "When was I slowest, and where does a ticket's time go?" One headline sentence, finished and overdue tickets, how long tickets take, on time by order type.
- **Stations:** "Was a station behind?" Which station finished last, items waiting by station, overdue tickets by station, prep times against the starter estimates.
- **Sales and money:** "What did I take in, and what sold best on a day?" One headline (sales, paid orders, collected with tax and tips), the sales tile and average order, money by day and by payment method, top items, sales by hour; the weekday buttons under One day; the End of day card at the bottom; the sales CSV on the Data page.
- **Safety** (only when cooked-ahead food is tracked): "Were my checks kept, and what did I throw out?" Checks kept on time, the batch timeline, thrown-out food by reason, and the printable record.
- **Stock and 86** (only when cooked-ahead food is tracked): "Why did something run out, and what should I cook tomorrow?" Plus the sell-out clock; the channel sync strip is practice-only.
- **Menu and settings, Data:** dishes, times, limits, units, backup, restore, replace a device, erase data.

**Verified in round 8**
- The sales-by-day download in a real browser (Playwright download event, `test/office-sales-csv.e2e.mjs`): a blank kitchen starts no download and says "No order has been paid yet..."; a three-week history gives `smokebox-sales-by-day-<date>.csv` with the plain header, 20 day rows and a Total row (60 paid orders, methods add up, ten cells per row, no dollar signs); the demo kitchen's file is named `smokebox-sales-by-day-demo-...`.
- Contrast walk on the merged build: all seven pages, Ember and Paper, no text under 4.5:1 (3:1 large).
- Close the day from the Orders footer (`test/office-closeday.e2e.mjs`).
- Two-line charts and histogram outlines with two or more channels now carry a dash pattern (second line dashed, third dotted, fourth dash-dot); area plus line charts rely on the fill versus the line.

**Known limits (be honest with owners)**
- All history in screenshots and tests is simulated (the 14-day barbecue sample and a generated three-week own-kitchen history). The numbers have never come from a real kitchen, and no page has been compared with a real owner's books.
- Black-and-white print: only the Close the day and safety record pages are print-styled and are black on white. Printing an office page directly prints the screen layout in color; stacked and bar charts rely on labels and legends, not patterns.
- Charts still use color for series in two-series stacked and bar charts; ok and bad status colors carry a glyph and a word.
- No screen reader, real printer, real tablet or real kitchen has been used.
- `test/office-b.e2e.mjs` is stale against the blank-start and demo-isolation merges (it expects sample data and every page populated): 20 ok, 4 FAIL, then crashes at an empty headline. `test/office-data.e2e.mjs` was not re-run this round. `test/office.e2e.mjs` was not re-run either. These suites need updating by whoever owns the e2e refresh.

**Not done:** starting-cash setting; weekday sales chart; legend samples for dashed lines on histograms; a printed-chart view.
