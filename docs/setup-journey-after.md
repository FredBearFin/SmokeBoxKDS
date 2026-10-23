# Setup journey after rounds 2 and 3 (measured 2026-10-23; round 3 on branch night/a2-r3)

Same method and same limits as `docs/setup-journey-before.md`: `ux-scripts/setup-journey.mjs` drives the built app in headless Chromium at 1280x800 from empty storage; time is MODELED (1.2 s per tap, 3 s plus 0.25 s per character per typed field, 4 s reading each new screen), not a person with a stopwatch; nothing was tried on a real tablet. One new assumption: the cursor is already in the name box (the sheet and "Save and add another" put it there) and Enter or the tablet keyboard's Next key moves to the price box, so those two fields cost typing but no extra tap. The script checks the cursor really is where it assumes and flags a confusing moment if not (none flagged). Screenshots: `docs/ux-shots/night/a2/` (the round-1 shots were replaced by the new ones; the before numbers are in the before doc and `journey.json` history).

## Numbers against the targets

| Measure | Before (round 1) | After | Target |
|---|---|---|---|
| Fresh install to first PAID ticket, three own dishes: taps | 24 | **13** | about 17 |
| Typed fields | 7 | **6** (53 characters) | 6 |
| List choices (drop-downs) | 4 | **0** | 0 |
| Screens read | 13 | 9 | |
| Modeled time | about 2.0 min | **about 1.4 min** | under 10 min |
| Adding three dishes alone | 11 taps, 6 typed, 3 choices | **6 taps, 6 typed, 0 choices, about 54 s modeled** | under 2 min |
| Dead ends / confusing moments | 0 / 8 (guided), 2 dead ends (naive) | **0 / 0** | 0 |
| Dishes, ingredients, prices the owner did not enter | 21 / 15 / $3.50 to $29 | **0 / 0 / none** | none |
| Red 86 badge on first open | 17 | **0** | none |
| "New tablet?" toast after 8 s | yes | **gone** | gone |
| Tap New ticket with no dishes | an order screen with 17 sold-out tiles | **the Add a dish form opens** | no dead end |
| Taps to change a price later (Menu, Dishes and prices, type) | 3 taps plus scrolling past 21 dishes in the back office | **3 taps, 1 typed field, no back office** | |

The 13 taps: Add your first dish (1); per dish a tap on the station tile when it differs from the last dish and Save (2 each, 6 total; a dish at the same station as the last costs 1); New ticket (1); three dish tiles (3); Cash (1); Send (1). Real first-timers will be slower; this is a best case with no hesitation or typos.

## What changed (screen by screen)

1. First open: empty board, one big "Add your first dish" button, two quiet links (Show me how it works, Try the busy-night demo (pretend)). No welcome card, no 86 badge count, no demo tickets. (`01-A-first-open.png`; blank-start data comes from A5's branch.)
2. "Dishes and prices" sheet: name, price, four big station tiles (Pit, Hot sides, Fry, Cold and drinks, each with a plain hint), Save and add another, Save and finish. The first dish needs a station tile tap; after that the last station stays chosen. Category, prep time and short ticket name are under "More options" and default from the station tile; a prep time the owner did not type is stored as a guess ("starter estimate"), fixing the old "Confirmed by default" oddity. Half-typed text is kept if the tab closes.
3. Dishes so far appear in the same sheet as editable rows (name, price, Remove). Remove archives the dish. The main Menu sheet now has a clear "Dishes and prices" entry (the header Menu button itself is not renamed). The full back-office editor stays one tap away for ingredients and prep times.
4. "More ways to add dishes" fold: "Start from an example menu" adds 8 dishes with made-up prices, each marked Example, with a one-tap "Remove all example dishes". Import is not built yet.
5. "Tax, hours and PIN" sheet (from the Dishes sheet): tax percent, opening hours as plain times ("10 am", "1 am (next day)"), optional PIN, and one yes/no "Do you cook meat ahead and hold it hot?" that is only remembered for now (it says "Nothing changes yet"). The kg and probe-temperature step is gone from setup.
6. After the first dish a slim card says "Your menu is ready, your menu has N dishes" until the first ticket exists or it is closed. There is no "Finish setup" flag: setup is done when one dish exists, and the board always reflects the saved dishes after a reload.
7. The 8-second "New tablet? 6-step setup" toast is removed. The tablet checklist stays under Menu, "Set up this tablet".

## Tests

`node test/setup-wizard.e2e.mjs` rewritten for the new flow (19 checks, about 20 s, all pass): first-run button, no welcome card or tickets, New ticket with no dishes opens the form, missing station message, saved dish with station and guessed prep time, remembered station, right category and tap style, duplicate name refused, price edit, Remove, example menu marked and removed in one tap, reload keeps dishes and the half-typed name, tax and hours saved, no late toast, Menu has Dishes and prices, no page errors. Unit suite: 517 pass, 0 fail. Comment audit: all files pass. The slow floor and shell suites were not run.

## Not checked

- A real tablet, on-screen keyboard behavior (does Next/Enter move to the price box?), real first-timers. The 2-minute and 10-minute targets are modeled only.
- Cook-ahead meat flow: the yes/no does nothing yet; ingredients, batches and the cabinet for a cooked-meat dish were not touched.
- Station tiles with owner-renamed or extra custom stations (defaults for a custom station are generic; the tiles list `workZones`).
- A removed dish keeps its name, so re-adding the same name is refused with an explanatory message (engine rule, not changed).
- The Demo sheet's "Restart demo" on an own kitchen that already has dishes: A5 says it is refused unless `replaceOwn: true`; its confirm text needs to say it erases the owner's dishes. I did not change that sheet.
- Import, the tour text (still talks about the old setup in places), phone widths, Night theme and Large text on the new sheets.
- The old floor.e2e check of the welcome card (line 709 of test/floor.e2e.mjs) will need updating; I did not run that suite.

## Questions for Freddy

1. Is "Where is it made?" with four station tiles the right wording for a restaurant owner, or would "Who makes it?" or "Kitchen / Bar" read better? The station names (Pit, Hot sides, Fry, Cold and drinks) are still the barbecue config.
2. Should the example menu exist at all? It is hidden and labeled, but it is still made-up barbecue prices.
3. Should the first dish require tapping a station, or should the app pre-pick one (faster, but risks a wrong station on a ticket)?
4. The cook-ahead yes/no sits in "Tax, hours and PIN". Do you want it asked once, right after the first dish, instead?
5. Removed dishes block their name forever. Is that acceptable, or should Remove truly delete a dish with no tickets?

## Round 3 additions (branch night/a2-r3)

New measured variant D: a one-station kitchen (the other three stations hidden before the owner starts). Same script, same model.

| Run | Taps | Typed fields | List choices | Modeled time |
|---|---|---|---|---|
| A: four stations (default) | 13 | 6 | 0 | about 1.4 min |
| D: one station showing, no "Where is it made?" question | **10** | 6 | 0 | about 1.3 min |

What changed in round 3:
1. **Stations.** Inside Dishes and prices, a "Change stations" fold lets the owner rename a station, hide it or add one ("Bar"). Names are written through `SB.config.applyCustom` / `saveCustom` (the same saved names the board, tickets and Data page read; nothing duplicated), checked first so a bad name changes nothing, and shown on the tiles at once; the board and tickets show them after a reload (a Reload button appears). With only one station showing, the question is skipped and every dish goes to it. Hiding only removes the tile from the add form: the board's station tabs still list all stations (the shared config has no "hidden" idea and I may not edit it).
2. **Editing later.** Remove now shows "Removed X. Undo". A fold "Removed dishes" lists removed dishes with "Bring it back". Typing a name that belongs to a removed dish shows "X was removed earlier. Bring it back" and un-archives it at the typed price. **Reorder is not done**: there is no engine action to move a menu item, and I may not edit the engine.
3. **Cook-ahead** is now the real setting (`settings.modules.cookAhead` through updateSettings), asked as "Do you cook food ahead and hold it warm or cold?", Yes/No, with a one-line note on what appears. An old saved kitchen with no value counts as Yes so nothing vanishes from it.
4. **Settings grouped by task** in the back office page: Shop (Menu, Appearance and hours, PIN), Kitchen (Ingredients, Time limits), Safety (Food safety), Devices (Data, About), Advanced (Meal pacing, in a fold that starts closed and opens when linked to). There is no separate Money panel (tax lives in Appearance and service hours, so it sits under Shop), so I did not invent an empty Money group. Panel labels and help text belong to A3 and were not changed.
5. **First-steps card** ("Your menu is ready") is marked done for good the moment any ticket or order exists, so clearing the board later does not bring it back; its buttons are at least 44 px high.

Screenshots looked at: `r3-blank-kitchen`, `r3-dishes-three-stations` (Change stations open), `r3-dishes-one-station`, `r3-dishes-night-large` (Night plus Large text), `r3-dishes-phone-390`, `r3-firstrun-phone-390`, `r3-shop-sheet`, `r3-settings-groups` in `docs/ux-shots/night/a2/`.

Tests: `test/setup-wizard.e2e.mjs` now has 31 checks (all pass), including Undo, Bring it back, station rename/hide/add, one-station skip, the real cook-ahead setting, and the card never returning. Unit suite 526 pass, 0 fail.

Not checked in round 3: the new settings grouping on phone width and in Night; a station renamed then restored on another device (names are per browser, as the config warns; a backup does not carry them); more than 8 added stations (the config's limit); Reload button wording on a real tablet; the board's own station tabs after hiding (they still show every station); what A1 and A3 hide when cook-ahead is No (their gating was not merged when I wired the setting).

Questions for Freddy: (a) Should hiding a station also hide its board tab? That needs a small change in the shared config and board. (b) Is "Change stations" too much for a first run, or fine because it is folded shut? (c) Do you want dish reorder? It needs an engine action first.

## Round 4 additions (branch night/a2-r4)

New measured run E: the cook-ahead path from a blank kitchen. The owner adds one dish (Brisket plate), taps "Yes, I cook ahead", adds Brisket (hot, 4 h default), links the dish, logs a first batch in the cabinet with the pre-filled values, then takes a paid order for it. Same model and limits as above (modeled time, headless Chromium, no real person).

| Run | Taps | Typed fields | List choices | Modeled time | Result |
|---|---|---|---|---|---|
| A: three dishes, four stations | 13 | 6 | 0 | about 1.4 min | paid |
| D: three dishes, one station | 10 | 6 | 0 | about 1.3 min | paid |
| **E: one cooked-ahead dish, Brisket added and linked, first batch logged, order paid** | **14** | **3** (dish name, price, Brisket) | 0 | **about 0.9 min** | 1 batch logged, paid |

The batch is logged with the form's starting values (raw weight, cook endpoint, first reading 150 F). A real cook would check the probe and change them, so real time is longer. Cooked-ahead is optional: runs A and D never touch it.

What changed:
1. **Cooked-ahead food.** After the first dish the Dishes sheet asks "Do you cook any of this ahead and hold it?" with "Yes, I cook ahead" (turns the cook-ahead setting on and opens the sheet) and "No, skip this" (remembered). The "Cooked-ahead food" sheet takes a name, hot or cold, how long it may stay (4 h default, with a note that the local health code decides and to ask the health department), an optional usual batch size in kg, and a tick list of dishes with grams per serving (150 is a starting guess). It calls addIngredient, then updateMenuItem with a bom for each ticked dish; the dish's existing recipe lines are kept. "Log a first batch" opens the cabinet on the new batch form with the product chosen. An empty cabinet Product list now says "No cooked-ahead items yet" with an "Add a cooked-ahead item" button, and hides the weight form and the Put in hold cabinet button until there is a product.
2. **Portions on hand.** A dish row has "I count what I made" (starting number, then Start counting). A counted dish shows "N left" (or "0 left (sold out)"), "+10", a custom Add, and Stop counting. A dish that already lists ingredients gets the plain refusal. The hidden "Portions of X" ingredient is never listed in my sheets.
3. **Stations: Not used.** Hide is now "Not used" / "Use again". A station marked Not used leaves the add-form tiles and its board tab, unless it has open tickets or is the tab being viewed (so no ticket is ever out of sight). Done with a small `F.applyHiddenTabs` in the board plus a CSS hide, no shared-config edit.
4. A list bug found while testing: the dish list did not redraw after a button press inside a row. Fixed (it now waits only while a text box is being typed in).

Tests: `test/setup-wizard.e2e.mjs` has 38 checks, all pass (adds the cooked-ahead question, Brisket added and linked, first batch form, portions 20 left and +10 to 30, the hidden ingredient not shown, a Not used station losing its tab). Unit suite 543 or 544 pass; one run showed 1 failure that did not repeat in two re-runs (0 fail), so a flaky timing test; I did not find which.

Screenshots looked at: `r4-question-blank` (module off, question after the first dish), `r4-portions`, `r4-added-night` (Night), `r4-cooked-phone-390`, `r4-portions-phone-390`, `r4-cabinet-no-product`, and the E run steps.

Not checked: the order screen's wording when a counted dish runs out (A1's sentence; I only saw the row text); real cooking yields (a new item has no yield or cook model, so a batch counts cooked weight 1 to 1 with raw until the owner enters real numbers); cold items and a batch size above 1000 kg; undo of Add item (the engine supports it, my sheet does not expose it); Stock and 86 office lists still need A3 to filter the hidden "Portions of" ingredients.

Questions for Freddy: (a) Is 4 hours the right careful default, and should the sheet name a typical value for cold food? (b) Is 150 grams per serving a sensible starting guess, or should the owner be asked? (c) Should "Yes, I cook ahead" turn the whole cook-ahead part on right there, or ask once more?
