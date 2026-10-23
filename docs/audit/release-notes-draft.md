# Smokebox release notes (draft)

Draft written on `night/a5-r9`. Everything below was tested in a simulated browser and in automated tests. Nothing has been tried on a real tablet or in a real kitchen, and none of this is a health-code or legal check: Smokebox repeats "your local health-code rules override this" and the owner must follow their own.

## What a kitchen gets

- **A new kitchen starts empty.** No dishes, no prices, no ingredients, no sample orders. You add your own dishes (name and price are enough), or paste or load a list. Tax starts at 0 and meal pacing is off until you turn it on.
- **Dishes with no ingredients work.** You can take orders, cook, bump and take payment for any dish. A dish only goes "sold out" by itself if you ask it to count portions ("I made 20"), or give it ingredients with amounts.
- **Counting portions.** Turn on portion counting for a dish, say how many you made, and it goes sold out at zero. Adding more puts it back. Undoing a finished item gives the portion back.
- **Your own ingredients.** Add ingredients with a cost per kilogram (or each), set what a dish uses, and stock and sold-out follow.
- **Cook-ahead is optional.** The hold cabinet, temperature checks, hold timers, warnings and the sanitize timer are one switch ("Yes, I cook ahead"). New kitchens start with it off. Kitchens that already used the cabinet keep it on. Turning it off never hides food that is still in the cabinet.
- **Menu import (optional).** Paste lines such as `Brisket plate, 14.00` or load a spreadsheet file. Square, Toast and Clover style item lists are recognised by their headings. Every problem is explained in plain words and nothing is added until you confirm. A price is never guessed: a missing price, a range, or "market price" stops that row.
- **Start over with an empty menu.** In the back office you can erase the dishes, ingredients, orders and history and begin again. You must type a confirmation word, a full backup file is made and handed to you first, and you choose whether to keep your tax, hours, PIN and station names. The demo is never touched.
- **Old demo tickets.** A kitchen that tried the old built-in demo is offered a one-time clean-up of the demo tickets in its real reports. Real orders are never removed.
- **Reorder dishes.** Move a dish up or down the menu; undo works for a few seconds.
- **Money is exact to the cent.** Tax is worked in whole cents and a half cent rounds up (for example 7.25 percent on $2.00 is 15 cents). Prices and tips are kept to the cent. Orders paid before this version keep the totals they were paid with.
- **Neutral names to start.** A new empty kitchen starts with stations called Kitchen, Prep, Fryer, Cold and drinks, and menu sections Mains, Sides, Snacks, Desserts, Drinks. Rename or add your own. Older kitchens keep the names they have.
- **Costs are honest.** A dish with no ingredients, or an ingredient without a cost, shows cost as "not recorded", never $0.00 and never a 100 percent margin.
- **A separate demo.** "Try the demo" opens a pretend barbecue kitchen with its own saved data. It cannot touch your real kitchen, and "Back to my kitchen" throws the demo away. A demo tab and a real tab can be open at once without mixing.
- **Backups know which kitchen they belong to.** A demo backup will not load into your kitchen, and the reverse. Backups from earlier versions load as your real kitchen. A backup also carries your station and category names and your setup choices.

## Data safety

- **Your data stays on this device.** There is no server and no online account.
- **A last good copy.** On the first save, after every end-of-day close, and every 6 hours, Smokebox keeps one small copy of the important parts of your kitchen (dishes, ingredients, settings, PIN, safety records, today's orders). If the main save is found damaged when the page opens, that copy is loaded and you are told the time of the copy and that later orders are missing. The damaged text is kept aside for 30 days.
- **When the browser is full.** Smokebox drops the last good copy first, then the oldest finished orders and history. It never drops your dishes, ingredients, settings, PIN, open orders, food in the cabinet, or the safety log (kept 190 days). If nothing fits, the app keeps running and shows a red strip saying the last save failed. The strip shows within a second or two.
- **Back up anyway.** The copy lives in the same browser as the main save, so it does not help if the browser's data is cleared or the device is lost. Use Back up (in the Data page) and keep a copy off the device.

## Known limits

- **One device.** Two devices (front counter and kitchen) cannot share a kitchen yet. Tabs of the same browser on the same device do stay in step.
- **No link to a server, card reader, POS or delivery app.** Payments are only recorded. The "channel sync" screens are simulated.
- **Not tested on real hardware or in a real service.** Tested in a headless browser and by simulation. Real tablets, Safari on iPad, the home-screen app, sound and wake-lock behaviour are unchecked, and so is how long a browser keeps the data.
- **Browser storage is small** (often about 5 million characters). A very busy kitchen's full history is larger, so after some weeks the oldest finished orders are dropped from the live save. Take a backup before that matters; a "close the month" export is planned.
- **Descriptions from an imported file are not kept.** The app has nowhere to store them yet.
- **The sample menu's cold salads and pudding use a quality hold limit.** Check this against your local code (see `safety-defaults.md`).

## Upgrading

1. **Before you upgrade, back up.** Open the back office, go to the Data page, choose Back up now, and save the file somewhere that is not this device (email it to yourself or use a USB drive). It is a plain text file.
2. Open the new file (or page) on the same device and browser. Your saved kitchen loads as it was: dishes, prices, ingredients, settings, PIN, open orders and history. Older kitchens keep the barbecue sample dishes they already had and keep the cook-ahead switch on. Three safety settings from very early builds (check interval, longest hold) are moved to the current defaults once, and a notice says "Smokebox updated a few saved settings while opening. Nothing else changed."
3. Tested with saves written by five earlier builds of this app, including their backup files; all loaded with nothing lost.
4. An older kitchen keeps its sample dishes. Remove the ones you do not sell (they are archived, not erased, and can be brought back from the removed-dishes list).

## Downgrading (going back to an older build)

- A kitchen that was **started empty** in this build will get the 21 barbecue sample dishes and 15 sample ingredients added back by an older build, and portion counts and the cook-ahead switch are ignored there. Nothing you added is deleted, but the menu is cluttered. **Take a backup before going back.**
- A kitchen that existed before this build can go back and forth.
- The demo's data (`smokebox.demo.*`) is separate and is ignored by older builds.

## For the person installing

- Nothing to install: it is one HTML file. The first page load on a new device starts an empty kitchen.
- If the app says "Your saved board could not be read", follow the notice. If it says it restored the last good copy, check the orders since the time shown.
