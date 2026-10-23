# Setup journey after round 2 (measured 2026-10-23, branch night/a2-r2 on top of night/a5-r2)

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
