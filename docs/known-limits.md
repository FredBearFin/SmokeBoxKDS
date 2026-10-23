# Known limits: what Smokebox does and does not do today

Technical and plain. Written from the current build. Where it says "tested", that means a desktop test browser only.

## What it is

A single HTML file (`dist/smokebox.html`) that runs in a browser. It is a kitchen board with simple order entry, a hold cabinet for food cooked ahead, a thrown-out log, a Guide, and back office pages. It starts as an empty kitchen. It works without internet once opened.

## What it is not

- **Not a POS or register.** It does not run a till, file taxes, run payroll or do bookkeeping. Sales tax is one flat percentage.
- **No payment processing.** It records whether an order was paid by cash, card or other. It never charges a card and never talks to a card reader.
- **Not a food-safety compliance tool.** It reminds you, flags times and readings outside the limits you set, and keeps a record. It cannot see, taste or measure food. It does not know your local rules. The limits it starts with are starting values, not rules; cold-item limits (days in the fridge, hours out) are typed by the owner and none is pre-filled. A person enters every reading.
- **No integrations.** No POS, online ordering, delivery-app or accounting link. The simulated channel feeds and the channel sync strip were removed. Menu import reads files only (a spreadsheet, or Square, Toast, Clover and Lightspeed item exports).

## Devices and data

- **One device.** Each device has its own menu, tickets and settings. There is no sync between tablets. Two tabs of the same browser on the same device stay in step.
- **Data lives in the browser on that device.** Clearing site data, using another browser or a private window, or replacing the device shows an empty Smokebox. A backup file (Data page) is the only copy that can be moved. A PIN recovery code is shown once when a PIN is set; with no code and no backup, getting past a forgotten PIN means clearing the site data, which erases everything on the device.
- **Sound, loudness, theme and text size are per device** and are not in a backup.
- **A prototype server exists** (`server/`, with `go.sh` and `tunnel.sh`) for a possible connected mode. The app does not use it. It is not part of the single-file app and has not been run on a live machine.

## Records

- The safety record (thrown-out batches, readings, entries) keeps entries for about 400 days. That is the app's own setting, not a legal rule. Ask your health department how long you must keep records.
- Restoring a backup keeps what it replaced for 7 days inside the app, and the Data page shows **Undo this restore** for that time (the PIN is asked if one is set).
- Close the month moves finished days older than 35 days out of this tablet. You save five files first (a backup of the whole kitchen, three spreadsheets and a list of what is in them), tick that you can find them, and type CLOSE. The last 35 days, today, open orders and tickets, and all food-safety records stay; safety records are never pruned by it. After it, the files are the only copy of the removed history, apart from the 7 days the app keeps your kitchen as it was (**Undo** on the last screen). It is refused on a tablet that works through the main computer, in the demo, and when the files are out of date. In this build the Close the month screen has no button on the Data page yet (it opens by its sheet name only), so the Guide page describes the screen and not where to tap to reach it.

## Warnings

Warnings sound only while the screen is on and Smokebox is open on the board, with the volume up and within your opening hours. A sleeping tablet, a closed page or a muted device means silence. A page that was hidden catches up once when it comes back.

## What is tested, and how

- Everything has been tested in a desktop browser (headless Chromium and similar). **Nothing has been tried on a real tablet or phone, on a real speaker, or in a working kitchen.**
- iPad Safari (sound unlock, keep-awake, Web Locks) is unverified.
- Phone screens are not a kitchen display.

## Behavior worth knowing

- Every order makes a ticket. With Counter service on (Settings, How you serve), a paid order's ticket finishes and clears itself, and the board has no station tabs.
- "Do you cook food ahead?" is a Yes, No or Not sure question. Not sure counts as No. The Cabinet, batch timers and their warnings exist only when it is Yes.
- Smokebox allows one reheat per batch. That is its own rule, not a health code rule.
- Start over with an empty menu asks for the PIN first when one is set. It downloads a backup file before anything is erased, needs you to say you saved it, and erases nothing if the backup cannot be made. There is no undo apart from restoring that file.
- The demo is a separate demo kitchen. A backup made in the demo cannot be loaded into a real kitchen, and the reverse.
- Reports from demo or sample data are labeled and are not your sales.
