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
