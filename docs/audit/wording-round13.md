# Wording audit of strings added since round 7 (on deploy c61c02b)

Method: `tools/extract-strings.mjs` on the latest deploy, compared with the round-7 list (0fe447c). 152 new strings outside the Guide. Checked for jargon, barbecue-only examples, inconsistent names, US spelling and safety claims. Line numbers are in the files named on deploy c61c02b.

## For A2 (src/js/77-floor-setup.js)
1. Line 708: "tick the row" is UK use. Say "select the row".
2. "Category" and "Menu section" are both used. The dish form says Menu section (lines 269, 393, 409). Still "category" at: 535 (aria-label "Category of"), 537 ("Moved to" is fine), 708, 739 ("Some of those category names ... add them one by one in the Back office"), 742 (button "Add these categories"), 743 ("categories that are not set up here"), 748, 874 ("station and categories"). Suggest "section" in all of them. The Guide names the button as written in the app, so tell me if 742 changes.
3. Line 877: the button "Next: save a backup" opens a step that only explains the automatic backup. Suggest "Next: about your backup". Line 882 title "2. Your backup" is fine.
4. Line 234: "The demo is a demo kitchen with a sample menu and sample tickets." Suggest "The demo has a sample menu and sample tickets."
5. Line 94: SECTION_WORDS and the hints are fine. Line 828: "item export from Square, Toast or Clover" names real products; keep only if the build really reads those files.

## For A1 (src/js/72-floor-sheets.js, 70, 71)
1. Line 2173: "You will be asked to save a backup first." is no longer true. The backup is made automatically at the moment of erasing. Suggest "A backup is saved for you first."
2. Line 1920: "A pan that dips for a minute at hour three is not treated as if it had been cold for two hours." This reads as a food-safety ruling. Suggest dropping the example or saying "Smokebox counts time below the limit, not time since cooking, and your health department's rules come first."
3. Lines 311-312 (temperature hints) and 657 ("now, or throw it out"): fine, no change.
4. Line 828 of 71-floor-order.js: "No sales tax is added. Set it under Menu, Tax, hours and PIN." Good.

## For A3 (src/js/80 to 89)
1. 81-office-pace.js lines 99, 273, 412: "median", "Slowest 1 in 10" and "work is the time the cook spent" are statistics words. Each is explained, but a first-time owner reads "middle ticket". Suggest dropping "median" and saying "the middle ticket".
2. 82-office-money.js line 328: "Collected is sales plus tax plus tips" is clear. "(4 am to start)" should say what it is: "the day starts at 4 am".
3. 84-office-data.js lines 1680, 1681, 1713, 1720, 1741: "live data" is jargon, and "Erase live data" sits beside "Start over with an empty menu" with a different meaning. Suggest "Erase tickets and records" and keep "Erase everything" as it is.
4. 84-office-data.js lines 393, 522: the field "Category on the order screen" should read "Menu section" to match the dish form.
5. 80-office-core.js line 692: "How is this worked out?" is good.

## For A5 (13-menu-import.js, 20-engine.js, 25-deadlines.js, 99-boot.js)
1. 13-menu-import.js lines 211-212: "the category in the file" is the file's own column, so keep it, but add "menu section" in the same sentence where the app shows it.
2. 20-engine.js line 570 and 25-deadlines.js line 134: "Past its quality limit. Taste it, then keep serving or throw it out." Tells a cook to serve past a limit by tasting. It is a quality limit by design, but suggest "Past its quality limit. Check it, then decide: keep serving or throw it out. Your food-safety plan comes first."
3. 99-boot.js lines 74, 76: fine, plain.

## Checked and clean
No UK spellings other than "tick" above. No barbecue-only examples in the new strings (examples now use Pizzas, Pastries, Tacos, Latte). No "safe", "compliant" or "guarantee" in the new strings.
