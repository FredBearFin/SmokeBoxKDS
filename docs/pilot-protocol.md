# Real-service pilot protocol ("visit two")

One real lunch rush beside the pilot's own system, observer only. This is the **gate**: the line board's big type, Square import, Phase C, D, E and Connected mode wait for its answer. It is one service in one kitchen with an observer in the room, so it can say "this does not work" much better than it can say "this works". It is not statistics.

## What the gate decides

The gate **fails** (stop and rethink before building more) if any of these is true:

1. **Discard cost.** The owner cannot name what they threw out last week and what it cost, or the figure is under one month's price of the app (price fixed before the visit: **$______ a month**).
2. **Pull taps.** Fewer than **50 percent** of the real cuts got a pull tap on the board (taps counted by the app, cuts counted by the observer). Below that the projected-waste number cannot be trusted. Look first at where the tablet sits before blaming the idea.
3. **The chime is not heard** from the pit position (the observer stands there and writes down each warning and whether they heard it without looking).
4. **The owner would pay nothing.**

Reported, not pass or fail: seconds per ticket (only if Smokebox tickets were used), taps per job, discards per day and cost, warnings that sounded and what the cook did, any warning the cook calls false ("it beeped for nothing") or missing ("it should have beeped"), anything the cook ignored.

## Before the visit (Freddy)

- Fix the price and write it above and on the observer sheet.
- On their tablet, run **Settings, Set up this tablet** (seven steps): sound test, screen kept on, protected data, installed as an app, tablet placed where the cutter can tap it without walking (a sketch or photo of where), their dishes, and hold limits. A new kitchen starts empty: add dishes (or import a menu file), answer "Do you cook food ahead?", and enter their real products (cost per kg, pull size, hold limit and kind, rest time). Cold items take days in the fridge and hours out of the fridge typed by the owner; leave a box empty rather than guess.
- Check the hold limits and the temperature-check interval against their local health department. The limits the app starts with are starting values, not local rules. The app is a helper; the local code governs.
- Set service hours and "Warnings start at" to when their pit starts. Turn the demo clock and demo orders **off** (the report warns if they were on).
- Test the loud tone from the pit position. Bring a speaker and a battery pack.
- Open the Data page and take a **backup** so there is a clean starting point.
- Things to try once on their tablet, because they are untested elsewhere: open the app in two tabs and see that only one makes sound; hide the app and bring it back; turn the sound off and see the "Sound is off on this tablet" bar; add a batch and tap a pull.

## During (observer only, no coaching)

Use the one-page observer sheet (`docs/pilot-observer-sheet.md`). Tally every cut you see and every moment a cook looks at the strip; write down each warning, what the cook did, and whether it was heard from the pit. Do not point at the screen or explain it.

If a warning is wrong in a way that could cause a food-safety mistake, the cook follows their own rules; write it down and say so afterward.

## After

1. **Data page, Pilot report:** window "Since opening", type the number of cuts you counted, **Show report**, then **Download CSV**. Keep the file.
2. Ask the discard question again ("what did you throw out last week and what did it cost?") and the price question. Write the exact words.
3. Fill the decision table below.
4. Take a backup, then **Erase tickets and records** (settings are kept) so their next day starts clean.

## Decision table

| Result | Meaning | Next step |
|---|---|---|
| Pull-tap rate under 50 percent | Cuts are not being logged: the burn-rate source is weak | Move the tablet, or add the hourly count; do not build more projection features |
| Chime not heard from the pit | Sound plan fails | Speaker, placement, or a visual-only plan before anything else |
| Owner cannot name a discard cost, or it is under one month's price | The pit-manager value is thin for this kind of place | Rethink who it is for |
| Owner would pay nothing | Positioning is wrong | Stop and rethink |
| All four pass | The pit-manager idea survives one real service | Plan the line board and Square import |

## What the pilot report does and does not tell you

It counts what the board recorded: pulls, discards and their cost, warnings and taps on them, keeps and reminders, and taps per hour for each job. It compares the board's pace estimate with what was actually pulled in the last 2 hours. It **cannot** see cuts nobody tapped (that is why the observer counts them), food that never went through the app, or whether a warning was heard. Demo and sample data are left out and counted; undone actions are left out. "A week at this rate" from one service is a rough guess and is labelled that way.

## Not tested before this visit

Real tablet audio and speech, hidden-page timer throttling (the board warns only while it is in front and the screen is awake; a locked screen runs nothing), a crash of the sound leader tab, Safari and iPad, and anything across devices.
