# Kitchen board and ordering audit (round 1)

Method: the built `dist/smokebox.html` driven in headless Chromium (Playwright) at 1024x768, 1280x800, 1920x1080 and 2560x1440, then every screenshot read by eye. Screenshots are in `docs/ux-shots/night/a1/`. Everything here is simulated. Nobody used it on a real tablet, TV or in a real kitchen. The test machine clock was about 3 a.m., so "kitchen closed" and "Service is over" notes appear in most shots; that is the clock, not a bug.

States covered: first run (empty), demo loaded, on time, running late, overdue, allergy and rush tickets, 30 and 60 tickets, station tab (PIT), Cabinet tab, New ticket sheet (1280, 1024), `#/new` page, Orders sheet, one-tap payment, Far display (1280, 1920), Wall mode (1920, 2560, Day and Night), Night, Large text.

## P0 (broken or blocks work)

None found beyond P1-1, which was fixed.

## P1 (hurts daily use)

1. **FIXED. Sound-check and "sound paused" notices showed as empty bars with only an X.** First run and every board with sound on but not yet unlocked: a dark 20 px bar with no words (`first-run-1280.png` before, `first-run-1280.png` after). The wrapper was shown but the button inside it kept `hidden`. Cause: `src/js/70-floor-board.js:1411` and `:1418`. The cook never learned that warnings are silent until one tap. Fix: removed the stray `hidden`. Test: `test/strip-notices.e2e.mjs` (fails before, passes after).
2. **FIXED. Header chip said only "not logged".** Nobody knows what is not logged (`levels-t12min-1280.png`). The word "Sanitize" was hidden below 1670 px. Fix: `src/css/20-floor.css` (end of file) shows the word whenever the chip needs attention. Checked at 1280 and 1920; at 1024 the chip is moved into Menu as before.
3. **Too much chrome above the tickets.** Late state at 1280x800: backup banner 60 px, header 80, sound bar 30, pause note 30, two strip rows 100. Tickets start at y=315 of 800 (`levels-t12min-1280.png`), at 1024x768 about y=210 (`many30-1024.png`). Each can be cleared, but a first-time user sees all of it. When the kitchen is closed the "Sound paused" note and the "turn on warning sounds" bar say nearly the same thing. Cause: `70-floor-board.js:1500-1512`. Suggested fix: show one sound bar at a time (unlock first, pause note only after), and default the backup banner to the Menu dot at the board.
4. **New ticket: the customer name field is far down the right pane.** After 3 items it sits behind 12 quick-name chips and needs a scroll (`new-ticket-sheet-3items-1280.png`, `new-page-2items-1280.png`). At 1024 the chips alone fill the pane. Cause: chip row built in `71-floor-order.js` near `:345-373`. Suggested fix: one scrolling row of chips (or only 6), field above chips.
5. **All-overdue board is one wall of red** (13 tickets all "Overdue +30 min", `levels-t42min-1280.png`). Known from the handoff; ranking by age exists, but nothing tells the cook which to do first beyond sort order. Suggested: only the oldest two get the heavy border.
6. **Orders sheet "Pay $23.50 cash" pays with one tap** (`take-payment-1280.png`). Undo toast exists for 10 s, but the method defaults to cash even for card or delivery app orders. Cause: `73-floor-orders.js:241`. Suggested: remember the last method per channel, or label the button "Cash" and "Card" as two buttons.

## P2 (polish)

1. Zero badges: the Cabinet tab always shows a black "0" (and tabs show "0" on a quiet board). Hide zeros. `70-floor-board.js:1547,1560`.
2. Welcome card text is cut mid-sentence ("...begin a dish an...") with no way to read the rest: `20-floor.css:642` clamps to 2 lines in a 450 px column. Widen it or shorten the copy.
3. First run shows a red "86" badge with 17 on an empty kitchen. Accurate (nothing cooked yet) but alarming; the welcome card should say so.
4. Toasts still paint over the first tickets' Bump buttons for 4 s (`night-late`, `new-ticket-send-no-allergy-answer-1280.png`). Taps pass through them, so work is not blocked. The demo-start toast lasts longer and covers the first three tickets.
5. The "All day" strip clips its last chip at the right edge with no fade or arrow. `20-floor.css:505`.
6. At 60 tickets nothing says how many are below the fold (`many60-1920.png`: two rows visible of ten). The tab count is the only hint.
7. Countdown format switches between "25 min", "13 min" and "9:58" in the strip. Fine for experts, odd at first glance.
8. Night theme keeps bright paper slips on a dark board (`night-late-1280.png`). Readable, but glaring in a dark kitchen.
9. Cabinet cards: uneven button grids and repeated "Starter stock" labels (`cabinet-1280.png`). Belongs to the sheets owner.
10. Wall mode: the strip bars span all three panes and take about 330 px at 2560; the toast covers the open-orders list (`wall-2560.png`).
11. "Demo" tags on every ticket and order row when a demo runs (known).

## Looked fine

Ticket levels read clearly with icon plus words (Running late, Overdue +N min). Allergy banner on a ticket and the "Allergy, see note" chip on each item are strong. Rush stamp is clear. Far display at 1920 is genuinely readable. Large text and Night keep layout intact. No console errors in any state. Sending a ticket without answering the allergy question works; the sent ticket gets a clear "Make X, then tap DONE" line.

## Not checked

Real audio, real touch, Safari and iPad, phone widths, role views (`?role=`), the Recall, 86 and Help sheets, Take payment with tip and discount, the guided tour, Far display at 1024.

## Round 2 status

Screenshots: `docs/ux-shots/night/a1/r2-*.png`. Test: `test/board-round2.e2e.mjs` (19 checks, all pass) and `test/strip-notices.e2e.mjs`. Everything is simulated in headless Chromium.

Fixed:
- P1-3 chrome: the sound bar and the "Sound paused" note no longer show together (the sound bar wins), and a screen under 900 px tall shows one warning row (the rest are counted in "(N more warnings after this one)"). With the backup banner hidden the first ticket starts at or above y=200 at 1280x800 and 1024x768. The backup banner (shell file) still adds 60 px after closing time.
- Toasts: info clears after 5 s, warnings after 6 s, errors stay until cleared (`60-shell.js`, 2 lines). With no sheet open they sit under the header on the notice strip, not over ticket buttons; with a sheet open they stay bottom-left.
- P1-4 New ticket: the customer name box is above the quick names.
- Sold-out dish tap: says "Out of Brisket. Log a batch to sell Brisket, 1/2 lb again." (and a reason-specific line for hand-off, safety hold, quality limit).
- Empty menu: "No dishes yet" and an "Add your first dish" button that opens the setup wizard.
- P1-5 all-overdue board: worst ticket tagged "Do this first", next two "Next", the rest calm paper with a thin red edge and no pulsing.
- B2 tab labels stay on one line; B4 a hidden "Hold cabinet" heading in the Cabinet view; B3 loudness slider and Channel sync row are 44 px tall; `SB.floor._alerts` made once.
- Wording: no "safe"/"unsafe" claims in my files; Specs removed from the Menu sheet (still opens with `SB.sheets.open('specs')` and from Help while the demo is loaded); Pitcall mention removed; pretend, made-up, simulated and sample now say "practice" (the word "Demo" itself is kept for the button and tags, per the glossary option).

Still open: P1-6 one-tap pay default method; P2 items 1-3, 5-11 above; the "New tablet?" toast stays 15 s (`77-floor-setup.js:171`, A2); the Demo and tag names; welcome buttons at 38 px (A2).

## Round 3 status

Screenshots: `docs/ux-shots/night/a1/r3-*.png` (blank board with the module off, demo board, 1024 and 1280, Day and Night, Paid by menu, slim banner). Tests: `test/board-round3.e2e.mjs` (18 checks) and the updated `test/board-round2.e2e.mjs`. Simulated in headless Chromium only.

Fixed:
- **Cook-ahead parts hide when the module is off** (`70-floor-board.js` `cookOn`): Cabinet tab, Hold button, key H, Sanitize chip, batch and temperature rows in the notice strip, the Hold and Sanitize entries in the quick menu, the 86 board "Nothing is cooked yet" note, the stock food-safety note and the Thrown-out log entry. If any batch still holds food, everything stays. An open cabinet closes when the module switches off. Absent setting means on, so the barbecue demo is unchanged.
- **Guide** entry in the quick menu and the Menu sheet, only when `SB.guide.open` exists.
- **Wording:** Thrown-out log, "In range" for "Holding fine", smoker and pit wording made neutral ("Ready at", "Batch on its way", "second batch"), "(practice)" on the first-run demo link. The Demo restart confirm now says it erases the owner's dishes and the button reads "Erase my dishes and restart" when they have any; `Sim.restartDemo({ replaceOwn })` passes the confirmed choice through (3-line change in `45-sim.js`).
- **Backup banner** is a 40 px bar: one line, a small action, and an X (the old "Later" is now the X, with "Later" kept for screen readers). The save-failure banner has no X on purpose.
- **Polish:** zero badges are hidden; welcome buttons 44 px and the welcome text is no longer cut; the All-day strip fades at its right edge; wall mode shows one notice row and no sound-pause note.
- **One-tap pay:** a "Paid by Cash" switch beside Pay (menu: Cash, Card, Other). The Pay button names the method, the choice is remembered on the device (`smokebox.v1.paymethod`), the Tip or discount sheet also remembers it, and the 10 s undo is unchanged.

Left: P2 items 3, 6-11 of the first list; the "New tablet?" 15 s toast (A2); Help sheet text about the cabinet still shows when the module is off.

## Round 4 status

Screenshots: `docs/ux-shots/night/a1/r4-*.png` (blank with the module off and on, demo, 1024 and 1280, Day and Night, Large text, blank 86 board, blank New ticket page, thrown-out log, PIN fold, help links). Test: `test/board-round4.e2e.mjs`. Simulated in headless Chromium only.

Fixed:
- **Empty menu:** combos no longer appear unless every dish in them is on the menu; the blank New ticket page hides search and categories and shows "No dishes yet" with "Add your first dish" (which now opens the Dishes screen); the blank 86 board shows the same friendly block instead of two zero tabs, an empty Stock heading and Channel sync. Settings text no longer says "Hush puppies"; Stock and the sound line drop food and batch talk when cook-ahead is off.
- **"?" help links** (guarded on `SB.guide`): Orders and Take payment sheets, New ticket sheet and page, Hold cabinet sheet and page, the sound bar, and the PIN pad. Not done by me: Set up this tablet (A2's file).
- **Close the day** button in the Orders footer (shows only when `SB.office.openCloseDay` exists).
- **Staff initials:** asked once per tablet (and again after 2 idle hours) when logging a temperature, reheating, discarding or marking surfaces sanitized, only with cook-ahead on; "Skip" never blocks the action. The cabinet shows "Entries are saved as JM" with Switch person, the batch card says "checked by JM 2:40 pm", and the thrown-out log fills initials from the entry.
- **Fix an entry** in the thrown-out log uses `correctSafety`: the old entry stays, the fix is a new entry with initials and time, and the box says so in plain words.
- **PIN lock-out:** a "Forgot the PIN?" fold under the keypad (what the PIN protects, that it cannot be recovered, ask whoever set it, clear site data, restore a backup that brings its old PIN back). The lock message points to it. Options for Freddy: `docs/audit/pin-recovery-options.md`. No PIN logic changed.

Left: the tour toast on an empty menu (message sent to A4 with the new text); the "?" on Set up this tablet (A2); "Fix this entry" only covers thrown-out entries (not temperature or sanitize rows, which need a safety page owner); initials are not asked for start cooling or keep serving beyond the existing keep-serving box; P2 items 3 and 6 to 11 of the first list.

## Round 5 status

Screenshots: `docs/ux-shots/night/a1/r5-before-slips-*` and `r5-after-slips-*` (4, 8, 12 and 30 tickets at 1024, 1280 and 1920; Day, Night, Large text) and `r5-after-cabinet-*`. Test: `test/board-round5.e2e.mjs`. Simulated in headless Chromium (software rendering), not on a tablet or TV.

Fixed:
- **Ticket slips:** tickets in one grid row now share one height (Bump stays right under the dishes, so it is never pushed out of reach). Item rows are about 15 px shorter (start time and station tag share a line), helper lines (start times, next-step line) are quieter and smaller, dish names a little larger, and waiting dishes are dimmed by colour, not by thin text. Far display keeps the bigger helper lines.
- **Hold cabinet:** one compact card for every batch: name and status on one line, ring and the amount left, last reading, next reading and serve-by, one main button (Taste and keep, Reheat or Log temp) and a "..." for the rest (pull, remind me, cooling, discard, corrections). The card went from about 330 px to 227 px and three cards fit across at 1280, so six batches show on one screen instead of two. "Starter stock" is named once in the summary line, not on each card; yield and cost notes moved out of the cards.
- **Units on the floor:** cabinet cards, sheets, toasts, help text, the thrown-out log, the notice strip text and the temperature boxes follow Fahrenheit/Celsius and kg/lb. The temperature boxes show the chosen unit and still store Fahrenheit (70 C is saved as 158 F). Cost per kg lines read per lb when pounds are chosen. Weight inputs in the New batch and restock forms still take kilograms (same as A3's office pages).
- **Motion system:** one custom property, `--sb-motion` (in `00-tokens.css`; reduced motion sets it to 0), scales every duration. Print-in 240 ms, bump-out slides sideways and fades in 260 ms, time colours ease, and a changed ticket or dish gets one 800 ms highlight. The overdue pulse now runs 3 times and the "check it" row flash 6 times, then they hold still; nothing loops for ever.
- **P2:** the "Amount" header in the thrown-out log no longer breaks.

Performance (headless Chromium, software rendering, 4 s of a 120x clock with tickets changing state; frames per second are not a tablet figure):

| Tickets | Motion on: avg / p95 / worst frame | Motion off: avg / p95 / worst frame |
|---|---|---|
| 60 | 16.7 / 16.8 / 33.3 ms | 17.4 / 16.8 / 66.7 ms |
| 200 | 19.2 / 33.4 / 66.7 ms | 17.3 / 16.8 / 66.6 ms |

Left: weight inputs in kg; "check this reading" and sanitize rows are not fixable from the log yet; P2 items 3 and 6 to 11 of the first list; no before/after of far display at 1024.

## Round 6 status

Screenshots: `docs/ux-shots/night/a1/r6-*.png` (Far display and Wall mode at 1920, 2560 and 3840; blank, late and 60 tickets). Tests: `test/board-contrast.e2e.mjs` and the updated `test/board-round2.e2e.mjs`. Simulated in headless Chromium only.

Fixed:
- **A real Night bug (mine, from round 3):** late tickets after the first three had a transparent head, so at Night the ticket number, customer and timer were dark text on the dark board (contrast 1.1 to 2:1, unreadable) and the "Next" tag was dark on dark. Heads now use the paper colour and the tag uses the slip colours. The new contrast test would have caught it.
- **Contrast:** a pair checker over computed styles (4.5:1 small text, 3:1 large) found no other failure on the board, New ticket, Orders and the cabinet in Day, Night and Night with Large text. Focus rings are visible (outline at least 2 px). Keyboard: Tab reaches the controls, Enter opens New ticket and Orders, Escape closes them and focus returns to the board.
- **Far display and Wall mode:** a 4K screen (3000 px and wider) now draws the board at twice size; Far display also enlarges dish names (1.3 times), the strip batch name and explanation (1.25 times) and the sound note, and keeps one strip row below 1300 px of height; the demo and backup bar grow on 4K. No horizontal scroll at any size; wall panes (orders, glance) work with a blank kitchen, the demo and 60 tickets; the strip never covers tickets (it pushes them down). New numbers against the 10-foot test are in `docs/ux-test-report.md`: which batch passes on a 43 in TV or larger; the explanation line is barely legible; the next-action line fails on a 43 in TV and passes only barely on 55 in and 65 in 4K TVs; a 32 in 1440p monitor fails most lines.
- **Touch size:** the sound bar, the pause note and their clear buttons are at least 44 px high.
- **Wording (A4's round 5 rows):** "held back" instead of "locked for safety", "Select" instead of "Tick", "Start and Done", "your dishes", "pulled pork or chili", "Demo batch", "restaurants that cook food ahead", "Sample history", demo wording instead of practice.

Left: the Overdue badge is small at 10 feet (the red outline and the "Do this first" tag carry the message); the physical size of a 2560x1440 32 in monitor needs browser zoom; P2 items 3 and 6 to 11 of the first list.

## Round 7 status

Screenshots: `docs/ux-shots/night/a1/r7-*.png`. Tests: `test/board-contrast.e2e.mjs` (now also the 86, Recall, Menu, Help and discards sheets in Day, Night and Night with Large text, and focus rings by control type). `board-round3` and `board-round4` re-run and pass. Simulated in headless Chromium only.

Fixed:
- **Focus rings:** the dish row button had no ring at all, and controls on the dark sound bar (clear X, help "?") had a ring the same colour as the bar. Both now show a ring of at least 2 px with 3:1 contrast in Day and Night. The new sheets showed no contrast failures.
- **Overdue badge in Far display:** bigger and on its own line (see `docs/ux-test-report.md`).
- **Friday rush** (a blank kitchen, six dishes added, 40 tickets one every 250 ms, then Start, Bump with its "Bump anyway" confirm, tab switches, Orders with 40 orders, Pay, the 86 board, New ticket, and the cabinet tab after turning cooking ahead on): no overlap, no clipped text, no page errors. Time from tap to the next painted frame: new ticket 30 ms on average (worst 52), tap Start 16 ms, Bump 12 ms, tab switch 30 to 38 ms, Pay 36 ms, open the 86 board 46 ms, open New ticket 93 ms, open Orders with 40 orders 112 ms. The one thing found: in the cabinet view the 10-second "Paid ... Undo" toast sat on top of the In the cabinet and New batch tabs; it now sits below them.
- **Order sheet with 36 dishes and 12 categories at 768x1024:** no clipped tile names (a 40-character name wraps to five lines), the 12 category tabs wrap to two rows, search plus Enter adds the first match. Emoji, Arabic and Hebrew names draw correctly; right-to-left customer names now align right (`dir="auto"` on slip, tile, wall, Orders and Recall names).
- **From A2's first-time owner run:** tabs for categories with no dish are hidden (and all tabs when fewer than two categories have a dish); the payment note says "No sales tax is added. Set it under Menu, Tax, hours and PIN." when the tax rate is 0; the New batch weight starts at the usual batch size the owner typed.
- **Wording (A4):** research-report sentence removed from Help, "step 1 of 2" and "step 2 of 2" for cooling, "throw it out".

Left: a hint of how many tickets are below the fold (P2 6); countdown format switching between minutes and mm:ss (P2 7); bright slips at Night (P2 8); the Demo tag on every ticket (P2 11); wall names that are too long end in an ellipsis (no way to read the rest on a TV).

## Round 8 status (final)

Final screenshots with a "what to look for" list: `docs/ux-shots/final/README.md`. All board checks re-run on the merged build (e7e9c93 plus this branch): `board-round2` to `board-round5`, `board-contrast` (42 checks) and `strip-notices` pass.

Done this round:
- The "Demo" tag on tickets, Orders rows and Recall rows is hidden inside the demo (the demo bar already says it) and still shows beside real tickets.
- On the notice strip the count of more warnings now reads "+N more" beside the batch name, where a long explanation can no longer cut it off.

Known, not done:
- **A hint of how many tickets are below the fold.** The tab count is the only hint. Needs a small "N more below" pill tied to the scroll position; not small enough to do safely this late.
- **Countdown format.** The strip shows minutes ("25 min") until under 10 minutes, then mm:ss ("9:58"). It is consistent with itself, but the two forms look different at a glance. Left as the design.
- **Bright slips at Night.** Paper slips stay light on the dark board. Readable (contrast checked) but bright in a dark kitchen. A dim-paper Night mode would be a design change.
- "Show me how it works" shows twice when the setup card and the empty board are up together.
- Wall list names that are too long end in an ellipsis.
- A 32 in 2560x1440 monitor is too small for Far display from 10 feet (see `docs/ux-test-report.md`); the next-action line fails on a 43 in TV.
- Nothing here was tested on a real tablet, TV or in a real kitchen.

## Follow-up round (night/a1-r10): known bugs closed

- **1920 px header and the Demo clock chip (B5):** not reproducible on this build. I measured the header at 1704, 1760, 1800, 1920, 2000, 2199, 2200 and 2560 px with the Demo clock chip showing, with and without "Sanitize" needing attention: one row every time (the header drops the tab icons first when tight). Test: `board-round10`.
- **Small touch targets (qa 09a/b/c/e):** the controls still under 44 px were the round "?" help link (28 px) and the "Back to my kitchen" demo bar button (34 px), plus the "Cabinet" tab text sticking out by 3 px at 390 px with Large text. The "?" link is now a 44 px target with the same 28 px circle, the demo bar buttons are 44 px on screens up to 1024 px wide and on touch, and the phone tabs have tighter padding. The old exemption list in `test/e2e/09-viewports.mjs` is switched off, so nothing is excused any more.
- **Tour ringing a hidden element (qa 13e/13f):** the tour ring now skips elements with no box (the hidden "On time" badge). Edit in `74-floor-tour.js`, A4 told.
- **Duplicate "Show me how it works":** the empty board leaves out its walkthrough button while the setup card is up, and puts it back when the card goes.
- **"N more tickets below":** a small pill at the bottom right of the board, above the all-day strip. It reads the position of every ticket only on scroll and about once a second, appears only when something is out of sight, scrolls down 85 percent of a screen when tapped, and is hidden in wall mode and the cabinet.

## Round 11: other kitchens and rough use

Screenshots: `docs/ux-shots/night/a1/r11-*.png`. Test: `test/board-round11.e2e.mjs`. Simulated in headless Chromium.

**Note on the earlier follow-up (r10):** its commits were first made on `night/a1-r8` and not pushed under the r10 name (the remote `night/a1-r10` is only the base). They are carried onto this branch as one commit, so this branch has everything.

### One-station kitchen on one phone (390x844, the only screen)
Checked: a blank kitchen with five dishes all made at one station and the other stations marked "Not used".
- **Fixed:** the board showed three tabs (All, the one station, Expo) that all list the same tickets, and the header took two rows (155 px). With one station in use those tabs now hide (the Cabinet tab stays when cooking ahead is on), the header is one row (78 px) and the first ticket starts at y=163 instead of 219.
- **Fixed:** the "Ticket #101 sent to 1 station." message now says "sent." in a one-station kitchen.
- **Works:** tickets at 390 px (two dishes per ticket, Start and Bump at 44 px or more), New ticket with a Menu/Order switch and a "View order" button, the sound bar, the "more tickets below" pill, no sideways scroll. The only control under 44 px was the "?" help link, fixed in the follow-up round.
- **No cook-ahead kitchen:** Cabinet, Hold, Sanitize and batch rows are hidden (round 3), so nothing about batches shows.
- **Left:** "Send to kitchen" is the button name for a person who is the kitchen (a main button, Freddy's call); a phone shows the Order pane in a second view, so a one-person order is: pick dishes, tap View order, tap Send.

### Counter service with no kitchen (a bakery)
What happens today: add dishes at a "no cooking" station (Cold and drinks) as one-step dishes; New ticket, pick items, choose Cash (Pay now), Send. The order is created and paid in one step; a ticket also appears on the board ("Make Croissant and Coffee, then tap DONE") with a Done button per item and Bump. Nothing blocks work, but the kitchen step feels extra:
- The ticket stays on the board until someone taps Done on each item and Bump; Bump on an unfinished ticket asks "Bump anyway?".
- The channel defaults to Dine-in; the strip, timers and "late" colours still run for a ticket nobody will cook.
- The "next step" line can be turned off in Menu, Next step, and stations that are not used are hidden.
Larger needs (not done): a setting that finishes one-step dishes and bumps the ticket as soon as it is paid ("counter service"); a Walk-up channel without a kitchen time limit. Both need engine and settings work.

### Rough use ("drunk Friday")
Scripted in one browser: a double-tapped Send made one ticket and one order; triple-tapping a dish started it once; a double-tapped Bump and 12 presses of Z (undo) lost or duplicated nothing; Escape pressed three times over stacked sheets left none open; rotating 1024x768 to 768x1024 and back mid-order kept the order lines with no sideways scroll; going offline and online kept every ticket (the app is local); a clock moved back three hours left the board working (the app's clock never runs backwards); three tabs open at once ended with the same seven tickets each. No console errors.
- **Known, not fixed:** an order that is half built is lost when the page is reloaded (the draft lives in memory only). Saving it would be a store/settings change.

### Long text
A 40-character customer name and 24-character dish names (the menu limit) were put on the slip, strip, wall, Far display, Orders, Recall, payment and the 390 px order sheet: no element runs past the screen or is cut off, except the wall list, which cut names to about 13 letters. **Fixed:** wall list names wrap onto two lines. The strip row with a 40-character batch name wraps cleanly at 390, 1280 and 1920.
