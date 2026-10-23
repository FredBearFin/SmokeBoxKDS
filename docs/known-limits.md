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

- **One device.** Each device has its own menu, tickets and settings. There is no sync between tablets (a hub for several tablets is a test feature, below). Two tabs of the same browser on the same device stay in step.
- **Data lives in the browser on that device.** Clearing site data, using another browser or a private window, or replacing the device shows an empty Smokebox. A backup file (Data page) is the only copy that can be moved. A PIN recovery code is shown once when a PIN is set; with no code and no backup, getting past a forgotten PIN means clearing the site data, which erases everything on the device.
- **Sound, loudness, theme and text size are per device** and are not in a backup.
- **Several tablets on one kitchen is a test feature.** Under Settings, "Use one kitchen on several tablets", a screen can either only show a hub's kitchen ("Show only", read-only) or join the hub to take orders ("Use this hub for orders on this tablet"). It is not part of the normal install: someone must run the hub (`server/server.mjs`) by hand, and Smokebox never starts one. Two kitchens are never merged. What it does today, in desktop browsers with a simulated network drop:
  - A refused tap shows "Not done:" and the reason, and is rolled back on that tablet. Taps made offline are applied at once, marked "Not confirmed yet", saved in a queue on the tablet and sent later in order. The hub's order always wins. A chip shows Connected, Sending or Offline.
  - Undo works only on your own last action while nobody else has acted since. Otherwise the tablet says "Someone else changed the kitchen since, so this cannot be undone from here. Fix it by hand."
  - A page reloaded while the hub is down shows the last kitchen it had, marked "Last known, from" a time, and keeps trying. Reloading a tablet puts it back on its own kitchen unless the address still names the hub.
  - The access code travels in a request header, not in the hub address. The page address you open still contains it, so do not share screenshots of the address bar.
  - Not verified: a hub restart that changes the hub's identity, and what happens to waiting taps in every reload case.
- **Opening without the internet is a test feature.** The hub serves a service worker so a tablet can load Smokebox with the network down, after it has been opened once with the hub reachable. It needs a secure (https) address or the hub computer itself (localhost). A plain http address on a local network cannot do it. iPad Safari may clear stored data after about a week unless Smokebox is added to the home screen (reported, not verified on an iPad). The Tablet checks card "Opens without the internet" reads the stored copy back. "A new version is ready" never reloads by itself. "Reset the offline copy" removes the stored copy and does not touch the board. How to try it: `docs/connected-howto.md`.

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
