# Pilot readiness checklist (do this before any real food)

Nothing in the automated QA proves real-world safety or that a warning can be heard. This list is the proof, done on the kitchen's own hardware. Record every result; a "no" is a finding, not something to talk around.

Pilot target customer (fill in before choosing a kitchen): ______________ (for example: counter-service BBQ with a pit, one to three cooks, owner on site).
Monthly price quoted: $______ (must match `docs/pilot-protocol.md`).

## A. Device and warning tests (on the actual tablet, speaker, browser and kitchen network)
Device ______ OS/browser version ______ speaker ______ Wi-Fi/none ______

| Test | Pass? | Notes |
|---|---|---|
| Settings, Set up this tablet: all seven steps done | | |
| Test warning heard from the **pit position**, without looking, with the kitchen running (fans, fryer, radio) | | |
| Spoken call is intelligible from the pit | | |
| Loud tone at the last warning is heard and is not mistaken for another device | | |
| Screen kept on: leave the board idle 30 minutes unplugged-from-nothing (on power), screen stays on | | |
| Screen sleeps or locks: what happens (expected: **no warnings**). Write the time the warning should have fired and whether it caught up on wake | | |
| App hidden (another app in front, then back): warnings catch up once, no flood | | |
| Sound off or tablet muted: the "Sound is off on this tablet" bar shows and is noticed | | |
| Bluetooth speaker disconnects mid-service: what the cook hears | | |
| Two tabs open: only one makes sound | | |
| Power cut and reboot: data is still there, board returns | | |
| Backup downloaded and **restored** on a second browser profile | | |
| iPad only: Web Locks, audio unlock after reload, wake lock | | |

If the sleep or hidden tests lose a warning in a way the kitchen cannot live with, the plan must change (always-on tablet with Guided Access or kiosk, or no sale) before the pilot.

## B. Food-safety settings
- Hold limits and temperature-check interval checked against the **local health department** (name and date of the person or document): ______________
- Each product marked **quality limit** or **throw-out time** with the owner. Cold items use days in the fridge and hours out of the fridge that the owner types; the app pre-fills none.
- The owner has read this sentence and agrees: "Smokebox is a helper and does not replace required food-safety procedures, logs or inspections."
- A cook follows their own rules if the app is wrong; the observer says so aloud before service.

## B2. Also test on the tablet (features added since)
- Start from an empty kitchen, add a dish, import a menu file.
- Set a PIN, write down the recovery code, then use Forgot the PIN with it.
- Take a backup and restore it on a second browser profile.
- Make a cold item with limits and a batch, then Take out and Put back.

## C. Go / no-go
Go only if every row in A passes or has a written workaround the owner accepts, and B is complete. Then run `docs/pilot-protocol.md`.
