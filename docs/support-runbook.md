# Support runbook (Smokebox Solo)

For whoever answers the phone or the email. It covers only what the Solo offer promises (`docs/solo-offer.md`). Nothing here has been tried on a real customer's device yet; the pilot (`docs/pilot-protocol.md`) is where these steps get proven or fixed. Mark every step that did not work as written.

## 1. What is and is not supported

| Supported (we help) | Not supported (say so plainly) |
|---|---|
| Installing `smokebox.html` on one tablet or computer | Phones as a kitchen display |
| Running "Set up this tablet" (seven steps) | Safari on iPad until it has been tested on a real iPad |
| Taking and restoring a backup file | The tablet, speaker, Wi-Fi, power, browser updates |
| Explaining a setting, a warning or a report | The owner's food-safety procedures and health-code limits |
| Replacing a lost or broken device (same steps as install, then restore) | POS, card readers, payment hardware, any integration |
| Sending a new `smokebox.html` | More than one device sharing live data (no sync in Solo) |

Say in every call: Smokebox is a helper, not a food-safety system. If the app and the cook disagree, the cook follows their own rules. Payments are only recorded, never charged.

## 2. Install (about 30 minutes)

1. Copy `smokebox.html` to the device (download link, email attachment or USB drive). Open it in Chrome or Edge.
2. Install it as an app (browser menu, Install app or Add to Home Screen).
3. First run is an empty kitchen: no batches, no tickets, no sample history. That is correct. The board shows New ticket, a walkthrough and a demo button.
4. Settings, **Set up this tablet**: sound, screen on, protected data, installed, placement, dishes, hold limits.
5. Enter real products, costs and hold limits. Confirm each hold limit as a quality limit or a throw-out time with the owner.
6. Set service hours. Do not leave the demo running: the demo adds pretend tickets and a stocked pit; use Demo and clock, then **Erase tickets and records** to clear it.
7. Back office, Data: **Download backup (JSON)** once, and save it somewhere that is not this device.

Check before leaving: tap New ticket, send one, bump it. Hear a test warning from where the pit cook stands.

## 3. Backup and restore

Where the data lives: the browser storage of that one device. Clearing site data, uninstalling the browser, a factory reset or a replaced device deletes it.

- **Back up:** Back office, Data, **Download backup (JSON)**. Or **Copy backup** and paste into an email. Ask the owner to do it at close each day during the pilot and keep copies off the device (email to themselves, USB drive).
- **Restore:** Back office, Data, **Choose a backup file** (or paste the text and **Check pasted backup**). The app checks the file and says what it will do. Then **Replace everything with this backup**. Use **Back up what is here first** if the device holds anything you might want.
- A backup also contains the back office PIN, so a restore brings the PIN back.
- If the app says the file is not a Smokebox backup, it is usually cut off (email clients) or the wrong file. Ask for the original attachment.
- If the app says the saved copy on the device was damaged, it parks the old copy instead of deleting it. Do not clear site data; ask the owner to download a backup first, then call us.

## 4. Device replacement

1. On the new device, install the same `smokebox.html` and run **Set up this tablet**. Sound and loudness settings are per device and are redone.
2. Restore the latest backup (section 3).
3. If the old device still works, take a fresh backup from it first. Do not run both at once: Solo has no sync, so two devices make two separate histories.
4. Run the warning tests in `docs/pilot-readiness.md` section A that apply (speaker, screen on).

## 5. Updating

Proposal (not decided, see `docs/commercial-decisions.md` row 6): send a new `smokebox.html`; the owner takes a backup first, replaces the file, opens it and checks the data is there. Never update during service. If anything looks wrong, put the old file back and restore the backup.

## 6. Common failures

| What the owner says | Likely cause | What to do |
|---|---|---|
| No sound, no spoken calls | Tablet muted, volume low, browser has not had a first tap, sound off in Set up | Tap the "Tap here to turn on warning sound" bar; raise volume; run the sound test in Set up |
| A warning came late or not at all | Screen slept or locked, app was hidden, browser paused it | Keep the device on power with screen-on set; keep the app in front. This is a known limit: a sleeping screen runs nothing |
| All my data is gone | Site data cleared, different browser or profile, new device | Look for the app in the other browser or profile first; otherwise restore the latest backup |
| Numbers look wrong after a bad day | Orders entered twice, clock demo left on, tickets never bumped | Check Demo and clock is off; Data, **Erase tickets and records** keeps settings |
| Two screens show different things | Solo has no sync | Explain: one device is the kitchen board; the other is a separate copy |
| Sound from two tabs | Two tabs of the app open | Close the extra tab; only one makes sound |
| Everything is 86 or meat is "expired" | Batches never logged, or a demo batch was left in the pit | Check the Hold cabinet; discard demo batches; log real batches |
| Text is too small to read | Screen size or distance | Settings, Far display (big type, quiet board); the size options in Settings |
| "Storage is full" message | Browser quota | Download a backup, then Erase tickets and records; the app trims the oldest history itself |
| Back office asks for a PIN nobody remembers | PIN set earlier | No PIN recovery path has been verified. Ask the owner to look for a backup made before the PIN was set; a restore replaces everything including the PIN, so confirm first. Write down what you tried (this is a gap to fix) |

## 7. What to write down on every call

Date, device model, operating system and browser version, what the owner did, what the screen said (a photo helps), whether a backup existed, and the fix. These notes are the real support-boundary evidence for the pilot report. Do not ask the owner for card or customer data; if a backup file is sent for support, delete it when the case is closed (see `docs/privacy-and-retention.md`).
