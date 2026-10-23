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
