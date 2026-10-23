# Manager PIN recovery: options for Freddy

Written 2026-10-23 (round 4). Nothing here is built. The code today has no recovery: the PIN is stored on the device as a hash, a keypad locks for 30 seconds after five wrong tries, and the only way back in is to clear the site's saved data in the browser (which erases tickets, dishes and settings) and restore a backup. A restored backup brings back the PIN it was saved with.

What the PIN protects: the back office (sales, menu, settings, data). The kitchen board and New ticket are open to everyone on purpose.

What the keypad now says (round 4, `60-shell.js`): a "Forgot the PIN?" fold under the keypad that says what the PIN protects, that Smokebox cannot recover it, to ask whoever set it first, and the exact clear-data-then-restore steps. This is wording only. No PIN logic changed.

The PIN is not real security: anyone who can use the device can read the browser's stored data. Every option below keeps that honest.

## Option A: a recovery code shown once

When a PIN is set, show a long random code (for example 4 groups of 4 letters) once and ask the owner to write it on paper or print it. "Forgot the PIN?" accepts the code and lets the owner set a new PIN. Only a hash of the code is stored.
- Good: works offline, no account, no data loss, small change (one screen, one hash, one more action in the engine).
- Bad: owners lose paper; people skip the screen. A code kept in the same browser data is no safer than the PIN.
- Cost: about one day, plus a Guide page and tests.

## Option B: backup file carries a reset path

Let the owner choose "Reset the PIN" at the keypad only after importing a backup file made on this device (the app compares a device id in the file with its own). The import replaces data except the PIN.
- Good: uses a thing owners already make (backups); no new secret to lose.
- Bad: needs a backup that has a device id; a stolen backup file lets someone reset the PIN (so it is weaker than A).
- Cost: about two days; touches the backup format (`84-office-data.js`) and store import rules, so needs the engine owner.

## Option C: a longer wait, then reset

After the 30-second lock, add "Reset the PIN after 24 hours": the owner taps it, the pad stays locked for 24 hours of real time, then a new PIN can be set. The board shows a notice meanwhile so a staff member cannot do it unseen.
- Good: no paper, no backup, no data loss.
- Bad: needs the device to be on a trusted clock and stay open for the day; a cook with the device in the evening can start it and take over next day unless the owner checks the notice (so it only keeps out the casual user, which is also all the PIN does).
- Cost: about one day.

## Recommendation (for Freddy to decide)

A for owners who will print one sheet, with C as the fallback for owners who did not. Do not add an email or text-message reset: Smokebox is offline by design and has no accounts.

## Not decided

Whether the Guide should print the recovery code card; whether the Connected package needs a different answer (a host device with several screens).
