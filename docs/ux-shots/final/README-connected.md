# Connected states: final screenshots

Taken by `ux-scripts/connected-shots.mjs` (run `SHOT_DIR=docs/ux-shots/final node ux-scripts/connected-shots.mjs`) against a real hub process, in headless Chromium only. Nothing here was seen on a real tablet, a real TV or in a real kitchen. Each picture was opened and read by the agent who took it.

| File | What it shows |
| --- | --- |
| `10-follower-tv-1920.png` | A show-only follower on a 1920 TV: big Connected chip with the update time, the line "This screen only shows the kitchen.", six tickets, the all-day strip. The next step on each dish (START) is a quiet word, not a button. |
| `11-follower-390.png` | The same follower on a 390 phone. |
| `12-hub-chip-connected-390.png`, `12-hub-chip-connected-night-390.png` | A writing tablet on the hub, Day and Night: the small "Connected" chip under the header. |
| `13-hub-chip-offline-waiting-390.png`, `13-hub-chip-offline-night-390.png` | The hub stopped: "Offline: your taps are saved and will be sent", with "2 taps waiting" (Day) and none waiting (Night page). |
| `14-hub-chip-back-and-sent-390.png` | The hub back: the chip is Connected again and the waiting taps were sent. |
| `15-offline-card-390.png`, `15-offline-card-1024.png` | The "Opens without the internet" card of the Tablet checks sheet, served from the hub ("Ready", stored copy read back whole). |

Not here: the owner Screens panel. This track has the store calls for it (`hubScreens`, `hubNewPairingCode`, `hubRemoveScreen`) but no page that draws it yet, so there is nothing to photograph. The pairing box and the "Use one kitchen on several tablets" sheet are covered by `test/connected-hostile.e2e.mjs` and `test/hub-join-ui.e2e.mjs`.
