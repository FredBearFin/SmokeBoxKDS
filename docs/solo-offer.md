# Smokebox Solo: the first sellable offer (draft for Freddy to approve)

Scope is **Solo only**. Anything not listed under "What you get" is not part of the offer.

## What you get
- One device running Smokebox from one HTML file (`smokebox.html`), no internet needed after install.
- Kitchen board with batch warnings (strip, tones, spoken calls), hold cabinet, 86 board, order entry, payment **recording**, and the back office pages.
- Far display mode (Settings, Far display) for a TV or a tablet read from across the kitchen.
- A first run that starts **empty**: no batches, no tickets, no sample history. Nothing pretend is mixed in with the kitchen's real data.
- A **demo** for showing the app to staff: Try the demo (on the empty board or in Settings) opens a separate demo kitchen with sample dishes, tickets and history, labeled Demo. Back to my kitchen returns to the real one, untouched.
- Setup tools: Add your first dish, an optional menu import (a spreadsheet, or Square, Toast, Clover or Lightspeed item exports), Start over with an empty menu (it saves a backup first), counter service and order buttons (Settings, How you serve), a currency symbol, and a PIN that shows a recovery code once.
- A backup and restore of your data, a discard log, and a pilot report.

## What it is not (say this in every sales conversation)
- **No POS integration, no card processing, no multi-device sync.** Payments are recorded (cash, card, other) and never charged. Card readers stay separate. Connected mode and Square import are not built and are not promised.
- **Not a food-safety system.** It is a helper. The local health code and your own procedures govern. Hold limits and temperature-check intervals are settings you confirm against local rules.
- **Warnings only work while the app is in front and the screen is awake.** A locked or sleeping screen runs nothing. Sound needs a tablet whose volume is up and a speaker you have tested from the pit.

## Supported devices (to be confirmed by the pilot; nothing here is verified on real hardware yet)
| Item | Status |
|---|---|
| Chrome on Android tablet, 1280x800 or larger | Target. Tested only in headless Chromium. |
| Chrome or Edge on a Windows or Mac computer, or a TV with a computer | Target. Same limit. |
| Safari on iPad | Unverified (Web Locks, wake lock, audio unlock all untested). Do not sell until tested. |
| Phones | Not a kitchen display. Only a manager glance is intended, not built. |
| 1024 px wide tablets | Header fits in simulation; check on a real one. |

The pilot fills in the real column: device model, OS and browser version, speaker, result of the tests in `docs/pilot-readiness.md`.

## Setup (about 30 minutes on site)
1. Copy `smokebox.html` to the device and open it; install it as an app (Share, Add to Home Screen, or Install app).
2. Settings, **Set up this tablet** (seven steps: sound, screen on, protected data, installed, placement, dishes, hold limits).
3. Enter real products, costs and hold limits. The cabinet is empty until the cook logs a real batch, so dishes that use a cooked-ahead item show as 86 until then. Confirm each quality limit and throw-out time with the owner.
4. Set service hours. The app starts empty, so there is nothing to clear; if you showed the demo, tap Back to my kitchen. To clear a kitchen you tried out, use **Erase tickets and records** (settings are kept) or Start over with an empty menu. The report warns if demo orders or the demo clock were left on.
5. Take a first backup.

## Where the data lives
Everything stays in the browser storage of that one device. Nothing is sent anywhere by the app. Clearing site data, uninstalling the browser, or replacing the device **deletes it** unless you have a backup. Back up (Data page) at least at close each day during the pilot, and keep copies off the device (email to the owner or a USB drive).

## Recovery
- **App or browser reset, data gone:** restore the latest backup file from the Data page.
- **Device replaced or broken:** install the same `smokebox.html` on the new device, run setup, restore the latest backup. Sound and loudness settings are per device and are redone.
- **Wrong numbers after a bad day:** the Data page has **Erase tickets and records**; settings are kept.
- **Two tabs open:** only one makes sound; close the extra tab.

## Updates and replacement
Decision needed (see `docs/commercial-decisions.md`): proposed default is that Freddy sends a new `smokebox.html` by email or download link; the owner replaces the file, takes a backup first, and restores if anything looks wrong. No automatic updates, so nothing changes in the middle of service. A replaced device is covered by the same steps at no charge during the pilot.

## Support boundaries (proposal)
- Pilot: Freddy on call during the observed service, then email or text with a next-business-day reply.
- Covered: installing, restoring a backup, explaining a setting or a warning.
- Not covered: the tablet, speaker, Wi-Fi, power, the owner's food-safety procedures, POS or payment hardware, any integration.
