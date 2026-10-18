# Smokebox UX test report (kitchen use), 2026-10-18

Scope: how the kitchen board works for a cook, not whether the engine is correct. Everything below was measured or replayed in a real browser (Playwright, touch enabled) against the built app. No code was changed. Test scripts live in the session scratchpad (ux1 to ux8).

## What was tested
1. First-run screen and a busy board at 1024x768, 1180x820, 1280x800 and 1920x1080.
2. Every button and key piece of text on the board: size in CSS pixels, converted to physical size and reading distance.
3. Real tap counts for the core jobs, by driving the actual buttons.
4. A replay of the hold-limit failure by fast-forwarding the app clock.
5. A distance simulation (shrink and blur a 1920x1080 and a 1280x800 board).
6. The "..." menu, the New batch form, the empty-kitchen screen, sound defaults, screen keep-awake.

## Findings, worst first

### Critical
1. **Batch expiry has no warning ladder, and the one existing signal cries wolf.**
   - Replay: ten starting batches (brisket, pork, ribs, sausage, turkey, mac, beans, slaw, potato salad, pudding) all enter at the same moment with a 4-hour limit.
   - The Hold button lights with a count of 10 about 36 minutes in. The reason is "needs a temperature reading" (readings are due every 30 minutes per batch). It stays lit for 3+ hours, so it teaches people to ignore it. It never mentions expiry.
   - At 4 hours 2 minutes all ten batches are discarded at once. The Hold badge disappears (nothing left to flag). The 86 button shows 17 items off the menu. No sound, no banner, nothing on the board.
   - At the sample cost per kg the loss is about $762 in one instant (brisket alone $341).
   - The Hold sheet does show "35m of 4 h" per batch, but only after you open it.
2. **Sound is off by default, there is no spoken output, and there is no screen keep-awake request.** A kitchen display whose alarms are off and whose tablet may sleep cannot warn anyone.

### High
3. **Tablet widths below 1180 px hide Hold cabinet, Recall, 86 board and the sanitize timer behind a menu.** At 1024x768 the header shows only station tabs, New ticket, Orders, Back office and the menu button. This includes older iPads and cheaper Android tablets.
4. **Text is too small for any real viewing distance.** Measured at 1280x800: ticket number 24.5 px, timer 22 px, item and customer names 16 px, the "Tap START on..." line 12.5 px, status chips 12.5 px, station tags 11 px. Using a 0.4 degree cap-height rule for comfortable reading and 0.2 degree for barely legible:
   - 10.1 in tablet: item names comfortable to 0.9 ft, barely legible to 1.8 ft.
   - 43 in 1080p TV: ticket number comfortable to 5.1 ft, item names comfortable to 3.2 ft and barely legible to 6.4 ft, next-action line barely legible to 5 ft.
   There is no far-display mode.
5. **Taps per ticket are high.** A 3-item ticket costs 8 taps from first touch to bump (4 items cost 10). A 40-ticket rush is about 340 taps. Order entry costs 6 taps plus a name, payment costs 3, 86-ing an item costs 2.
6. **When many tickets are overdue the whole board is pink, with no hierarchy among them.** In the busy test 9 of 13 tickets were overdue and looked identical. Every healthy ticket also carries a green "On time" chip, so healthy tickets add noise instead of staying quiet.

### Medium
7. Tickets have different heights in a multi-column grid, so on a busy board items drop below the fold. The all-day counts sit in a strip at the bottom that is cut off.
8. Toasts stack in the middle of a sheet and cover buttons (seen on the 86 board).
9. The 86 board starts with a "Channel sync" block (simulated, no POS connected) that pushes the real controls down the screen.
10. Units are mixed: the New batch form uses degrees Celsius and kilograms while the hold alerts use degrees Fahrenheit. There is no units setting.
11. The New batch form for a pit master has many inputs (product, raw weight, cook endpoint, rest hours, first temperature, label). There is no "same as last batch" shortcut.

### Done well
- Tap targets are 44 px and up at tablet size, and the main START, DONE and Bump buttons are large with an icon and a word.
- Overdue is shown with an icon and the word "Overdue", not color alone.
- Each ticket has a "what to do next" line (right idea, too small).
- Station tabs show counts. Undo is offered after a bump.
- Type scales up about 25 percent from 1280 to 1920 wide.
- No console errors in any run.

## Caveats
- All tests are simulated. No real cook has used this through a real service.
- The reading-distance angles are my assumptions (0.4 and 0.2 degrees), stated so they can be checked.
- The sample cost numbers come from the sample menu, not a real kitchen.

## Phase A replay: what counts as a false alarm and a miss (written before the run)

This section was committed before the replay was run, so the result cannot shape the definition. The replay is a **simulation**: a scripted pit master and the app's demo crew in a headless browser at 240 times real speed. It is not a real service, and no cook has used the app. It can find noisy or silent warnings in the app's own logic; it cannot say how a real kitchen behaves.

**Sound.** One sounded alert: the first sound at each rung of the warning ladder, each expiry or past-quality sound, and the loud tone repeating while it is unacknowledged (a repeat is counted as its own sound but is only scored as a false alarm if its rung was). The report gives the total number of sounds, and sounds per hour.

**False alarm.** A sound where, at the moment it sounded, any of these held:
1. projected waste was known and below the floor (under 500 g and under 15 percent of the batch);
2. under 300 g remained in the batch;
3. the kitchen was closed and the "sound outside open hours" setting was off (should be impossible; the check proves it);
4. fewer than 60 seconds remained before the deadline, so nobody could have acted.
A sound about a clock deadline when the pace was unknown is not a false alarm by rule 1: the deadline is a fact about time, and no waste estimate was claimed.

**Miss.** A batch with waste at or above the floor (500 g, or 15 percent of the batch, whichever is lower) at its limit that got no sound for that batch at least 10 minutes earlier while the kitchen was open. Limits reached while the kitchen was closed are listed separately and are not counted as misses.

**Method.** 8 virtual hours of service starting at the current hour, closing at the end of them (service hours set in the replay), 240x speed, 1280x800, demo crew on, a scripted pit master cooking new batches every 2 to 3 hours and, when a batch goes past its quality limit, logging a temperature and keeping it serving for an hour if more than 1 kg is left (otherwise discarding it). Run twice. Alerts are read from the board's own alert log (`SB.floor._alerts`), which records the batch, the grams left and whether sound was allowed at the moment of each sound.

Results are in the next section once the run is done.
