# Wording rows, round 14 (strings new since round 13)

Re-ran `tools/extract-strings.mjs`; 96 new strings outside the Guide. Mostly clean: Speed, Finish together, Throw-out time, quality limit and Settings are used as decided; no UK spellings, no safe, compliant or guarantee words. Rows to fix:

## A3 (src/js)
1. `84-office-data.js:1005` says 'The model Food Code (4-602.11) says at most 4 hours between wipe-downs.' The research (docs/research/restaurant-ops-checklists.md section 1.3) says the section number was not verified. Drop "(4-602.11)" and say "Our starting value is 4 hours. Set the limit your local health department gives you."
2. `87-office-closeday.js:212` says 'Type the starting cash as dollars, like 150 or 150.00'. With a currency symbol set, say "as an amount".
3. `84-office-data.js:1250` 'Wait before other apps are told an item is past its quality limit' belongs to the channel sync that was removed. If the setting does nothing now, hide it; if it does something, name what.
4. `82-office-money.js:353` still says "Menu and settings". Keep only if that is still the panel's name.

## A5 (src/js)
1. `13-menu-import.js:219` says 'choose "Prices are in cents"', but the button reads "These prices are in cents". Use the button's words.

## Checked and fine
Best day of the week (82-office-money.js:432 to 446), "Cash you started the day with" (87-office-closeday.js:218), the Speed page and its counter-service note (80-office-core.js:1279), the reheat limit text ("Smokebox allows one reheat per batch"), and the model Food Code lines at 84-office-data.js:1002 and 1013, which name it as the model code and tell the owner to use the local rule.
