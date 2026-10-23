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

## Status after the round 5 merge (kds/deploy cf8912b, checked in round 6)

Re-ran `tools/extract-strings.mjs`: 4,564 strings (4,368 before). 223 are new or changed since the round 5 file; I read them all (leaving out my own Guide files). Line numbers in the table above are from the round 5 build; some have moved by a few lines.

**Resolved (checked in the merged strings)**
- A2 (77): "How many?", "Select each dish and enter the grams...", the neutral cooked-ahead examples, "Smoker, grill or oven", "An example menu with sample prices", the Set up this tablet steps 6 and 7 (jargon and the dish names are gone).
- A5 (20): both engine messages (cook-ahead switch path, portions conflict).
- A1: "Try the demo" on the welcome screen; "Demo batch" reported done by A1; the Initials cell fix (A1, with a test).
- Mine: 74-floor-tour.js, 76-floor-discards.js and 83-office-safety.js still match the plain-words rows from rounds 2 and 5. 83:102 ("discards fill this page") is still open (see below).

**Still open (not yet in the merged code)**
| file:line (merged build) | current | proposed | owner |
|---|---|---|---|
| 72-floor-sheets.js:1275 and 1882 | `locked for safety`, `The only batch is locked for safety: too old, too cold or too warm.` | `held back`; `The only batch is held back: too old, too cold or too warm.` | A1 |
| 72-floor-sheets.js:1934 | `kitchen display for a BBQ line` (the Help text was reworded by A1 in round 5 per A1; the About sheet at 1934 still has it) | `for restaurants that cook food ahead` | A1 |
| 72-floor-sheets.js:1731 | `This erases YOUR dishes` | `This erases your dishes` | A1 |
| 72-floor-sheets.js:1039 | `like brisket` | `like pulled pork or chili` | A1 |
| 72-floor-sheets.js:1922 | `That is a deliberate difference from the research report this app started from.` (internal text, back in Help) | delete the sentence | A1 |
| 72-floor-sheets.js:308 to 321 | `reaches stage 1`, `stage 2` | `reaches step 1 of 2`, `step 2 of 2` | A1 |
| 72-floor-sheets.js:659 | `... now, or discard it.` | `... now, or throw it out.` | A1 |
| 77-floor-setup.js:187 | `a practice kitchen with a sample barbecue menu and pretend tickets` and `Your own dishes and orders are kept safe.` | `a demo kitchen with a sample menu and sample tickets` and `Your own dishes and orders are not touched.` | A2 |
| 77-floor-setup.js:657 | `fix or untick any` | `fix or clear any` ("untick" is non-US) | A2 |
| 80-office-core.js:1227 to 1240 | `Turn it on in Settings`, `Open Menu and settings and try there` | `Turn it on under Dishes and prices: Yes, I cook ahead` | A3 |
| 80-office-core.js:81, 88 and 82-office-money.js:374, 442 | `on the line screen` | `on the kitchen board` | A3 |
| 82-office-money.js:635 to 757 | `Smoked meat loses weight in the smoker`, `your main smoked meat` | neutral wording or show only when a cooked-ahead meat exists | A3 |
| 83-office-safety.js:102 and 292 | `discards fill this page`, `on the line screen` | `thrown-out batches fill this page`, `on the kitchen board` (my file; A3 may edit one line there, so I left both to them to avoid a clash) | A3 |
| 84-office-data.js:474 | `done when it is plated, like tea or slaw ... like brisket or fries` | neutral examples | A3 |
| 84-office-data.js:1191 | `stored in Fahrenheit` | `always entered in F` | A3 |
| 84-office-data.js:1692 to 1708 | the Danger zone buttons say Reset live data and Reset everything, but their boxes say Clear live data and Erase everything | one verb for each action (recommend Erase) | A3 |
| 84-office-data.js:1710 | `Ember or Paper` | `Day or Night` (decision 5) | A3 |
| 88-office-backupstatus (88:39 to 50) | `Practice kitchen (the demo)` | `Demo kitchen` (decision 6) | A3 |
| 89-office-inspector (89:18) | `Kept past best-by`, `Best-by note corrected` | the cabinet cards still say quality limit and Taste it, keep serving. Use one pair of words on both (decision 7), until then say `kept serving past its quality limit` | A3 |
| 85-office-stock.js:449 | `Smokebox pretends to tell each ordering channel` | remove (decision 14) | A3 |
| 86-office-glance.js:52 | `nothing is 86` | `nothing is sold out` | A3 |

**New things I checked and found good**
- Menu import (13-menu-import.js, 77:551 to 657): every problem message says what is wrong and what to do ("This row has no price. Enter the price in dollars... A price is never guessed."). Only "untick" is off.
- The food safety record page (89:114, 89:129): "It is not an inspection result. Entries are never edited; if something was wrong, a correction is added under it." This is the right claim level.
- Backup status line (88:20 to 26): plain, no alarm words.
- Demo bar (60:1685): "You are trying the demo. Nothing here is your kitchen."

**Bug carried over:** A3's print rules (`body > *:not(.sb-printroot) { display: none !important; }` in 33-office-closeday.css and 34-office-inspector.css) hide the whole app on every print. The Guide has its own override; A3 was told to scope theirs.

## Status after the round 6 merge (kds/deploy 250813b, checked in round 7)

Re-ran `tools/extract-strings.mjs`: 4,581 strings. Most open rows above now read correctly in the merged strings: "held back" instead of "locked for safety", the About text without "BBQ line", "your dishes", neutral cooked-ahead examples, "kitchen board" in the office pages, the yield section without smoked meat, "thrown-out batches" at 83:102, "sold out" at 86, and no "pretends to tell" or "Practice batch" left.

**Still open, sent to the owners with exact lines (round 7)**
| file:line | current | proposed | owner |
|---|---|---|---|
| 72-floor-sheets.js:1922 | `That is a deliberate difference from the research report this app started from.` | delete the sentence | A1 |
| 72-floor-sheets.js:313, 314 | `reaches stage 1`, `finishes the cooling` | `step 1 of 2`, `step 2 of 2` | A1 |
| 72-floor-sheets.js:659 | `... now, or discard it.` | `... now, or throw it out.` | A1 |
| 77-floor-setup.js:218 | `a practice kitchen with a sample barbecue menu and pretend tickets`, `kept safe` | `a demo kitchen with a sample menu and sample tickets`, `not touched` | A2 |
| 77-floor-setup.js:706 | `untick any` | `clear any` | A2 |
| 84-office-data.js:474 | `like tea or slaw ... like brisket or fries` | neutral examples | A3 |
| 84-office-data.js:1664 vs 1694, 1710 | buttons `Reset live data`, `Reset everything`; boxes `Clear live data`, `Erase everything` | one verb per action (recommend Erase), then update the Guide | A3 |
| 84-office-data.js:1712 | `Ember or Paper` | `Day or Night` (decision 5) | A3 |
| 88-office-backup.js:39 | `Practice kitchen (the demo)` | `Demo kitchen` (decision 4) | A3 |
| 89-office-inspector.js:18 | `Kept past best-by`, `Best-by note corrected` | `Kept serving past its quality limit` until decision 8 | A3 |
| 20-engine.js:567, 25-deadlines.js:134 | `... or discard it.` | `... or throw it out.` (low priority) | A5 |

My own files (74-floor-tour.js, 76-floor-discards.js, 83-office-safety.js, the Guide) have no open rows.

## Final status (kds/deploy e7e9c93, checked in round 8)

Re-ran `tools/extract-strings.mjs`: 4,649 strings. **Every row from rounds 5 to 7 has landed.** Searched the merged strings for each old phrase: "research report", "stage 1", "or discard it", "pretend tickets", "kept safe", "untick", "like tea or slaw", "Clear live data", "Ember or Paper", "Practice kitchen", "line screen" and "Tick " all return nothing. The Data page now uses Erase live data and Erase everything on both the buttons and the boxes.

**Left, waiting for decisions (not errors):**
| where | what | decision |
|---|---|---|
| 84-office-data.js:1750, 40-metrics.js:1690, 85-office-stock.js:451 | the fake channel sync: "Order-channel sync is simulated", "practice only", "simulated sync" | remove the strip (decisions-for-freddy.md, item 11) |
| 72-floor-sheets.js:1686 to 1711 | demo tools still say "Reset live data" and "practice" | demo wording (item 4); the Data page says Erase |
| 84-office-data.js:1594, 1708 | "practice" in the backup and erase sentences | item 4 |
| 77-floor-setup.js:518, 84-office-data.js:616, 45-sim.js:881 | "made-up prices", "made-up starter", "made-up service days" | item 4 (one word for fake data) |
| 84-office-data.js:1248 | "past best-by" in a Settings label | item 8 (best-by or quality limit, one word everywhere) |

No new safety or compliance claims, no non-US spelling and no barbecue-only wording on a neutral screen turned up in the 68 strings added since round 6 (sales CSV, price read-back, "Reads as", "Add these categories", the Tax link in Menu).
