# Plain-language audit of the words Smokebox shows (round 1)

Date: 2026-10-23. Branch `night/a4-r1`, built from `kds/deploy` at b8e569e. Author: A4 (wording, help and guide).

## What this is, and how it was made

`tools/extract-strings.mjs` walks every file in `src/js/` with a parser and writes `docs/audit/strings.tsv` (columns: file, line, kind, area, text). It found **3,796 strings** that look like words a person reads. I then read all of them, in file order. No `src/` file was changed.

Rows below are written as `file:line` (the line where the string starts, as in `strings.tsv`), the current text (shortened with `...` when long), the problem, and proposed text. Where a message is built from pieces with numbers in the middle, the proposal shows the numbers as `N`.

All of this comes from reading the code and strings. Nothing was tried on a real tablet or in a real kitchen, and nobody who runs a restaurant has read these proposals yet. They are proposals for Freddy and the file owners, not decisions.

## What the audit did not find (honest negatives)

The words named in the brief as likely jargon (TCS, hold basis, I-invariants, ledger, rung, ladder) are **not shown to users**. They appear only in code, comments and setting keys (for example `tcs`, `holdBasis`, `alerts.ladderThresholds`). The nearest visible cousins are "hard cap", "quality limit versus safety limit", "static yield", "par", "86 point" and "pull size", and those are covered below. The one place a code key is shown as text is `strings.tsv` line for `84-office-data.js:1041` (`alerts.ladderThresholds`); it is a log label, not a screen, so it is low value.

## Counts

| Type | Findings (rows in the tables below) |
|---|---|
| (a) Jargon | 32 |
| (b) Same thing, different names | 21 |
| (c) Buttons that do not say what happens | 22 |
| (d) Errors and refusals that blame the user or leave no next step | 18 |
| (e) Text that is too long | 14 |
| (f) Barbecue assumed on neutral screens | 18 |
| (g) Tone | 12 |
| (h) Legally risky claims | 16 |
| (i) Internal or developer text shown to owners | 12 |
| (j) Non-US words and spelling | 7 |

## Decisions the rewrites depend on (please read first)

These are the wording choices that touch many places. They are in `glossary.md` in full.

1. **"Menu" is two things.** The big header button called "Menu" opens settings and tools, but "the menu" also means the list of dishes ("Edit the menu", "Off the menu", "Menu and settings"). Proposal: rename the header button to **More**. The word "menu" then only ever means the dishes you sell.
2. **"Pacing" is two things.** "Meal pacing / Pace tickets" means starting slow dishes first so a plate finishes together. The back-office page called "Pace" means how fast the kitchen is. Proposal: the feature becomes **Finish together** (or "Staggered starts"), the page becomes **Speed**.
3. **Order is the customer's bill; ticket is the slip in the kitchen.** The header button "New ticket" really starts an order. Proposal: **New order**. Never "bill" or "check".
4. **One word for taking food away:** "thrown out" (not discard, not thrown away, not wasted, not pulled). Waste stays only as a total ("Waste cost").
5. **Off the menu is the overall state; "sold out" is one reason.** The four reasons (turned off by hand, safety hold, past best-by, ran out) should read as reasons, not as four kinds of "86". "86" stays as the name of the board and button, and gets one plain definition ("86 means sold out or off the menu").
6. **Two limits on a batch:** "quality limit" and "safety limit" are right but abstract. Proposal: **Best-by** (quality: taste it, may keep serving) and **Throw-out time** (safety: must be thrown out).
7. **"Demo", "sample", "pretend", "made-up", "simulated" are five words for fake data.** Proposal: **Practice** for tickets you start yourself, **Sample history** for the 14 pre-made days, **Starter estimate** for default numbers. Retire "pretend", "made-up" and "simulated" in owner text.
8. **No claim that the kitchen "is safe" or "compliant".** The app can say a reading was in range or a check was on time. The local health code decides everything else (section h).

## (a) Jargon a small restaurant owner will not understand

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 84-office-data.js:217 | `Menu and bills of materials` | "Bill of materials" is factory language. | `Dishes and what goes in them` |
| 84-office-data.js:219 | `Ticket time limits by channel` | "Channel" (see b) and "limits" hide the meaning. | `How long a ticket can take, by order type` |
| 84-office-data.js:220 | `Meal pacing` | Collides with the Pace page (see decision 2). | `Finish together` |
| 84-office-data.js:905 | `Meal pacing times all the items for a plate to finish together: ...` | Good idea, wrong name; the long text then explains it. | `Finish together starts the slowest dish first and holds quick dishes back, so a whole order is ready at once. Rush tickets skip this.` |
| 84-office-data.js:961 | `Hard cap: longest any batch may stay` | "Hard cap" is jargon. Its help says "limit kind" and "quality stage". | `Longest any batch may stay`; help: `After this many hours a batch is thrown out, whatever its own limit says.` |
| 84-office-data.js:681 | `Par` | Restaurant slang, many small owners do know it, but it is never explained next to the field. | `Opening amount (par)` |
| 84-office-data.js:690 | `86 point` | Two jargon words in one label. | `Sold out at`; help: `When stock falls to this amount, every dish that uses it is marked sold out.` |
| 84-office-data.js:709 | `Pull size (one set unit)` | "Pull" and "set unit" mean nothing to a new user. | `Amount per take-out`; help: `How much one tap on Take out removes from the cabinet, such as one whole brisket, one rack or one pan.` |
| 84-office-data.js:756 | `Static yield (cooked weight as a share of raw)` | "Static yield" is internal (versus the modeled yield). | `Cooked yield (cooked weight as a percent of raw weight)` |
| 84-office-data.js:897 | `Learning strength` | Reads like a machine-learning knob. | `How fast it learns your real times`; keep the help text. |
| 84-office-data.js:900 | `Trim a very long timing at` | "Trim" and the unit `× starter` need a math degree. | `Ignore a timing longer than`, unit `times the starter time` |
| 84-office-data.js:898 | `Learned time never below` | Same unit problem. | `Learned time stays above`, unit `times the starter time` |
| 84-office-data.js:1218 | `Wait before channels hear a quality 86` | Three jargon words. | `Wait before other apps hear an item is past best-by` |
| 84-office-data.js:1215 | `Channel update wait` | Same. | `Wait before other apps are told` |
| 84-office-data.js:1257 | `Ids and history never change, only what people read.` | "Ids". | `Old tickets keep working; only the names people read change.` |
| 72-floor-sheets.js:1823 | `A safety limit (time as a health control) throws the batch out.` | "Time as a health control" is regulation jargon. | `A safety limit means the batch must be thrown out when time is up.` |
| 72-floor-sheets.js:331 | `Two-stage cooling` | "Stage" is not how a cook talks. | `Cool in two steps` |
| 72-floor-sheets.js:489 | `Stage 1: reach` | Same. | `Step 1 of 2: get it to ... within ...` |
| 84-office-data.js:968 | `First cooling stage: cool to` | Same. | `Step 1 of 2: cool to` |
| 40-metrics.js:1461 | `Waiting under the lamp` | Cook slang; also used at 81-office-pace.js:281. | `Finished food waiting for the rest of the order` |
| 40-metrics.js:1461 | `Plate spread` | Opaque. | `Gap between first and last dish` |
| 81-office-pace.js:86 | `First to last item` | Fine alone, but pairs with "Plate spread". | Keep; use the same words in `40-metrics.js:1461`. |
| 81-office-pace.js:149 | `Pace index` | Index of what? | `Busyness` with the three words Comfortable / Busy / Behind kept. |
| 81-office-pace.js:499 | `Line friction` | Design-researcher language. | `Slip-ups on the board` |
| 81-office-pace.js:511 | `Refused taps` | Sounds like the screen is rude. | `Taps the app could not accept` |
| 81-office-pace.js:511 | `Bumped with items undone` | "Bumped" plus "undone" is confusing. | `Sent out before all dishes were done` |
| 81-office-pace.js:519 | `What the screen refused most` | Same. | `Taps that failed most often` |
| 40-metrics.js:1644 | `Forced bumps hide real ticket times and are left out of plate-sync numbers, so check ...` | "Forced bump" and "plate-sync" are both jargon. | `Tickets sent out before every dish was done hide the real ticket time, so they are left out of the speed numbers.` |
| 40-metrics.js:1411 | `If you had priced ... with the static ... % yield you would have been off by` | "Priced with the static yield". | `If you had used the fixed N% yield, your cost per cooked kg would be off by $N.` |
| 85-office-stock.js:474 | `Slowest 1 in 10` with text `90th percentile` | The label is plain; the sub-text "90th percentile" and "worst single update" are not. | Keep the label, drop `90th percentile`. |
| 85-office-stock.js:307 | `When each protein went 86` | "Protein" is menu-planner talk, and BBQ-flavored. | `When each main dish sold out` |
| 82-office-money.js:699 | `Texas A&M regression, hot-hold yield; starter model, confirm against your own weighed batches` | Reads like a citation. | `Based on published brisket cooking research. This is a starting guess; your own weighed batches are better.` |

## (b) The same thing under different names

See the glossary table for the preferred term. Each row below is a place that should change to match it.

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 70-floor-board.js:576 | `New ticket` (header button) | It starts an order (a bill) that also makes a ticket. Order screens elsewhere say "Order" (71-floor-order.js:337 `Order`). | `New order`; sheet title at 71-floor-order.js:205 and 71-floor-order.js:224 the same. |
| 73-floor-orders.js:169 | `New ticket` | Same button on the Orders sheet. | `New order` |
| 70-floor-board.js:577 | `Menu` (aria-label) and the visible button `Menu` at 70-floor-board.js:1673 | Collides with "the menu" (dishes). | `More` |
| 72-floor-sheets.js:2066 | `More` | Already exists as a section label, which will confuse after the rename. | Rename that section `Other settings`. |
| 77-floor-setup.js:46 | `...within reach of the warmer if you can.` | Only place that says "warmer". | `...within reach of the hold cabinet if you can.` |
| 40-metrics.js:1461 | `Waiting under the lamp` | A third word for "waiting food" (lamp, cabinet, hold). | See (a). |
| 72-floor-sheets.js:956 | `Log a pan when it goes into the cabinet.` | "Pan" here, "batch" everywhere else. | `Log a batch when it goes into the cabinet.` |
| 72-floor-sheets.js:341 and 72-floor-sheets.js:500 | `Pull` | "Pull", "pulled", "pull size" (84-office-data.js:709) and "Pulled pork" all collide. | `Take out` |
| 72-floor-sheets.js:1075 | `86 manual` / `86 safety hold` / `86 past quality limit` / `86 sold out` | Four kinds of "86" read as four different things. | `Turned off by hand` / `Safety hold` / `Past best-by` / `Sold out` |
| 20-engine.js:3500 | `marked 86 by hand` / `on a safety hold` / `past its quality limit` / `sold out` | Same four reasons, third spelling. | Same four words as above. |
| 85-office-stock.js:478 | `an 86'd item` | Also `86’d` (curly) at 81-office-pace.js:89 and `went 86`, `goes 86`, `is 86`. | One form: `sold out` in running text; `86` only on the board name. |
| 76-floor-discards.js:97 | `Discard log` (title) and 72-floor-sheets.js:593 `Discard batch` | "Discard" here, "thrown away" in 40-metrics.js:1175 and 82-office-money.js:571, "thrown out" in 72-floor-sheets.js:595. | `Thrown-out log`, `Throw out batch`, `thrown out` everywhere. |
| 80-office-core.js:81 | `Take an order on the line screen` | "Line screen" here, "kitchen board" at 70-floor-board.js:592, "floor", "Back to the line" at 80-office-core.js:922. | `Take an order on the kitchen board`; button `Back to the board`. |
| 60-shell.js:1443 | `Back to the line` | Same. | `Back to the board` |
| 71-floor-order.js:347 | `Customer` | "Guest" is used in 9 other strings (for example 71-floor-order.js:475 `Tap what the guest is allergic to.`). | Use `customer` everywhere. |
| 82-office-money.js:343 | `Takings` | UK word; also called "net sales", "collected", "what the till took". | `Money collected` (title) and `Sales after discounts` for net sales. |
| 80-office-core.js:962 | `Paper` / `Ember` (back-office look) and 84-office-data.js:1159 `Day` / `Night` (board look) | Two theme pairs with different names. | `Light` / `Dark` for both, or `Day` / `Night` for both. One setting each, same words. |
| 70-floor-board.js:1270 | `Check it` (a dish whose time is up) vs 72-floor-sheets.js:235 `Check temp` vs 25-deadlines.js:324 `Log a temperature.` | "Check" means look at the food in one place and take a reading in another. | Dish: `Look at it`; temperature: `Take temperature`. |
| 81-office-pace.js:306 | `Running late` vs 25-deadlines.js:364 `Late tickets` vs `Overdue` | Status ladder is On time, Running late, Overdue; the glance says "Late tickets" for overdue ones. | `Overdue tickets` in 86-office-glance.js:46. |
| 70-floor-board.js:1063 | `Bump` and 70-floor-board.js:564 `Recall` | Kitchen-display slang; only explained in Help. | `Send out` and `Bring back` (keep "bump" in the Help line: "Send out (also called bump)"). |
| 10-config.js:25 | `Pit` | Station name, fine as a default, but PIT/HOT/FRY/CLD/EXP are hard-coded in 70-floor-board.js:24 and 72-floor-sheets.js:1711 aria text. | Build that aria text from the station names the owner set. |

## (c) Buttons whose label does not say what happens

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 70-floor-board.js:1063 | `Bump` | Slang. | `Send out` |
| 70-floor-board.js:1140 | `Mark all` | All what? | `Mark all done` |
| 70-floor-board.js:1908 | `Make it a rush` / `Take off rush` | Fine but "rush" is unexplained on first use. | `Mark as rush` / `Remove rush` |
| 72-floor-sheets.js:341 | `Pull` | Does not say it removes food from the cabinet. | `Take out` |
| 72-floor-sheets.js:334 | `Start cooling` | Sounds like it starts a timer; really moves the batch off the menu into cooling. | `Move to cooling` |
| 72-floor-sheets.js:338 | `Correct: not kept` | Unreadable. | `Undo keep-serving` |
| 72-floor-sheets.js:721 | `Put back past limit` | Unreadable. | `Take back off the menu` |
| 72-floor-sheets.js:781 | `Plan this batch` | Plans what? | `Add a planned batch` |
| 72-floor-sheets.js:1210 | `86 it` | Slang as a verb. | `Mark sold out` |
| 72-floor-sheets.js:1614 | `Reset live data` | Sounds harmless; it erases tickets and batches. | `Erase today's tickets and batches` |
| 72-floor-sheets.js:1620 | `Load the demo` | Also erases what is on the device (see line 1621). | `Load practice tickets and food` |
| 72-floor-sheets.js:1618 | `Restart demo` | Same family. | `Restart practice` |
| 73-floor-orders.js:373 | `Round up` (tip) | Round up what? | `Tip: round up to the next dollar` |
| 73-floor-orders.js:368 | `None` (discount) | Reads as a button that does nothing. | `No discount` |
| 60-shell.js:1654 | `Later` | Later what? | `Remind me later` |
| 74-floor-tour.js:279 | `Skip` | Skip the step, or the whole tour? | `Skip the walkthrough` |
| 84-office-data.js:589 | `Use only my own dishes` | Really hides the sample dishes. | `Hide the sample dishes` (and 84-office-data.js:592 `Hide the sample dishes (archive)`). |
| 84-office-data.js:1503 | `Download backup (JSON)` | "JSON". | `Save a backup file` |
| 84-office-data.js:1505 | `Copy backup` | Copy where? | `Copy the backup text` |
| 84-office-data.js:1527 | `Check pasted backup` | Fine; keep. Listed because it is the model of a good label. | (keep) |
| 72-floor-sheets.js:2053 | `Specs` | Opens a designer's sheet (see i). | Remove from the owner menu. |
| 70-floor-board.js:1270 | `Check it` (row state) | Is the cook supposed to tap or taste? | `Look at it, then tap Done` |

## (d) Errors and refusals that blame the user or give no next step

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 20-engine.js:84 | `Nothing to change. A waiting item needs Start now before it can be started.` | Contradicts itself; no clear action. | `This dish is still waiting. Tap Start now to begin it early.` |
| 20-engine.js:90 | `That batch is locked or already discarded, so it cannot be used.` | No next step. | `That batch is locked or already thrown out. Open the hold cabinet to see what is available.` |
| 20-engine.js:97 | `That file is not a valid Smokebox backup. Nothing was changed.` | "Not valid" points at the person. | `Smokebox could not use that file, so nothing was changed. Pick a file named smokebox-backup-(date).json.` |
| 20-engine.js:107 | `Log a temperature first: a reading in range (hot food at N °F or higher), taken within the temperature-check interval, is needed before keeping it on the menu.` | Too long, jargon ("interval"). | `Take a new temperature first. Hot food must read N °F or higher.` |
| 20-engine.js:108 | `Enter your initials so the extension can be logged with who tasted it.` | "Extension" is internal. | `Enter your initials so the log shows who tasted it.` |
| 20-engine.js:94 | `Too late to undo: the undo window has passed. Fix it by hand instead.` | Fine in tone; "window" is vague. | `Undo only works for 10 seconds. Fix it by hand instead.` |
| 70-floor-board.js:449 | `The board needs the store, the icons and the UI kit. Reload the page.` | "Store" and "UI kit". | `Part of Smokebox did not load. Reload the page. If this keeps happening, restore a backup or call whoever set this up.` |
| 71-floor-order.js:603 | `The name is N characters. The limit is M.` | States the fault, no fix. | `That name is too long. Keep it to M characters (it is N now).` |
| 72-floor-sheets.js:1525 | `The simulator hit a problem (...). Try again, or reset live data.` | "Simulator"; suggests wiping data. | `The practice mode had a problem. Try again. If it keeps happening, reload the page.` |
| 72-floor-sheets.js:1533 | `That clock speed is not allowed.` | Blames. | `Pick one of the speeds shown.` |
| 72-floor-sheets.js:683 | `Tick at least one batch. A batch needs a fresh temperature reading first.` | UK "tick"; second sentence hides which batch. | `Choose at least one batch. Batches that need a new temperature are greyed out.` (US "grayed") |
| 84-office-data.js:177 | `That is not a number. Type digits only.` | Blames. | `Type a number, like 12.5.` |
| 84-office-data.js:1328 | `It is not readable JSON: it is probably not a Smokebox backup, or it was cut off.` | JSON. | `This file cannot be read. It may not be a Smokebox backup, or it may have been cut off while copying. Try the file again.` |
| 84-office-data.js:1334 | `Its records contradict each other (...), so loading it could corrupt the board.` | Scary, jargon. | `This backup looks damaged (...), so Smokebox did not load it. Use an older backup.` |
| 80-office-core.js:41 | `The end date is before the start date.` | OK but no fix. | `The end date is before the start date. Swap them.` |
| 60-shell.js:1359 | `Wrong PIN. Locked for 30 seconds.` | No recovery path for a forgotten PIN (the UX audit lists PIN recovery as unverified). | Add under the PIN pad: `Forgot the PIN? Ask the owner, or restore a backup made before it was set.` (needs A3 to confirm what recovery really exists first). |
| 99-boot.js:76 | `Use Data, then Back up, to keep a copy.` | The page is called "Menu and settings" and the section "Data, backup and reset". | `Open Back office, Menu and settings, then Data, to save a backup.` |
| 20-engine.js:99 | `This browser is blocking storage, so changes will not survive a reload. Allow site data or use a normal window.` | Right idea, but the owner may not know how. | `This browser will not save your work. Allow site data for this page, or open Smokebox in a regular (not private) window.` |

Good examples to copy: `84-office-data.js:849` (`Amber has to come before overdue (N). Raise the overdue time first, then this one.`), `20-engine.js:112` (the close-the-day message), and `60-shell.js:1180` (`Could not copy. Select the text and copy it by hand.`).

## (e) Text that should be shorter

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 84-office-data.js:812 | `Par is the stock you open with. When stock falls to the 86 point or below, ...` (about 560 characters) | One paragraph holds six ideas. | Four short lines: `Opening amount: what you start the day with.` / `Sold out at: dishes using it are marked sold out at this amount.` / `Weights are grams and kilograms; buns and cornbread are counted in pieces.` / `Yields and costs are starter numbers until you confirm them.` |
| 72-floor-sheets.js:1615 | `Reset live data erases every ticket, batch and event on this device, including all demo orders, ...` | 330 characters, buries the warning. | `This erases every ticket and batch on this device and cannot be undone. Settings and menu stay. Save a backup first.` |
| 72-floor-sheets.js:1590 | `Automatic orders, the auto crew, the 12-ticket rush and sample history come from a separate simulator module that is not in this build. ...` | "Module", "build". | `Practice mode is not part of this copy of Smokebox. The clock speed and Reset still work.` |
| 72-floor-sheets.js:2061 | `For a TV or a tablet read from across the kitchen: a much bigger warning strip ...` | 270 characters. | `Bigger type for reading from across the kitchen. Hides the On time label so only late tickets stand out.` |
| 72-floor-sheets.js:2063 | `For a wide screen or TV (1700 px and wider) in one window: ...` | Pixels, 330 characters. | `For a wide TV: the kitchen board in the middle, open orders on the left, manager glance on the right.` |
| 84-office-data.js:986 | `Smokebox never lets hot hold go below 135 °F, and it refuses any limit outside the range ...` | Long and makes a promise (see h). | `Each limit has an allowed range, shown under the field. A change applies from the next check.` |
| 84-office-data.js:1510 | `Back up at least once a day, at close. Keep a copy off this device (email it to yourself or use a USB drive): if ...` | Good advice, slightly long. | `Back up every day at close, and keep a copy off this device (email it to yourself or use a USB drive).` |
| 84-office-data.js:1057 | `How many minutes before a batch reaches its limit the board warns, loudest at the last time. ...` | 280 characters. | `How many minutes before a batch's limit the board warns you. The last warning is the loudest and cannot be under 5 minutes.` |
| 72-floor-sheets.js:1822 | `The N-hour clock starts at the first reading below ... That is a deliberate difference from the research report this app started from. ...` | Defends a design choice in front of the owner. | `The N-hour clock starts at the first reading below N °F, not when the food left the heat.` |
| 77-floor-setup.js:49 | `Open the Menu and settings page and enter your real cost per kg, the 86 point, the pull size (...), the hold limit, the rest time and whether the limit is a quality or a safety limit ...` | One 560-character step. | Split in two steps: `Enter your cost per kg and sold-out amount for each product.` and `Check each hold limit. Ask your health department if you are not sure whether it is a quality or a safety limit.` |
| 77-floor-setup.js:46 | `Put the tablet where the person at the cutting board can tap it without walking, ...` | Good content, long. | `Put the tablet within arm's reach of the person who slices and logs food. If it is far away, pulls will not get logged and the waste numbers will be wrong.` (then change "pulls" per the glossary) |
| 40-metrics.js:1587 | `Median ticket time was ... with pacing off and ... with it on; pacing holds early items on purpose so the plate finishes together, so it is not meant to make tickets faster` | Insight text that is a paragraph. | `Finish together holds quick dishes on purpose, so tickets may take a little longer while plates come out together.` |
| 82-office-money.js:477 | `Whether ingredients are eating a bigger share of the menu price. The shaded band is the 28 to 35% range many restaurants aim for, a rule of thumb ...` | Five ideas. | `How much of each menu price goes to ingredients. The shaded band is the 28 to 35% many restaurants aim for. Days above it are worth a look.` |
| 81-office-pace.js:315 | `Look for the widest part of each bar. A wide "Waiting at expo" part means finished food is sitting, not cooking. Items cooked in one step have no start tap, ...` | 330 characters; statistics caveats inline. | Show the first two sentences; move the caveat to a small `Why are some times estimated?` line. |

## (f) Barbecue assumed on screens that should be neutral

Smokebox is a BBQ product by design, so BBQ examples on the sample menu and tour are fine. These rows are places where the *wording of a setting, help or report* assumes the owner runs a smoker. Anyone selling another cooked-ahead food (fried chicken, curry, roast) sees them too.

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 72-floor-sheets.js:281 | `Add a batch when food comes out of the smoker or the kitchen.` | Smoker. | `Add a batch when food is cooked and goes into the cabinet.` |
| 72-floor-sheets.js:774 | `Comes off the smoker at` (and lines 778, 781, 783, 791, 811, 816) | Seven strings. | `Ready at` / `Comes out at` |
| 72-floor-sheets.js:782 | `Tell the board a batch of ... is coming. It counts as supply from when it is ready to serve, not as stock ...` | "Supply" versus "stock". | `Tell the board a batch is on its way. It counts once it is ready to serve.` |
| 72-floor-sheets.js:937 | `Up to 40 characters, for example "Brisket, second pit".` | Pit. | `for example "Brisket, second batch".` |
| 72-floor-sheets.js:1615 | `The board and the pit start empty.` | Pit. | `The board and the cabinet start empty.` |
| 84-office-data.js:1640 | `Live data cleared. The board and the pit are empty` | Pit. | `The board and the cabinet are empty` |
| 84-office-data.js:1184 | `Set it to when the pit master starts.` | Role name. | `Set it to when the first cook starts.` |
| 84-office-data.js:712 | `What one tap on Pull takes out of the cabinet: one whole brisket, one rack, one pan.` | Example is fine (a hint), word "Pull" is not. | `What one tap on Take out removes from the cabinet: for example one pan or one tray.` |
| 25-deadlines.js:214 | `Start the next batch by ..., not counting anything still on the smoker.` | Smoker. | `not counting anything still cooking.` |
| 20-engine.js:110 | `Pick a time when the batch comes off the smoker: within the next day and a half, ...` | Smoker. | `Pick a time when the batch will be ready: within the next 36 hours, and not after its serve-by time.` |
| 86-office-glance.js:24 | `No brisket is ready to serve right now.` and 86-office-glance.js:50 label `Brisket` | Hard-coded to brisket, whatever the menu. | `Nothing is ready to serve right now.` and label the main cooked item the owner picks (A3/A5 to choose how). |
| 72-floor-sheets.js:2063 | `...a manager glance on the right (money so far, late tickets, the 86 list, when brisket runs out).` | Brisket. | `when your main item runs out` |
| 85-office-stock.js:307 | `When each protein went 86` | See (a). | `When each main dish sold out` |
| 82-office-money.js:611 and 82-office-money.js:614 to 82-office-money.js:751 | `Brisket yield`, `Brisket loses weight in the smoker`, `Raw weight put in the smoker` ... (about 35 strings) | A whole section about one product, shown to everyone. | Show it only when the menu has brisket; otherwise hide it. (Product call for A3.) |
| 72-floor-sheets.js:1028 | `Brisket yield comes from the Texas A&M cook-loss model.` | A source name in the middle of a form. | `Yield is a starting guess based on published research.` |
| 74-floor-tour.js:106 | `Each dish belongs to a station: FRY, PIT, CLD. Hush puppies take the longest...` and 74-floor-tour.js:304 | The walkthrough ticket needs hush puppies, brisket sandwich and sweet tea. If the owner has archived the sample dishes (setup step 4), line 304's error appears. | Make the tour use dishes the owner actually has, or say `The walkthrough needs the sample dishes. Unarchive them in Menu and settings.` (A2). |
| 72-floor-sheets.js:1834 | `Smokebox is a kitchen display for a BBQ line` | Fine as a pitch, wrong for About if the product widens. | `Smokebox is a kitchen display for restaurants that cook food ahead: tickets, a hold cabinet and a sold-out list.` Freddy to decide. |
| 77-floor-setup.js:142 | `Skip this if the pit is empty.` | Pit. | `Skip this if the cabinet is empty.` |

## (g) Tone: shouting, cutesy, apologetic

The app is rarely apologetic (good). Problems are the spoken call-outs, a few chatty lines, and capital letters.

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 25-deadlines.js:534 | `Order up! Ticket N! N items!` | Restaurant theatrics; "order up" means *ready*, but here it means *new*. A cook may think food is ready. | `New ticket N. N items.` |
| 25-deadlines.js:536 | `Fire X now! Ticket N!` | "Fire" is chef slang; shouting. | `Start X now. Ticket N.` |
| 25-deadlines.js:537 | `Still waiting on X! Fire it now! Ticket N!` | Same. | `X is still waiting to start. Ticket N.` |
| 25-deadlines.js:538 | `Ticket N is up! Ring it out!` | "Ring it out" is expo slang. | `Ticket N is ready. Send it out.` |
| 25-deadlines.js:540 | `is past quality! Check it now!` | Exclamations. | `X is past its best-by time. Taste it now.` |
| 25-deadlines.js:541 | `expired! Pull it and log it now!` | "Pull it". | `X has run out of time. Throw it out and log it.` |
| 25-deadlines.js:542 | `Heads up! X expires in N minutes! Act now!` | Three alarm phrases in one line. | `X runs out of time in N minutes.` |
| 70-floor-board.js:1165 | `Tap START on` (and 72-floor-sheets.js:1744, 74-floor-tour.js:106, 74-floor-tour.js:111) | Capitals for a button that reads `Start`. | Write button names exactly as they appear: `Tap Start on`. Same for `DONE`, `RUSH`. |
| 71-floor-order.js:465 | `RUSH is on: ...` | Capitals. | `Rush is on: ...` |
| 82-office-money.js:439 | `The hours that pay the bills.` | Cutesy, and "second cook wave". | `The hours that bring in the most money.` |
| 85-office-stock.js:139 | `...so there is no story to tell.` | Cutesy. | `...so there is nothing to show.` |
| 81-office-pace.js:141 | `The ring wakes up when the line is moving.` | Cutesy. | `The ring fills in once tickets are being sent out.` |

Voice call-outs are a deliberate product choice (the founder wants an active expo-caller). I have not argued against spoken warnings, only against the slang, the exclamation marks and the repeated alarm words. A4 owns a short list of approved spoken phrases once Freddy picks the style.

## (h) Anything legally risky: safety, compliance or certainty the app cannot back

Smokebox helps a person follow their local health code; it does not decide whether food is safe. These lines say or imply it does. The local rules always win (the app itself says so at 72-floor-sheets.js:677 and 83-office-safety.js:381, which is the right tone).

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 83-office-safety.js:167 | `Was the kitchen safe?` | Asks and answers a safety question a screen cannot answer. | `How did the checks go?` |
| 83-office-safety.js:160 | `The kitchen stayed safe.` / `The kitchen stayed mostly safe...` / `Food safety slipped and cost sales.` | A claim of safety. | `All checks were done on time and no food was thrown out for time or temperature.` / `Most checks were done, with one thing to look at.` / `Some checks were missed and a dish was off the menu.` |
| 83-office-safety.js:176 | `Safe` / `Watch` / `Problem` | The green state is called "Safe". | `On track` / `Watch` / `Needs attention` (already used at 83-office-safety.js:195). |
| 83-office-safety.js:28 | `Safe to serve` | Legend that tells people food is safe. | `In range` |
| 83-office-safety.js:291 | `Green bars are safe to serve.` | Same. | `Green bars are batches whose readings were in range.` |
| 83-office-safety.js:198 | `Compliance score` (and 83-office-safety.js:206 `Compliance`, 83-office-safety.js:207 aria text) | "Compliance" implies the kitchen complies with the law. It only measures how often checks were logged on time. | `Checks kept on time` |
| 72-floor-sheets.js:1751 | `Smokebox warns before a batch is unsafe and locks one that is.` | The app cannot know when food is unsafe. | `Smokebox reminds you to take temperatures and flags readings and times outside your limits.` |
| 72-floor-sheets.js:234 | `Holding fine` (also 20-engine.js:539 `Holding fine.`) | Implies fine = safe. | `In range` |
| 77-floor-setup.js:152 | `It is not being served until the temperature is safe.` | Same. | `It will not be served until its temperature is in range.` |
| 84-office-data.js:975 | `Smokebox never lets hot hold go below 135 °F: that is the food-code minimum.` (also 84-office-data.js:977, 84-office-data.js:978, 84-office-data.js:986) | "Never lets" is a promise, and "the food-code minimum" is true only of the FDA model code; state and local codes can differ. | `135 °F is the FDA Food Code minimum. Your state or county may require more. Smokebox will not accept a lower hot-hold limit.` |
| 84-office-data.js:1000 | `Legal minimum` / `Legal maximum` | A legal claim. | `FDA Food Code minimum` / `FDA Food Code maximum` |
| 72-floor-sheets.js:1816 | `...They start from the FDA Food Code (3-501.14, 3-501.16, 3-403.11 and 4-602.11) and are starter values until the owner confirms them.` | Mostly honest (says starter values). Add that local rules govern. | Add: `Your local health department's rules apply.` |
| 83-office-safety.js:312 | `An empty chart in a busy range is a good sign.` and 83-office-safety.js:357 `None in this range is good news.` | Reassurance without basis. | `Nothing was thrown out in this range.` |
| 77-floor-setup.js:49 | `Slaw, potato salad and banana pudding start as quality limits: confirm them (cold food held outside temperature control needs a safety limit).` | Two issues. The default is a quality (taste-it-and-keep-serving) limit for cold dishes that are often made with mayonnaise, eggs or dairy. The sentence then states a regulatory rule as fact. | Product risk, not only wording: default these to a **safety** limit, and say `Ask your health department which limit applies.` (A5 for the config, A2 for the text.) |
| 77-floor-setup.js:44 | `Saved data is protected.` | Overclaims. The browser agreed to try to keep it; it can still be lost. | `Your browser agreed to keep this data. Still save a backup every day.` |
| 85-office-stock.js:209 | `cook about ... (typical demand plus 10%...)` | A forecast stated as an instruction. | `A rough guide: about N kg (typical demand plus 10%).` |

## (i) Internal or developer text shown to owners

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 72-floor-sheets.js:1912 and 72-floor-sheets.js:1884 to 72-floor-sheets.js:1977 (about 70 strings) | The `Specs` sheet: `Parchment`, `Zinc`, `Brisket amber`, `Barlow Condensed`, `The original printed a fixed 7.8:1`, `What changed from the original file`, `Contrast, computed live` | Designer and developer notes in an owner's menu. | Remove `Specs` from the menu. Keep the honest notes (`Not tested in real sunlight`, `Local rules win`) in About. |
| 72-floor-sheets.js:1834 | `...It is a separate app from Pitcall, the cook-count app.` | Owners have never heard of Pitcall. Also 84-office-data.js:1676, 85-office-stock.js:280, 40-metrics.js:1605 (`Pitcall can use the sell-out time to set tomorrow's cook count.`). | Delete all four, until the product exists. |
| 10-config.js:73 | `Starter cost: USDA average brisket $11.05/lb for the week ending 2026-09-25 (from the Pitcall notes), about $24.36/kg. Unverified here.` | Source note shown as help; pounds. | `Starter cost. Replace it with your supplier's price per kg.` (A5) |
| 60-shell.js:1690 to 60-shell.js:1717 | `SB.floor is not loaded in this build...` `Floor placeholder` | Developer stubs. Only shown if a module fails to load, but then the owner sees them. | `This screen did not load. Reload the page.` |
| 70-floor-board.js:449 | `The board needs the store, the icons and the UI kit.` | Internal names. | See (d). |
| 80-office-core.js:1172 | `This page is not part of this build yet.` and 80-office-core.js:939 `Coming soon` | "Build". | `This page is not ready yet.` Better: hide unfinished pages. |
| 82-office-money.js:301, 83-office-safety.js:22, 83-office-safety.js:36, 85-office-stock.js:22, 85-office-stock.js:54 | `The back-office kit is not available (80-office-core.js).` `The shared helpers for the Safety page (82-office-money.js) did not load.` | File names. | `This page did not load. Reload the page.` |
| 80-office-core.js:371 and 60-shell.js:1178 | `Technical details`, `Module:`, `Stack:` | Fine behind a closed "Technical details"; keep, but collapsed. | (keep collapsed) |
| 72-floor-sheets.js:1525 | `The simulator hit a problem` | Internal. | See (d). |
| 84-office-data.js:1672 | `What is simulated` | The About section is honest and useful, but the title and "simulated" read technical. | `What is practice only` |
| 85-office-stock.js:454 and 72-floor-sheets.js:1113 | `Channel sync (simulated)` with `Simulated: no live POS connected` repeated at 72-floor-sheets.js:105, 85-office-stock.js:456, 85-office-stock.js:460, 85-office-stock.js:485 | A fake feature advertised eight times. The owner has no POS to connect. This is a "fewer shiny features" candidate: hide the whole channel-sync strip and its back-office chart until a real connection exists. | Remove from owner screens (product call for Freddy, A1 and A3). |
| 40-metrics.js:1690 | `This is simulated sync; no live POS is connected.` | Same. | Same. |

## (j) Non-US words and spelling

| file:line | current text | problem | proposed text |
|---|---|---|---|
| 82-office-money.js:343 | `Takings`, `What the till took`, `its takings show up here` (82-office-money.js:346, 82-office-money.js:350, 82-office-money.js:378, 84-office-data.js:1228, 40-metrics.js:1761) | "Takings" and "till" are British. | `Money collected`, `What the register took`; or `Sales and money collected`. |
| 72-floor-sheets.js:1965 | `...this screen does the maths.` | UK spelling. | `math` (or drop the sentence, see i). |
| 25-deadlines.js:369 | `Sanitize and tick it off.` | "Tick off". | `Sanitize and mark it done.` |
| 72-floor-sheets.js:683 | `Tick at least one batch.` | "Tick". | `Choose at least one batch.` |
| 81-office-pace.js:326 and 81-office-pace.js:429 | `the queue is`, `the station that is queueing` | "Queue" is understood in the US but "line" is the everyday word, and "line" already means the cook line. | `the wait before cooking starts`, `the station that is backed up` |
| 77-floor-setup.js:42 | `Auto-Lock (iPad) or Screen timeout (Android), to Never` | Fine. | (keep) |
| 72-floor-sheets.js:1816 | `FDA Food Code (3-501.14, ...)` | Fine; US. | (keep) |

Weights: all food weights shown are grams or kilograms. Exceptions: the sample dish names `Brisket, 1/4 lb`, `Brisket, 1/2 lb`, `Pulled pork, 1/4 lb`, `Smoked turkey, 1/2 lb` (10-config.js:110 to 10-config.js:118) and the starter-cost note at 10-config.js:73. A US BBQ menu sells by the pound, so the dish names are probably right for customers; Freddy to confirm whether the rule "grams and kg" covers menu names.

## The ten highest-value rewrites

Ranked by how many people see them and how much confusion or risk they remove.

1. **Rename the header button `Menu` to `More`** (70-floor-board.js:577, 70-floor-board.js:1673 and the aria-label, 60-shell.js:796, 72-floor-sheets.js:2066). Fixes the biggest naming collision in the app. Owner of the file: A1.
2. **`New ticket` becomes `New order`** (70-floor-board.js:576, 73-floor-orders.js:169, 71-floor-order.js:205, 71-floor-order.js:224, 71-floor-order.js:1017 and the matching Help text). Owner: A1.
3. **Remove every "is safe / was safe / Compliance" claim** (83-office-safety.js:28, 83-office-safety.js:160, 83-office-safety.js:167, 83-office-safety.js:176, 83-office-safety.js:198, 83-office-safety.js:291, 72-floor-sheets.js:1751, 72-floor-sheets.js:234). Replace with "in range" and "checks kept on time". Owner: A3 (and A1 for the floor lines).
4. **Change the default limit of the cold dishes (slaw, potato salad, banana pudding) from quality to safety, and drop the sentence that states a rule** (10-config.js defaults; 77-floor-setup.js:49). Owner: A5 for the config, A2 for the sentence. Product risk, not just wording.
5. **Replace the voice call-outs' slang and exclamation marks** (25-deadlines.js:534 to 25-deadlines.js:542): `New ticket 12. 3 items.` / `Start fries now. Ticket 12.` / `Ticket 12 is ready. Send it out.` Owner: A5 (text) with A1 (sound).
6. **One word for fake data: "practice"** and delete every `pretend`, `made-up`, `simulated` in owner text (about 30 strings in 72-floor-sheets.js, 84-office-data.js, 85-office-stock.js, 70-floor-board.js). Hide the fake "Channel sync" strip. Owner: A1, A3.
7. **Rename the feature "Meal pacing" to "Finish together", and the page "Pace" to "Speed"** (84-office-data.js:220, 84-office-data.js:909, 80-office-core.js:22, 81-office-pace.js:95 and the Pacing strings in 40-metrics.js). Owner: A3, A2.
8. **Take `Specs` out of the owner menu and cut the Pitcall mentions** (72-floor-sheets.js:1912, 72-floor-sheets.js:1834, 84-office-data.js:1676, 85-office-stock.js:280, 40-metrics.js:1605). Owner: A1, A3.
9. **Rename the two limits: "Best-by" (quality) and "Throw-out time" (safety)**, and "Hard cap" to "Longest any batch may stay" (72-floor-sheets.js:434, 72-floor-sheets.js:1823, 84-office-data.js:740, 84-office-data.js:961, 20-engine.js:535, 25-deadlines.js:134). Owner: A5 (engine text), A3 (settings), A1 (cabinet).
10. **Jargon in Menu and settings labels**: `86 point`, `Pull size`, `Static yield`, `Par`, `Learning strength`, `Trim a very long timing at`, `Wait before channels hear a quality 86` (84-office-data.js:681 to 84-office-data.js:900, 84-office-data.js:1218). Owner: A3.

Close behind: `Takings` and `till` to US words (82-office-money.js and 40-metrics.js:1761); rewrite the import-error messages that say "JSON" and "corrupt the board" (84-office-data.js:1328 to 84-office-data.js:1335); the PIN pad needs a "forgot the PIN" line (60-shell.js:1359).

## What I did not check

- Strings that the parser could not see as one piece: text built by joining several variables, template pieces with live numbers (the proposals show `N`), and anything stored in saved data or typed by the owner.
- Text inside CSS (`content:` rules), the `<title>` and the no-JavaScript note in `src/index.template.html` (both fine on a read), image alt text, and sound.
- How the words look on screen: truncation, line breaks, text size. This is a read-through of strings, not a screenshot review.
- `SPEC.md`, `docs/*.md`, the test files and `reference/`. Wording in the unit tests (some check message text) will need updating when messages change; I did not search the tests for them.
- Whether any proposed word is already used in a way I did not see (for example "More" is already a section label, noted above).
- Real readers: nobody who runs a restaurant has read these. A short read-aloud session with one owner would settle the glossary choices faster than I can.

## Who owns the fixes

| Area | Files | Owner |
|---|---|---|
| Kitchen board, ordering, floor sheets (cabinet, 86, recall, orders, help, settings menu), voice call-outs | 70, 71, 72, 73, 74, 76 | A1 |
| First-time setup, tour, walkthrough ticket | 74, 77 (and the setup text in 72 about the tablet) | A2 |
| Back office pages and Menu and settings | 80 to 86 | A3 |
| Engine messages, config defaults, deadline text, metrics insight text | 10, 20, 25, 40 | A5 |
| Shared UI kit (PIN pad, banners, error cards) | 60, 99 | A1 for floor-facing, A3 for office-facing; wording only |
| Glossary, guide, approved phrases | docs/audit/glossary.md, later 78-guide.js | A4 |
