# Setup journey as it is today (measured 2026-10-23, build `kds/deploy` b8e569e)

Method: `ux-scripts/setup-journey.mjs` drives the built `dist/smokebox.html` in headless Chromium at 1280x800 (touch on) from empty browser storage. Three runs: **A** the guided path (welcome card, kitchen wizard, three own dishes, order, pay), **B** the naive path (ignore setup, try to order), **C** find menu editing without the wizard. Screenshots are in `docs/ux-shots/night/a2/` (named `NN-run-step.png`); the full step log is `docs/ux-shots/night/a2/journey.json`.

Honest limits: time is MODELED (1.2 s per tap, 3 s plus 0.25 s per character per typed field, 2 s per list choice, 4 s reading each new screen), not a person with a stopwatch. The script knows what to type and never hesitates, so real first-timers will be slower. Nothing was tried on a real tablet or in a real kitchen.

## Numbers

| Run | Taps | Typed fields | List choices | Screens | Dead ends | Confusing moments | Modeled time |
|---|---|---|---|---|---|---|---|
| A guided: first open to first PAID ticket, three own dishes | 24 | 7 (54 characters) | 4 | 13 | 0 | 8 | about 2.0 min |
| B naive: just try to order | 5 | 0 | 0 | 4 | 2 | 1 | about 0.4 min (ends on a paid ticket for a made-up dish) |
| C find the Add a dish form without the wizard | 4 (including closing the welcome card) | 0 | 0 | 3 | 0 | 1 | about 0.3 min |

Adding the three dishes alone (run A, steps 7 to 9): 11 taps, 6 typed fields, 3 list choices. The 2.0 minute total is a best case that depends on the owner choosing "Set up your kitchen", then "Archive the starter dishes", then "Open Menu and settings" in that order with no wrong turns.

## What a brand-new profile already contains (not the owner's)

Read from the store on first open: **21 sample dishes** priced $3.50 to $29.00 (plus three combos up to $103.00), **15 sample ingredients** with par and 86 levels, sales tax 0%, hours 11 to 21 (starter estimates). Batches 0, tickets 0, orders 0 and no sample history: the board and history are already empty, so the old "demo tickets on first run" problem is fixed. The menu is not.

## The journey, screen by screen (run A)

1. **First open** (`01-A-first-open.png`). Empty board, welcome card ("Set up your kitchen first...", text cut off after two lines), and a red **86 badge reading 17** before anyone has done anything.
2. **Set up your kitchen** (`02-A-wizard-open.png`). One long sheet: 1 tax, 2 hours, 3 PIN, 4 starter dishes, 5 food already cooked.
3. **Tax**: type 6, tap Save (2 taps, 1 typed). Hours and PIN were skipped by scrolling past.
4. **Archive the starter dishes**: tap, then confirm (2 taps). 21 dishes the owner never made are hidden, not removed.
5. **Open Menu and settings**: the wizard closes unfinished and the dark back office opens on the Menu panel. The Active list is empty and says "No items match. Change the filter above to see more." (`06-A-menu-page.png`).
6. **Add a dish** (x3): tap Add a dish, then per dish: name, price, and for dishes that are not Pit/Meats a station drop-down and a category drop-down, sometimes the One tap switch, then Add dish. After saving, name and price clear; station and category keep the last choice (`07` to `09`).
7. **Back to the line**: the welcome card still says "Set up your kitchen first" (`10-A-back-on-board.png`).
8. **New ticket**: three own dishes show with no sold-out items. Tap three tiles, Payment Cash, Send to kitchen: ticket #101, "Paid $21.20 by cash" (6% tax) (`12-A-first-paid-ticket.png`).
9. About 8 s after first open a toast offers a second, different setup list ("New tablet? Run the 6-step setup"); an amber "not logged" sanitizer badge is in the header.

## Problems, ranked

### P0: a new owner cannot get going, or is misled

1. **The barbecue menu and prices are the starting state.** 21 dishes, 15 ingredients, par and 86 levels come from `src/js/10-config.js:109` (menu) and the ingredient table beside it. In run B a sample cornbread was sent and paid at $4.00 and nothing marks it as a sample; paid orders are the revenue truth, so made-up dishes enter real sales totals. A5 owns the data layer.
2. **17 of 21 dishes are "86 sold out" on first open, with a red 86 badge reading 17**, because no batch of cooked meat is logged. The tile says only "Brisket is low" (`src/js/71-floor-order.js:97`; sold-out tiles toggled at `:555`, `:760`). Tapping a sold-out tile shows no message (run B step 2): a dead end with no hint to "log a batch" or "edit your menu". The same 17 appear on the back office Pace page, with a "Brisket: None, no brisket is ready" card for a food the owner may not sell. Only four dishes (cornbread, pickles, hush puppies, tea) can be ordered, and none is a main dish.
3. **Menu editing is buried.** From the board it is Back office (lands on Pace), then the 7th and last side item, named "Menu and settings" (`src/js/84-office-data.js:28`), then Add a dish (the form is hidden, opened at `:587`): 4 taps including closing the welcome card, and no screen says "add your menu". The wizard has no dish form either: step 4 only archives and points to "Open Menu and settings" (`src/js/77-floor-setup.js:125` to `136`).
4. **The wizard strands the owner.** "Open Menu and settings" closes the wizard without marking it finished, so back on the board the welcome card still says "Set up your kitchen first" (`src/js/77-floor-setup.js:136`, `:157`; card logic `src/js/70-floor-board.js:1704` to `1713`). After archiving, the empty Active list tells the owner to change a filter instead of "Add your first dish" (`src/js/84-office-data.js` empty line under `buildMenu`, about `:640`).

### P1: slow or confusing, but the owner gets through

5. **The Add a dish form is a settings form, not a quick entry.** 5 text boxes, 2 drop-downs and a two-way switch (`src/js/84-office-data.js:496` to `560`). Only name and price are needed, but station (Pit by default) and category (Meats by default) are two separate drop-downs the owner must change for every non-meat dish, which is easy to get wrong; prep time is in minutes and seconds; "Short name on tickets" is a field nobody asked for. After saving, only name, short name and price clear, so "save and add another" works by accident, not by design. The success line talks about "ingredients" and "its row below".
6. **Wizard step 5 asks for kilograms and a probe temperature up front** for food "already cooked" (`src/js/77-floor-setup.js:137` to `154`); a new owner with no pit data sees it as a required step. Hours are 24-hour numbers ("25 is 1 am"); tax says "ask your accountant"; the manager PIN sits on the first page. Five steps stacked on one long scroll look like homework.
7. **Two setup lists.** The kitchen wizard (5 steps) and the "New tablet? Run the 6-step setup" toast 8 s after first open (`src/js/77-floor-setup.js:166` to `172`, scheduled at `src/js/70-floor-board.js:478`). The toast arrives even after the wizard was used, and sits over the board (see also the 2026-10-23 audit). Step 6 of the tablet list ("Your products") sends the owner back to the same Menu page.
8. **Welcome card text is cut off** after two lines ("...tap START when you begin a dish an...") and the card persists until dismissed with the X (`src/js/70-floor-board.js:1687` to `1713`).
9. **A dish that needs cooked meat is not orderable until ingredients and a batch exist.** Not measured in this run (own dishes in run A had no ingredients); the sample dishes show the effect, see problem 2.

### P2: rough edges

10. An amber "not logged" header badge ("Sanitize, not logged. Press to log a check", `src/js/70-floor-board.js:1568` to `1575`) is visible at the first paid ticket and is not explained anywhere in setup.
11. New dishes arrive with prep time 2:00 already set to "Confirmed" (`07`/`09` screenshots show the Confirmed switch on), although the number is a guess; the rest of the app labels guesses "starter estimate".
12. In the back office header at 1280 px the Ember/Paper switch collapses into vertical letters ("P a p e r") next to Back to the line (`06-A-menu-page.png`; theme switch built near `src/js/84-office-data.js:1158` and the office header in `src/js/60-shell.js`).
13. The back office opens on Pace, an analytics page full of zeros, for an owner who has not sold anything yet; the "Take your first order" card sits below the fold.
14. There is no menu import at all today. The only Import in `src/js/84-office-data.js:1517` restores a Smokebox backup, so "paste, CSV or POS export" would be new work and must stay optional.

## Not checked

Closing the tab mid-wizard and returning; the PIN flow; adding ingredients to a cooked-meat dish and logging a batch; the "Practice run (2 minutes)" tour; "Busy-night demo" and Reset live data; touch targets on a real tablet; phone widths; Night theme and Large text; Far display; what happens if two dishes share a name beyond the form's own error line.
