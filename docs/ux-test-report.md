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
