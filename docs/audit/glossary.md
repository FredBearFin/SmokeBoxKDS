# Smokebox glossary (round 1 proposal)

Date: 2026-10-23. Branch `night/a4-r1`. Author: A4. Companion to `docs/audit/wording.md`.

One preferred word for each idea, a one-line plain definition an owner would understand, the words to stop using, and where the idea shows up in today's text. The counts come from `docs/audit/strings.tsv` (3,796 strings) by searching for the variants in the "Words it replaces" column; they count strings, so one long help text counts once. A count is a pointer, not a to-do list: many hits are already fine.

How to use this: when you write or fix any screen text, look the idea up here first. If a word is missing, add a row. Nothing here has been shown to a real restaurant owner yet. Choices marked "(Freddy)" are product calls.

Rules that apply to every row:
- US spelling and US words (register, not till; check, not cheque; mark done, not tick off).
- Weights in grams and kilograms; temperatures in degrees Fahrenheit on screen (the cook-endpoint field still shows Celsius, which is a mixed-unit problem noted in wording.md).
- Write a button's name exactly as it appears on the button, capital first letter only.
- Never say food or a kitchen "is safe" or "compliant". Say "in range" or "checks kept on time". The local health code decides.

| Preferred term | Words it replaces | Plain definition | Where it shows up now (strings, top files) |
|---|---|---|---|
| Order | bill, check, tab | Everything one customer or party asked for, with its prices, tax, tip and payment. One order can have several tickets (rounds). | 149 strings: 71-floor-order 39, 82-office-money 17, 72-floor-sheets 16, 73-floor-orders 14, 70-floor-board 13 |
| Ticket | slip, chit, order (for the kitchen slip) | The slip on the kitchen board for one round of food from an order. Cooks work tickets. | 334 strings: 81-office-pace 97, 72-floor-sheets 58, 70-floor-board 44, 40-metrics 37, 84-office-data 29 |
| Round | trip, second order | One more batch of food added to an order that is still open. It makes a new ticket. | 24 strings: 83-office-safety 12, 71-floor-order 4, 73-floor-orders 3, 40-metrics 2, 80-office-core 2 |
| Dish | plate (as a menu entry), product | One thing on your menu that you sell, such as a brisket sandwich. On a ticket a dish is called an item. | 34 strings: 84-office-data 14, 77-floor-setup 6, 74-floor-tour 5, 70-floor-board 4, 72-floor-sheets 4 |
| Item | line, product | One dish on one ticket, with a quantity. | 159 strings: 81-office-pace 35, 72-floor-sheets 20, 82-office-money 19, 71-floor-order 17, 40-metrics 16 |
| Station | zone, area | A cook position on the line, such as Pit, Fry or Expo. Each dish belongs to one station. Owners can rename stations. | 50 strings: 81-office-pace 14, 84-office-data 10, 72-floor-sheets 8, 70-floor-board 7, 60-shell 5 |
| Kitchen board | line screen, floor, KDS, the line | The main screen cooks look at: tickets, timers, buttons. Not the back office. | 17 strings: 60-shell 5, 80-office-core 3, 82-office-money 2, 83-office-safety 2, 84-office-data 2 |
| Back office | office, admin, dashboard | The area behind the Back office button: speed, sales, safety records, stock, menu and settings. | 30 strings: 84-office-data 14, 60-shell 6, 70-floor-board 3, 80-office-core 3, 72-floor-sheets 2 |
| New order | New ticket | The button that starts an order and sends its first ticket to the kitchen. | 23 strings: 84-office-data 9, 70-floor-board 5, 72-floor-sheets 5, 71-floor-order 2, 73-floor-orders 2 |
| Start / Done | START / DONE (capitals), fire | Start = a cook begins a dish. Done = the dish is finished. Write the button names as shown, with a capital first letter only. | 68 strings: 72-floor-sheets 16, 84-office-data 12, 70-floor-board 11, 74-floor-tour 6, 20-engine 5 |
| Look at it (Check it) | Check it (for two meanings) | The state of a dish whose usual time is up: look at the food, then tap Done. The app never decides a dish is done. | 8 strings: 70-floor-board 3, 72-floor-sheets 2, 20-engine 1, 25-deadlines 1, 74-floor-tour 1 |
| Send out | bump, ring out | Finish a ticket so it leaves the board. Help should add "(also called bump)" once. | 54 strings: 70-floor-board 16, 72-floor-sheets 11, 40-metrics 10, 81-office-pace 6, 20-engine 4 |
| Bring back | recall | Put a ticket that was sent out back on the board. | 15 strings: 72-floor-sheets 6, 70-floor-board 4, 20-engine 3, 40-metrics 1, 81-office-pace 1 |
| Rush | expedite, priority | A ticket marked to skip Finish together: every dish starts at once and the ticket goes to the front. | 20 strings: 72-floor-sheets 8, 70-floor-board 5, 71-floor-order 5, 20-engine 1, 84-office-data 1 |
| Void | cancel (for tickets), delete | Cancel a ticket or an empty order and record why. A voided ticket is counted in the reports. | 26 strings: 20-engine 6, 72-floor-sheets 5, 70-floor-board 4, 40-metrics 3, 60-shell 3 |
| On time / Running late / Overdue | late (for overdue), warn, amber | The three states of a ticket against its time limit. Late tickets in the glance means Overdue. | 83 strings: 81-office-pace 25, 40-metrics 15, 72-floor-sheets 11, 83-office-safety 9, 84-office-data 9 |
| Hold cabinet | warmer, holding, lamp, the pass | Wherever cooked food waits hot or cold until it is served. On screen it is called the cabinet after the first mention. | 68 strings: 72-floor-sheets 27, 83-office-safety 10, 70-floor-board 6, 84-office-data 6, 85-office-stock 6 |
| Batch | pan, pull, tray, hotel pan | One lot of cooked food in the cabinet, with its own temperature log and clock. | 138 strings: 72-floor-sheets 48, 83-office-safety 19, 84-office-data 19, 20-engine 15, 82-office-money 11 |
| Planned batch | coming batch, supply | A batch you told the board is on its way. It counts as stock only once it is ready. | 5 strings: 20-engine 3, 72-floor-sheets 2 |
| Take out | pull, pulled, use | Remove an amount of cooked food from a batch and log it. (Replaces Pull. Pulled pork stays as a dish name.) | 16 strings: 84-office-data 5, 10-config 4, 72-floor-sheets 3, 25-deadlines 2, 20-engine 1 |
| Amount per take-out | pull size, set unit | How much one tap of Take out removes, such as one pan or one whole brisket. | 4 strings: 84-office-data 3, 77-floor-setup 1 |
| Temperature reading | temp, check (for a reading) | A number from a probe thermometer, logged against a batch. "Take temperature" is the action. | 97 strings: 72-floor-sheets 33, 83-office-safety 19, 84-office-data 9, 20-engine 8, 40-metrics 7 |
| Serve-by time | hold time, expiry, hold limit | The time a batch must be taken off the menu or thrown out. Shown on the cabinet card. | 25 strings: 84-office-data 7, 72-floor-sheets 6, 20-engine 3, 25-deadlines 3, 82-office-money 3 |
| Quality limit | best-by, quality stage, safety limit (for the discard time) | The time after which a dish is off the menu until someone checks it. If it is right you may keep serving it, if your local rules allow. Decided (Freddy): no "best-by". The hard stop is the **Throw-out time**. | 32 strings: 72-floor-sheets 13, 25-deadlines 7, 84-office-data 5, 20-engine 3, 71-floor-order 2 |
| Throw-out time | discard time, safety limit, hold limit | The time after which the food must be thrown out. The owner sets it from the local health department. Decided (Freddy). | |
| Throw-out time (safety) | safety limit, hard cap | A safety limit. When it is reached the batch must be thrown out. Nothing overrides it. | 12 strings: 72-floor-sheets 4, 84-office-data 4, 71-floor-order 2, 20-engine 1, 77-floor-setup 1 |
| Throw out | discard, waste (verb), pull, dump | Remove a batch for good and record why. Past tense: thrown out. Waste is only a total (weight or dollars) of food thrown out. | 108 strings: 72-floor-sheets 24, 83-office-safety 19, 20-engine 17, 40-metrics 14, 82-office-money 8 |
| Thrown-out log | discard log | The list of every batch thrown out, with time, reason and initials, for your own records or your health department. | 5 strings: 72-floor-sheets 2, 77-floor-setup 2, 76-floor-discards 1 |
| Reheat | rethermalize | Bring food that dropped below the hot-hold temperature back up to the reheat temperature. Allowed once per batch, inside a time window. | 34 strings: 72-floor-sheets 18, 20-engine 8, 40-metrics 3, 83-office-safety 2, 84-office-data 2 |
| Cool in two steps | two-stage cooling, stage 1 / stage 2 | Cooling cooked food that is not going into the cabinet: first to a middle temperature, then to a low one, inside set hours. | 37 strings: 72-floor-sheets 21, 84-office-data 7, 20-engine 6, 40-metrics 1, 76-floor-discards 1 |
| Sanitize timer | sanitation timer | The countdown to the next wipe-down of food-contact surfaces. | 36 strings: 83-office-safety 10, 70-floor-board 8, 40-metrics 5, 25-deadlines 4, 20-engine 3 |
| Sold out | 86, out, ran out | No stock left of an ingredient, so the dishes that use it are off the menu. One of four reasons a dish can be off the menu. | 32 strings: 85-office-stock 12, 40-metrics 4, 72-floor-sheets 4, 71-floor-order 3, 25-deadlines 2 |
| Off the menu | 86, unavailable, 86 manual, 86 safety hold | A dish that cannot be ordered right now, for any reason: sold out, turned off by hand, safety hold, or past best-by. | 13 strings: 83-office-safety 5, 72-floor-sheets 3, 85-office-stock 3, 25-deadlines 1, 70-floor-board 1 |
| 86 board | 86 list, sold-out board | The screen listing what is sold out or off the menu. 86 is kitchen slang for "we are out of it". Define once on the board, then use plain words. | 98 strings: 72-floor-sheets 39, 85-office-stock 18, 84-office-data 10, 40-metrics 8, 71-floor-order 5 |
| Safety hold | locked, lockout, 86 safety hold | A batch that is out of range or out of time, so dishes made from it cannot be ordered until it is fixed or replaced. | 23 strings: 72-floor-sheets 8, 40-metrics 3, 83-office-safety 3, 20-engine 2, 71-floor-order 2 |
| Opening amount (par) | par, opening stock | What you start a normal day with for one ingredient. | 12 strings: 72-floor-sheets 5, 84-office-data 5, 85-office-stock 2 |
| Sold out at | 86 point, 86 level, threshold | The amount at which an ingredient counts as gone and dishes using it go off the menu. | 25 strings: 72-floor-sheets 9, 85-office-stock 7, 84-office-data 6, 25-deadlines 2, 77-floor-setup 1 |
| Cooked yield | static yield, cook-loss, model | Cooked weight divided by raw weight, as a percent. The starter number is a guess until you weigh your own batches. | 39 strings: 82-office-money 19, 84-office-data 10, 72-floor-sheets 7, 40-metrics 3 |
| Finish together (decided; off by default) | meal pacing, pacing, paced hold, plate sync | The setting that starts slow dishes first and holds quick ones back so the whole order is ready at the same time. | 56 strings: 40-metrics 19, 84-office-data 15, 81-office-pace 13, 72-floor-sheets 3, 71-floor-order 2 |
| Speed (back-office page, decided) | Pace | The back-office page about how fast tickets go out. The old name Pace clashes with pacing. | 17 strings: 25-deadlines 5, 81-office-pace 5, 80-office-core 3, 86-office-glance 2, 40-metrics 1 |
| Order type | channel, source | How an order came in: dine-in, takeout, drive-thru or delivery app. Each type has its own time limits. | 56 strings: 81-office-pace 10, 85-office-stock 10, 72-floor-sheets 9, 84-office-data 9, 80-office-core 5 |
| Money collected | takings, till, net sales (as a headline) | Money from paid orders: sales after discounts, plus tax, plus tips. Smokebox only records how an order was paid; it never charges a card. | 18 strings: 82-office-money 16, 40-metrics 1, 84-office-data 1 |
| Demo | practice, pretend, made-up, simulated | The mode with a sample menu and sample tickets that never touches the real kitchen. Made-up past days are **Sample history**. Decided (Freddy): Demo, not Practice. | 82 strings: 72-floor-sheets 42, 70-floor-board 14, 85-office-stock 12, 84-office-data 6, 40-metrics 2 |
| Sample history | sample data, simulated history | Fourteen made-up past days, so the back office has something to show on day one. Never your sales. | 49 strings: 80-office-core 14, 72-floor-sheets 11, 84-office-data 11, 40-metrics 4, 20-engine 2 |
| Starter estimate | default, guess | A number that came with the app (prep time, yield, cost, par). Replace it with your own and mark it Confirmed. | 73 strings: 84-office-data 34, 72-floor-sheets 12, 40-metrics 7, 77-floor-setup 7, 82-office-money 4 |
| Backup | export, dump, snapshot | A file with everything Smokebox saved on this device. Save one every day at close and keep a copy off the device. | 38 strings: 84-office-data 35, 20-engine 2, 60-shell 1 |
| Restore | import, load | Replace everything on this device with a backup file. | 8 strings: 84-office-data 7, 80-office-core 1 |
| Settings | Menu (header button), More | The header button that opens tools and settings. Decided (Freddy): Settings, so "menu" only means your dishes. | 90 strings: 84-office-data 19, 72-floor-sheets 14, 71-floor-order 8, 83-office-safety 8, 70-floor-board 7 |
| Menu (your dishes) | catalog, items list | The list of dishes you sell, their prices and what goes in them. Edited in Back office, Menu and settings. | 90 strings: 84-office-data 19, 72-floor-sheets 14, 71-floor-order 8, 83-office-safety 8, 70-floor-board 7 |
| Day / Night | Paper, Ember, theme, look | Bright or dark screen. One word pair for the board and the back office. | 117 strings: 85-office-stock 18, 72-floor-sheets 16, 84-office-data 15, 80-office-core 14, 82-office-money 12 |
| Customer | guest | The person the order is for. Also the name on a ticket (Walk-up if none). | 22 strings: 71-floor-order 7, 20-engine 3, 73-floor-orders 3, 40-metrics 2, 82-office-money 2 |
| Undo | revert, correct | Reverse the last action within 10 seconds. After that fix it by hand. | 35 strings: 72-floor-sheets 9, 40-metrics 5, 84-office-data 5, 20-engine 4, 60-shell 4 |
| PIN | passcode, password | Four digits that keep line cooks out of the back office. It is a door latch, not real security. | 39 strings: 84-office-data 27, 60-shell 7, 77-floor-setup 5 |
| Device | tablet, computer, browser (when you mean the machine) | The tablet, TV or computer Smokebox is open on. Use "tablet" only in the setup steps. "Browser" only when the step is about browser settings. | 72 strings: 84-office-data 30, 72-floor-sheets 16, 77-floor-setup 15, 60-shell 3, 70-floor-board 3 |

## Decisions inside the glossary (Freddy decided 1, 3 and 4 in round 12; 2 is still open)

1. **Send out versus Bump (Freddy, A1).** Kitchen-display vendors all say "bump", and a cook who has used another system will look for it. An owner who has not will not know it. Proposal: label the button "Send out" and add "(also called bump)" in Help once. If cooks in a trial say they want "Bump", switch back, but then use it everywhere (including "Bumped" lists).
2. **86.** Restaurant people know it. A part-time cook or a family member may not. Proposal: keep "86 board" as a screen name, define it on the board in one line, and use "sold out" and "off the menu" in all running text.
3. **Order type instead of channel (A3).** "Channel" is also used for the simulated sync strip. If that strip is removed (wording.md section i), "channel" disappears from owner text anyway.
4. **Practice (A1).** "Demo" is short and understood. The problem is five words for fake data. If "Practice" feels too gentle for the Demo button, keep "Demo" and retire the other four.

## Terms in code that owners never see (so no change needed)

`tcs`, `holdBasis`, `rung`, `ladder`, `I1 to I16` (engine rules) and `ledger` appear only in code, comments and setting keys. A guide for owners should not introduce them.
