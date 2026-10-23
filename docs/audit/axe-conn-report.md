# Accessibility audit with axe-core: connected-kitchen screens

Generated data by `node tools/a11y-axe-conn.mjs` (axe-core, tags wcag2a, wcag2aa, wcag21aa, wcag22aa; no rule turned off). Branch `night/a2-a11y-conn` = `kds/connected` + the A2 axe tool and fixes + `kds/night/a5-fix1-conn` (for the clock question and the held-data card, which are not on `kds/connected` itself). Headless Chromium only: not a screen reader, not a real tablet.

27 screens x 6 looks (390 and 1280 wide; Day, Night, Large text) = 192 screen runs, 0 errors.

| Impact | Failing elements before | after |
|---|---|---|
| critical | 0 | 0 |
| serious | 0 | 0 |
| moderate | 0 | 0 |
| minor | 0 | 0 |

No change to the app was needed, so before and after are the same run (`axe-conn-before.json`, `axe-conn-after.json`).

## What was opened
- Real hub processes (test/_connected.mjs `startHub`): follower board connected; follower board reconnecting (connection cut); hub-mode board with chip connected, offline with a tap waiting, and removed from the kitchen (paired, then removed at the hub); boot cards for a tablet not paired, a wrong access code and an address that is not a Smokebox kitchen.
- Stand-ins for the page's store calls (the same kind `test/hub-join-ui.e2e.mjs` uses), so these check the screen, not a real hub: hub-mode chip "last known copy"; "Use one kitchen on several tablets" in 12 states (show-only form, with an error, main-computer form, name missing, pairing box, choice, choice with the stop, joined, joined with taps waiting and the leave warning, removed, following with a wrong code, following and out of date); the clock notice; the update-ready line, Settings button and its question; Help About "Opens without the internet" (stored and not yet) and the Reset the offline copy question; the Tablet checks card.
- A real unreadable save with the copy-aside write blocked: the held-data card. A device clock moved 5 days ahead: the clock question.
- The generic "Smokebox could not start" card, shown on purpose.

## Not checked
- The owner Screens panel: this tree has the store calls (`hubScreens`, `hubNewPairingCode`) but no screen that uses them, so there was nothing to open.
- The clock notice toast uses a stubbed status (the real path needs a device clock that is wrong at start).
- Everything the first report lists under "Not checked" (screen readers, real devices, reading order, wording).

## For others
Nothing failed, so there are no selectors to hand over.
