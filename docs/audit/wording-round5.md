# Wording audit, round 5 (new and changed strings only)

Date: 2026-10-23. Branch `night/a4-r5`, built from `kds/deploy` 2b126bc. Author: A4.

Method: `tools/extract-strings.mjs` was re-run on the merged code (4,368 strings now; 3,796 in round 1). I compared it with the round 1 file and read the 755 strings that are new or changed, leaving out my own Guide files (78 and 79). Files with the most new text: 77-floor-setup.js (setup flows, cooked-ahead sheet, portions, stations), 72-floor-sheets.js (initials, practice wording), 87-office-closeday.js (Close the day), 84-office-data.js (units, Food Code notes), 82/83 (office pages), 60-shell.js (PIN fold). The new text is mostly good: plain words, no safety claims, careful Food Code notes. The rows below are what is left.

Nothing was tried on a real tablet. Line numbers are where the string starts in `docs/audit/strings.tsv` on this build.

## Good, keep (examples to copy)

- `20-engine.js:116` (a backup from the demo or another kitchen): says what happened, that nothing changed, and what to do.
- `77-floor-setup.js:473`: "4 hours is a careful starting point. Your local health code decides what is allowed: ask your health department and change this to match."
- `84-office-data.js:1003` to `1006`: every Food Code number is followed by "Your local health code applies".
- `87-office-closeday.js:67`: "It does not lock anything: you can still take orders afterwards, and closing again later will include them."
- `60-shell.js:1343` to `1344` (PIN fold): says there is no reset and what the only way back in costs.

## Rewrite table

| file:line | current text | proposed text | owner |
|---|---|---|---|
| 77-floor-setup.js:150 | placeholder `How many` (cut off to "How man" in the counted-dish box at 1280 wide) | `How many?` with a wider box, or placeholder `Count` | A2 |
| 77-floor-setup.js:482 | `Tick each dish and the grams of it in one serving (150 is a starting guess).` | `Select each dish and enter the grams of it in one serving (150 is a starting guess).` ("Tick" is a non-US word; "enter" says what to do.) | A2 |
| 77-floor-setup.js:411 | `Brisket in the morning, slaw in the cooler.` | `Chili in a warmer, potato salad in a cooler.` (neutral examples on a neutral screen) | A2 |
| 77-floor-setup.js:572 | `Some places cook brisket or pork in the morning and slice it to order, or keep cold sides in a cooler.` | `Some places cook a big batch in the morning and serve from it all day, or keep cold sides in a cooler.` | A2 |
| 77-floor-setup.js:68 | station tile hints `Smoker and slicing`, `Stove and sides`, `Fryer` | `Smoker, grill or oven`, `Stove and sides`, `Fryer` (or drop the hint under the station name; see decisions-for-freddy.md, item 8) | A2 |
| 77-floor-setup.js:446 | `An example barbecue menu with made-up prices, so you can see how Smokebox looks with food on it.` | `An example menu with sample prices, so you can see how Smokebox looks with food on it.` ("made-up" is one of five words for fake data) | A2 |
| 77-floor-setup.js:46 | `6. Your dishes: ... enter your real cost per kg, the 86 point, the pull size (one whole brisket, one rack, one pan), the hold limit and the rest time ...` (in Set up this tablet) | `Enter your real cost per kg, the amount at which a dish is sold out, the amount one take-out removes, and the hold limit for each product.` (the old jargon came back in this sheet) | A2 |
| 77-floor-setup.js:48 | `7. Hold limits: ... Slaw, potato salad and banana pudding start as quality limits.` | Delete the second sentence: it names dishes a blank kitchen does not have, and the default may change (decision 9). Keep `Ask your health department which limit applies to each food you hold.` | A2 |
| 77-floor-setup.js:157 | `I count what I made` (button that opens the counting box) | Keep. Consider `Count portions` if testers do not find it. | A2 |
| 80-office-core.js:1207 and 1208 | `... Turn it on in Settings if you cook food ahead ...` | `... Turn it on under Dishes and prices (Yes, I cook ahead) if you cook food ahead ...` ("Settings" is not where the switch is) | A3 |
| 80-office-core.js:1220 | `Could not turn it on. Open Menu and settings and try there.` | `Could not turn it on. Open Menu, then Dishes and prices, and tap Yes, I cook ahead.` | A3 |
| 82-office-money.js:635 | `Smoked meat loses weight in the smoker and the hold cabinet.` (and 641, 679, 725, 757 `your main smoked meat`) | `Cooked meat loses weight while it cooks and while it waits.` and `your main cooked-ahead meat`; or show this section only when the menu has a cooked-ahead meat | A3 |
| 82-office-money.js:374 | `Pay an order from Orders on the line screen` | `Pay an order from Orders on the kitchen board` (the glossary word) | A3 |
| 83-office-safety.js:102 | `... sanitize rounds and discards fill this page ...` | `... sanitize rounds and thrown-out batches fill this page ...` (mine from round 2; it slipped through, A3 now owns the file) | A3 |
| 84-office-data.js:1191 | `Food-safety limits are still stored in Fahrenheit, so the limits on the Food safety page are entered in F.` | `The limits on the Food safety page are always entered in °F.` ("stored" is a computer word) | A3 |
| 85-office-stock.js:449 | `Practice only: Smokebox pretends to tell each ordering channel when an item is sold out and times how long that would take.` | Remove the section (decision 14). If it stays: `Practice only: this shows how a sold-out dish would reach other ordering systems. Nothing is sent.` ("pretends" is the fifth word for fake data.) | A3 |
| 86-office-glance.js:52 | `Nothing cooked yet, so nothing is 86` | `Nothing cooked yet, so nothing is sold out` | A3 |
| 87-office-closeday.js:188 | `Cash in the drawer should be $X, plus the cash you started the day with.` | Good as it stands. When the starting-cash setting exists (decision 19), show the sum. | A3 |
| 72-floor-sheets.js:1253 | `... is locked for safety. Reheat or discard the batch in the hold cabinet.` | `... is held back. Reheat or throw out the batch in the Hold cabinet. It comes back when a batch that is in range is in.` ("locked for safety" claims more than the app knows; "discard" is the old word.) | A1 |
| 72-floor-sheets.js:1909 | `Smokebox is a kitchen display for a BBQ line: ...` | `Smokebox is a kitchen display for restaurants that cook food ahead: tickets, a hold cabinet and a sold-out list.` (Freddy's call, decision 8) | A1 |
| 72-floor-sheets.js:1694 | `... you tap START and DONE ...` | `... you tap Start and Done ...` (button names as they appear) | A1 |
| 72-floor-sheets.js:1706 | `This erases YOUR dishes, prices and orders ...` | `This erases your dishes, prices and orders ...` (capitals shout; the button already warns) | A1 |
| 72-floor-sheets.js:1017 | `Add the food you cook ahead, like brisket, and then log a batch of it here.` | `Add the food you cook ahead, like pulled pork or chili, and then log a batch of it here.` | A1 |
| 72-floor-sheets.js:473 | `Practice batch` | `Demo batch` (once decision 6 is made; today it mixes practice and demo) | A1 |
| 70-floor-board.js:1816 | `Try the busy-night demo (practice)` | `Try the demo` (A2 is building this entry; keep the same word on both) | A1 / A2 |
| 76-floor-discards.js:102 | `Add initials on each row.` | Keep, but check the column: initials typed at Discard did not appear in the log's Initials column in my test (see bugs below). | A1 |
| 20-engine.js:117 | `Cook-ahead tracking ... is switched off. Turn it on in Menu and settings first.` | `... is switched off. Turn it on under Dishes and prices: Yes, I cook ahead.` | A5 |
| 20-engine.js:120 | `This dish already lists ingredients, so it cannot also count portions. Remove its ingredients first, or keep tracking it by ingredients.` | `This dish already uses ingredients, so it cannot also be counted by portions. Remove its ingredients first, or keep it as it is.` (matches the words in 77) | A5 |
| 20-engine.js:119 | `The ingredient list is full (N ingredients). Archive one you no longer use ...` | Fine; add `Archive` to the glossary as "Remove" if the owner screen says Remove. | A5 |
| 40-metrics.js:1461 | `First to last dish`, `Finished food waiting` | Good (plain). Keep and make 81-office-pace.js use the same two labels everywhere. | A5 / A3 |

## Checks that came back clean

- **Safety and compliance claims.** No new string says food or a kitchen "is safe", "compliant" or certified. The Food Code lines in 84 all say the local code applies. "Locked for safety" (72:1253) is the one near-miss.
- **US spelling.** One new non-US word: "Tick" (77:482). No "colour", "centre" or "maths" found in the new text.
- **Weights.** Food weights are kg, g and pieces; the new units setting adds lb and oz as a choice, which is fine. Sample dish names with "lb" are unchanged.
- **Tone.** No new shouting or apology beyond the capitals in 72:1694 and 72:1706. The chef voice call-outs are unchanged.

## Bugs found while reading (not wording)

1. **Counted dishes do not redraw.** (A2 reports this was fixed in its round 4 and the list now redraws; I saw it on 2b126bc, so recheck after merge.) In Dishes and prices, after typing a number and tapping Start counting, the stock is saved (20 portions on hand) but the sheet still shows the Start counting box. "20 left", +10, Add and Stop counting appear only after the sheet is closed and reopened. Owner: A2. (`tools/guide-walk.mjs` checks for this by reopening the sheet.)
2. **Initials column.** After throwing a batch out with initials JM, the Thrown-out log showed an empty Initials cell on this build. A1 reports it is already fixed on night/a1-r4 and r5 (with a test), so recheck after merge.
3. **Hold cabinet "?" help link sits next to the heading text on some widths** and was not tested on a phone. Owner: A1.

## Counts

30 rows in the table (A2 9, A3 9, A1 8, A5 4; two are "good as it stands" notes), 3 bugs, 5 good examples. Terms to apply once decided: Demo vs Practice (decision 6), station names (8), the cold-dish default (9).
