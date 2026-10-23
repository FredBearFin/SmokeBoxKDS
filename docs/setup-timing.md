# Setup timing summary (SCRIPTED, not human)

Every number here comes from `ux-scripts/setup-journey.mjs` driving the built app in headless Chromium at 1280x800 from an empty browser. **No person did this, and nothing was tried on a real tablet.** Modeled time = 1.2 s per tap + 3 s per typed field + 0.25 s per character typed + 4 s of reading each new screen. A real first-timer will be slower: this is a best case with no hesitation, typos or wrong turns. Re-measured in round 15 on the final build (night/a2-r15): the numbers did not change from round 8 even with the new questions and screens, because every new card is optional and the script skips them.

| Path | Taps | Typed fields | Characters | Screens read | Modeled time |
|---|---|---|---|---|---|
| Fresh install to first paid ticket, three dishes, four stations | 13 | 6 | 53 | 9 | 1.4 min |
| Same, one station (no "where is it made?" question) | 10 | 6 | 53 | 9 | 1.3 min |
| Adding the three dishes alone | 6 | 6 | 53 | | about 54 s |
| One cooked-ahead dish: add it, say yes to cooking ahead, add Brisket, link it, log a first batch, paid order | 14 | 3 | 25 | 5 | 0.9 min |
| Coming back later: Menu to Dishes and prices | 2 | 0 | 0 | | |
| Change one price from the board | 3 | 1 | 5 | 3 | about 20 s |

Targets set in `docs/setup-target-flow.md`: three dishes in under 2 minutes (scripted: about 54 s) and fresh install to first paid ticket in under 10 minutes (scripted: 1.4 min). Both are met only on paper. The honest test is the human one below.

What the script does NOT include: reading the welcome screen carefully, choosing prices and names, mistyping, on-screen keyboard delays, fat fingers, deciding where a dish is made, interruptions, turning on sound, installing as an app.

## What a human should time (checklist for Freddy, with a stopwatch)

Do this on the real tablet, from a freshly cleared browser (Settings, site data, clear) or a new private window, with the same file the owner would get. Use a real list of 3 dishes on a card so the person is not inventing them. Do not coach.

1. Start the stopwatch the moment the person is handed the tablet with Smokebox open. Say only: "Put these three dishes on it, then ring up one order and take cash."
2. Press lap 1 when the first dish is saved. Lap 2 when the third dish is saved. Lap 3 when the order screen opens. Lap 4 when the paid ticket shows on the board ("Paid ... by cash"). Stop.
3. Write down: total time, the four lap times, number of taps (count out loud or film the screen), and every spot where they stopped for more than 3 seconds, asked a question, tapped the wrong thing, or said "what does that mean".
4. Note which button they pressed first on the opening screen, and whether they found "Tax, hours and PIN" without help if you then ask "set sales tax to 6 percent".
5. Repeat with a second person who has never seen it. Two people are the minimum; five give a real picture.
6. Record on one line each: `person, device, total m:ss, lap1, lap2, lap3, lap4, wrong taps, questions asked, words they did not understand`.
7. Targets to compare: three dishes under 2:00; fresh start to first paid ticket under 10:00. Anything over target, write which lap it was in.
8. Also time "come back the next day": reload, then change a dish price. Expect under 30 seconds.

## Round 15 additions (still scripted, not human)

- **Optional cards cost nothing when skipped.** The "How do you serve?" question and the "Do you cook food ahead?" question sit under the dishes; the journey script never taps them, so runs A, D and E are unchanged (13, 10 and 14 taps). Answering "How do you serve?" is one tap; answering the cook-ahead question No or Not sure is one tap.
- **Screens read at four sizes** (390x844, 768x1024, 1024x768, 1920x1080) in Day, Night and Large text: 216 screens with no small, clipped or sideways-scrolling items.
- **Four other kitchens** (pizza, bakery, taco truck, bar) each reach a first paid ticket with no barbecue words on the screens the owner works in.
- **Still to time with a person:** everything above. See the checklist in this file and `docs/try-this-first.md`, steps 1 to 16.

