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

- **One device.** Each device has its own menu, tickets and settings. There is no sync between tablets (a read-only second screen is a test feature, below). Two tabs of the same browser on the same device stay in step.
- **Data lives in the browser on that device.** Clearing site data, using another browser or a private window, or replacing the device shows an empty Smokebox. A backup file (Data page) is the only copy that can be moved. A PIN recovery code is shown once when a PIN is set; with no code and no backup, getting past a forgotten PIN means clearing the site data, which erases everything on the device.
- **Sound, loudness, theme and text size are per device** and are not in a backup.
- **A second screen exists as a test feature.** A page opened to follow a hub shows that hub's kitchen read-only, with an "Out of date" banner when the hub is unreachable. It is not part of the normal install: someone must run the hub (`server/server.mjs`) by hand, and Smokebox never starts one. Tablets cannot write through the hub yet, so two tablets still do not share a board. Nothing about it has been tried on real devices. How to try it: `docs/connected-howto.md`.

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
- Start over with an empty menu saves a backup at the moment of erasing and erases nothing if the backup fails. There is no undo apart from restoring that file.
- The demo is a separate demo kitchen. A backup made in the demo cannot be loaded into a real kitchen, and the reverse.
- Reports from demo or sample data are labeled and are not your sales.
