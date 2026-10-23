# Morning notes for Freddy: the Guide and help material

Written by A4 at the end of the night. Plain words. Nothing here has been tried by a real restaurant owner or on a real tablet.

## What the Guide covers

The Guide is inside the app: **Menu, then Guide** (or the address `#/guide`). Left list, one page at a time, a search box, a Print button on every page. On a phone the list folds away.

| Page | What it explains |
|---|---|
| Getting started | Add a dish, set tax and hours, send a test order, take payment, save a backup |
| Taking an order | New ticket, allergies, rush, add to an open order, fixing a mistake |
| Running the line | How to read a ticket (picture), Start, Done, Bump, 86 board |
| Cooked-ahead food and portions | Count portions, add cooked-ahead food |
| Hold cabinet and warnings | The cabinet card, the four warning steps (picture), when warnings do not sound |
| Closing the day | Close the day, the sales file for your accountant |
| Who made this entry | Initials, Switch person, Fix this entry |
| Backup and restore | The three Data cards, the Erase buttons |
| Replacing a device | Moving to a new tablet |
| Troubleshooting | No sound, screen asleep, missing dish, numbers that look wrong |
| Empty, lost or locked | Closed tab, cleared tablet, forgot PIN, empty start, what is saved where |
| Trying the demo | Try the demo, the demo bar, Back to my kitchen |
| Questions and answers | Short answers (also copied to `docs/faq.md`) |
| What this app does not replace | Food-safety procedures, health code, cards, register, allergy care |

Also: `docs/README-for-owners.md` (one page to hand an owner) and `tools/guide-walk.mjs` and `tools/guide-a11y.mjs`, which click through the Guide's steps on the built app and check keyboard and screen-reader basics.

## The print cards

All five are pages in the Guide, at the bottom of the list under "Quick cards to print". Each has a Print this card button and prints as one page in black and white. Source text is in `docs/sop/`.

1. **Opening checklist** (tablet, sound, 86 board, counted dishes, first temperatures, backup).
2. **Closing checklist** (orders, cabinet, sanitize, sales, thrown-out log, backup, charger).
3. **When something goes wrong** (no sound, asleep, wrong tap, bumped by mistake, wrong ticket, missing dish, opened empty, forgot PIN).
4. **First day checklist** (before opening, during service, closing, if something goes wrong).
5. **Tablet setup** (home screen, keep awake, volume, no wifi needed, where backups go, replacing the tablet).

## Guide claims that depend on decisions you have not made

These are written for the app as it is today. If you decide differently, the Guide text changes (edit `docs/sop/`, run `node tools/build-guide.mjs`). A test fails if a button name the Guide quotes disappears from the app.

- **Kept: New ticket**, because that is what kitchens call them. The Guide says "New ticket" everywhere (no longer depends on a decision).
- **Menu vs Settings** (6). The Guide says "Menu, then ...".
- **Bump vs Send out** (7). The Guide says "Bump".
- **Quality limit vs Best-by** (8). The cabinet page says "Taste it, keep serving" and does not name the limit kinds.
- **Demo vs Practice** (4). The Guide says "demo".
- **Pacing / Pace** (10). The Guide says "Gray dishes are waiting on purpose" and does not name the setting.
- **Cooking ahead on by default** (2). The Guide says it starts off, with a Yes button in Dishes and prices.
- **Forgot the PIN** (3). The Guide says there is no reset and describes the clear-data route. If you build a recovery code, rewrite that section.
- **Station names** (9). The Guide lists Pit, Hot sides, Fry, Cold and drinks.
- **The fake channel sync strip** (11). The Guide does not mention it.

## Claims the Guide makes that you should be comfortable with

- "Smokebox works without internet." and "Your data stays on this device unless you save or send a backup." (from the privacy draft; a lawyer has not reviewed it).
- "It has been tested in a browser on a computer, not in a working kitchen." (Questions and answers, and the owner README). Remove or soften this if you do not want to say it.
- The README says a support contact is not settled yet (commercial decisions, item 5).
- The Guide never says food or a kitchen "is safe" or "compliant"; a test fails if it does.

## Not checked

Printing on a real printer; the Guide on a real tablet or phone; reading by an actual owner; a full screen-reader pass beyond my own script; Safari and iPad.
