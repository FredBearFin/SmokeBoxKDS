# Defaults that affect food safety (for Freddy)

Written on `night/a5-r6`. Nothing here was changed in round 6. This is not legal or health-code advice and nothing was validated in a real kitchen: Smokebox keeps repeating "your local health-code rules override this" and the owner must check them. Each row says where the default lives, who meets it, and what I recommend.

## Defaults every kitchen has (in `10-config.js`, copied into settings)

| Default | Value | Who sees it | Recommendation |
|---|---|---|---|
| Hot hold minimum | 135 F | cook-ahead kitchens | Keep. It is the FDA Food Code number and cannot be set lower (bounds 135 to 200). |
| Cold hold maximum | 41 F | cook-ahead kitchens | Keep (bounds 33 to 41). |
| Reheat target | 165 F | cook-ahead kitchens | Keep (165 to 212). |
| Time below hot / above cold before discard | 2 h / 4 h | cook-ahead kitchens | The 4 h cold figure is my starter estimate, not from the research; confirm. |
| Cooling | 135 to 70 F within 2 h, to 41 F within 6 h total | cook-ahead kitchens | Keep (FDA numbers). |
| Longest any batch may stay | 12 h hard cap (setting range 1 to 24) | cook-ahead kitchens | Keep; consider 8 h as the default for a small place. |
| Temperature check interval | 120 min (range 10 to 240) | cook-ahead kitchens | Starter estimate. The FDA minimum is 4 h; 2 h is a house choice. Freddy to confirm. |
| Sanitize interval | 4 h (range 1 to 4) | cook-ahead kitchens | Keep (4-602.11). |
| First sanitize | due at once in every new state | everyone with cook-ahead on | Honest (nobody knows when it was last done). Hidden when cook-ahead is off and nothing is in the cabinet. |
| Warning ladder | 60/30/10 minutes before a limit (brisket 120/60/30/10, ribs 90/45/20/10) | cook-ahead kitchens | Starter estimates. |

## Defaults a NEW (blank-start) kitchen has

| Default | Value | Effect | Recommendation |
|---|---|---|---|
| `modules.cookAhead` | off | no hold cabinet, temperature checks, sanitize reminders or batch warnings at all | Right for a place that does not cook ahead. Risk: an owner who does hold food hot or cold but leaves it off gets no reminders. The setup screen must say plainly what turning it on adds ("Yes, I cook ahead"). |
| Pacing | off | items are not held back to finish together | Safe (no safety effect). |
| Plain ingredients (`addIngredient` without `tcs`) | counted in grams, no time or temperature control, never expire | a perishable such as chicken salad added as a plain ingredient is never flagged | Recommendation: in the add-ingredient form, ask "Does this need to stay hot or cold?" and offer the cook-ahead kind when it does. |

## Defaults for a custom cook-ahead ingredient (`addIngredient` with `tcs: true`, needs the module on)

| Default | Value | Why | Recommendation |
|---|---|---|---|
| Hold | hot (135 F) | most cooked food is held hot | The form should ask hot or cold. |
| Longest hold | 4 hours | careful side | Keep 4 h; owner may raise to 12. |
| Hold basis | `safety`: the batch is thrown out at the limit | the strict choice (no "best before" grace) | Keep as the default. |
| Cook time / rest time | 2 h / 0 | only used for planning run-out estimates | Harmless. |
| Pull size | 1,000 g | the "Pull" button amount | Harmless. |
| Cost | none recorded | cost shows as "not recorded", never 0 | Correct. |

## Defaults in the SAMPLE catalog only (demo and old kitchens; not changed)

| Item | Value | Concern | Recommendation |
|---|---|---|---|
| Jalapeno slaw, potato salad, banana pudding | cold, 4 h, hold basis `quality` (flagged `confirmBasis`) | a quality limit does not discard at the limit; these foods are often made with mayo, egg or dairy and are time/temperature controlled, so a safety limit is the cautious default | Change these three to the safety basis in the sample, and drop the sentence in the setup wizard that states a rule. Left unchanged here because the sample data is part of the old saves and the byte-for-byte checks; I need Freddy's decision. |
| Brisket and pulled pork | 8 h quality limit | a long quality window for hot-held meat | Starter placeholders (the config says so); confirm. |
| Ribs, sausage, turkey, mac, beans | 4 h quality | | confirm |
| Starter batches in the demo | already 155 F hot / 38 F cold with a reading | demo only | Fine; the demo is labelled pretend. |

## Defaults in the store and import that touch safety indirectly

- The safety log (temperatures, discards, cooling, sanitize, keep-serving) is kept 190 days even when history is trimmed. Recommendation: keep.
- The PIN hash is in the settings (never trimmed). A PIN protects the back office, not the food.
- Importing a menu never creates ingredients or cook-ahead rules; imported dishes have no recipe and no safety tracking.
- Reheat is allowed once, only within the grace period (code rule, not a setting).

## Recommendations on the open questions (round 7)

1. **Slaw, potato salad, banana pudding in the sample: use the safety basis.** Yes. They are commonly made with mayonnaise, egg or dairy, and a safety limit discards at the limit instead of offering "keep serving". Change `holdBasis` to `'safety'` for those three in `10-config.js` and delete the wizard sentence that states a rule; this alters the sample byte-for-byte, so it is a deliberate golden-hash change and should be done by one person with the hashes updated in the same commit. Not done here, as asked.
2. **Make the cook-ahead question unskippable?** Not blocking, but never silent: the setup flow should ask "Do you cook food ahead and hold it hot or cold?" with Yes and No as the only choices and no "later", and the board should show a small standing reminder ("Cook-ahead tracking is off") on kitchens that answered No. Rationale: a kitchen that holds food and never turns it on gets no reminders at all, which is the unsafe failure; a hard block on a tiny kitchen that does not cook ahead is only friction. A2 has built the "Yes, I cook ahead" switch; the reminder is not built.
3. **Corrupt-save copy cleanup after 30 days:** done in round 7 (`smokebox.v1.corruptat`, cleared once a working save runs; tested). The copy is still kept untouched for those 30 days.
4. **Close the month (export then prune): design only.** An office action "Close the month" that (a) exports a full backup file and an orders CSV for the month, (b) asks the owner to confirm the file saved, (c) removes finished tickets, orders and events older than that month from the live state (the existing `prune` already keeps the books balanced and moves safety records to the 190-day bucket), and (d) records `lastClose`-style `monthClosed` so the backup reminder knows. Never automatic, never without the export. It also answers the 12 MB history problem in `performance.md` without a new storage format.
5. **Last good copy:** built in round 7 (see `storage-budget.md`). It is a convenience; it does not replace the backup reminder.

## Questions (answered above; kept for the record)

1. Should slaw, potato salad and banana pudding in the sample use the safety basis (recommended yes)?
2. Should the cook-ahead switch ask a yes/no question in setup that cannot be skipped, so an owner never ends up with it off by accident?
3. Should the form for a new perishable ingredient push the owner to the cook-ahead kind?

## Cold food: how the engine models it today, and a proposal (round 12)

Decision from Freddy: do NOT change any default and do NOT move the sample's cold salads and pudding to a 4-hour hard stop. Cold food kept in a fridge follows different rules from food held out without temperature control, and the exact numbers differ by local health department, so the app must not state a rule. This section records how the engine models cold items now and recommends a better model. Nothing here is built.

### What the engine does today (read from `20-engine.js` and `10-config.js`)

- A cooked-ahead item is an ingredient with `tcs: true` and `hold: 'hot'` or `'cold'`. Each batch of it in the cabinet has `kind: 'hot'` or `'cold'`.
- **One time limit per item, in hours, at most 12.** `maxHoldH` (range 0.5 to 12 in `ING_PATCH`) is how long a batch may stay, counted from when it went in. On top of that there is one kitchen-wide hard cap, `settings.safety.hardCapH` (range 1 to 24 hours, default 12), and no batch of any kind outlives it. So **a cold item's limit cannot exceed 24 hours, and per item it cannot exceed 12.** A fridge life counted in days cannot be entered.
- **No way to say "in the fridge" versus "out on the line".** A batch has one clock (from `enteredAt`). There is no location, no date marking (made on, use by), and no pause of the clock while the batch is chilled. The only second clock is temperature based: when a reading shows a cold batch above `coldHoldF` (41 F, range 33 to 41), the batch is marked "out" (`outSince`), and it is thrown out when it has been out for more than `aboveColdGraceH` (default 4 h, range 0.5 to 4). That models "left out warm" only when someone logs a reading, not as a state the owner declares.
- **Basis.** `holdBasis` is `quality` (a house limit; past it the batch comes off the menu until someone checks it and may keep serving for a limited extension) or `safety` (thrown out at the limit). The sample's slaw, potato salad and pudding are `quality`, 4 hours, cold, flagged `confirmBasis` for the owner to check. A custom cook-ahead ingredient defaults to `safety`, 4 hours, hot.
- **Temperature checks for cold batches.** A reading is due every `tempCheckEveryMin` minutes (default 120, range 10 to 240) for every batch, hot or cold. A cold reading above 41 F starts the out-of-range clock and shows "chill it now"; a missing or old reading shows "check temp". Cooling (135 F to 70 F in 2 hours, then to 41 F within 6 hours in total) applies to batches started with `startCooling`, not to a cold item bought or made cold.
- **What the cold item is not.** It is not "kept in a fridge for N days". A cold item the owner really keeps for three days cannot be run in Smokebox as it is: it would be thrown out or taken off the menu at 12 or 24 hours at most.

### Recommendation: model a cold dish with two owner-entered limits

1. **Two limits on a cold item, no invented default.** `fridgeDays` (whole days, owner-entered, no default; empty means "not set") and `outHours` (hours out of the fridge, owner-entered, no default). A cold cooked-ahead item that has neither set keeps today's behavior (the single `maxHoldH`), so nothing changes for existing kitchens. The entry form shows one plain line: "Check your local health department's rules for both numbers. Smokebox does not know them."
2. **Where it is.** A batch gets `place: 'fridge' | 'line'`, default `'fridge'` for cold items. A new action `moveBatch { batchId, to }` records taking it out to the line or putting it back, with the time and initials like other safety entries.
3. **Date marking.** A batch records `madeOn` (the date it went in, already `enteredAt`) and the use-by date shown on the cabinet card is `madeOn + fridgeDays` while it stays in the fridge. Out-of-fridge time is accumulated (`outMs`), so a batch taken out and put back several times still counts the total out time; `outHours` is checked against that total.
4. **Rules the gate would apply** (only for items with both numbers set): thrown out (or taken off the menu, by the item's basis) when `now > enteredAt + fridgeDays` while in the fridge, or when accumulated out time exceeds `outHours`. The hard cap stays as a last resort but its upper range is raised for such items only, with the same plain line.
5. **Temperature checks.** Readings stay required for batches in the fridge (at or below `coldHoldF`) on the same interval; while a batch is on the line a reading is not required but "out" time is counted from the moment it was moved. A reading above `coldHoldF` in the fridge still starts the existing out-of-range clock.
6. **Reports and screens.** The cabinet card shows "In the fridge, use by Tue" or "Out since 2:10 pm, 1 h 40 left"; the warning ladder and attention strip use the nearer of the two limits; discards record which limit ended the batch.

### Size of the change and tests needed

- Engine: about 250 to 350 lines. New fields on ingredients (`fridgeDays`, `outHours`, validated in `ING_PATCH` and `addIngredient`) and batches (`place`, `outMs`, `outSince`-like start of the current stay on the line); `gate` and `statusDeadline` use the two limits when set; one new action `moveBatch` (undoable, safety entry, refused for hot items); `validateBackup`, `checkInvariants` (place values, out time never negative, out time only grows), the deadline feed rows, and the discard log text.
- UI: the ingredient form (two fields and the plain line), the cabinet card (place, use-by, out time, a move button), and the strip wording. Other teams' files.
- Migration: all new fields absent means today's behavior; old saves load unchanged and the golden hashes of the sample stay as they are (the sample's cold items keep their current numbers; the owner can add days and hours).
- Tests (about 25): the gate for both limits and the hard cap; moving in and out several times adds up; thrown-out reasons; a batch with no new fields behaves exactly as before; add and edit validation (days 1 to 30, hours 0.5 to 24, never required, never defaulted); undo of a move; backups round trip; old-save fixtures; the fuzz generator with moves; the deadline feed rows; start over and the demo untouched.
- Risks: the place model can drift from reality if staff forget to log a move (mitigation: the card says "not moved yet" and the temperature check still runs); local rules differ, so the app must keep saying it does not know them; extra taps for a busy cook (mitigation: move only needed for items that have both limits set).
- Why not now: it needs engine, store, deadline feed and three screens and a decision about how out time is shown; it is not supported by any current setting.

### Update after the domain research (round 13)

Source: `docs/research/food-holding-rules.md` (an advisor read only search summaries of the cited pages, so each point below is a lead to confirm with a health department, not a rule). Changes to the recommendation above:

1. **Date marking is a calendar rule, not hours.** The model code (3-501.17) asks for a date mark on ready-to-eat cold TCS food held more than 24 hours, a 7 day maximum at 41 F or below, and the day made counts as day 1. So `fridgeDays` should be stored as whole days and the use-by date computed as a calendar date (`madeOn` plus `fridgeDays - 1`, end of that day, using the kitchen's wall clock), not as `enteredAt + days * 24 h`. The label form (date, weekday or color) is the owner's. Freezing pauses the clock in the sources, so a later version may need a freezer place. Commercially packaged items follow the maker's date until opened.
2. **The 7 days is a ceiling to show, never a default.** The form says "Check your local rule. The FDA model code uses 7 days counting the day made." and leaves the field empty. Range 1 to 30 stays an app bound only so a typing slip cannot save 400.
3. **Out of the fridge has its own clock, and it only exists with a written plan.** The 4 or 6 hour out-of-fridge limits belong to time as a public health control (3-501.19), which needs written procedures kept on site and food marked with the time it must be gone. So `outHours` is a field the owner types after checking the procedure; the app must not suggest 4 or 6 as if they were free to use. The 6 hour option also needs a record that food stayed at or below 70 F, which the current log does not capture; say so on the form. Local agencies often allow only the 4 hour option.
4. **Hot holding has no fixed time in the model code.** The limit is the temperature (135 F or above, 140 F in New York State). A hot item therefore needs a temperature floor (already built) and an optional quality limit the owner sets in hours; it must not be presented as a safety time. The existing `holdBasis: 'quality'` is right for hot items, and `hardCapH` is a house limit. The 8 hour brisket value in the sample is a placeholder with no source; reword it as "your quality limit" wherever it is shown.
5. **Reheat and cooling are separate flows.** 165 F for 15 seconds, within 2 hours from 41 F, is the model reheat; hot holding equipment is not approved for reheating in at least one county's guidance. "One reheat per batch" is Smokebox's rule and now says so in the engine messages. Cooling has two checkpoints (135 to 70 F in 2 hours, then to 41 F by hour 6); the app already gates both.
6. **State and county differences.** Tell the owner to set the numbers their department gives (New York State: 140 F and 45 F; New York City: 41 F and 140 F). The existing bounds (hot hold 135 to 200 F, cold hold 33 to 41 F) cannot represent 45 F cold holding, which Texas allows for some foods and New York State uses. Decision needed before any change: widen the cold bound only on an explicit owner choice, or keep 41 F as a hard end.
7. **Never claim.** The app does not decide what is TCS (banana pudding, slaw), does not call any entered number "the legal limit", and does not say food is safe. Sample cold salads and pudding stay on the safety basis in the recommendation; nothing was changed in this round.

Decision on building: not built this round. The engine part is more than the 300 line allowance once date marking, the `moveBatch` action with undo and safety entries, `validateBackup`, invariants, the deadline feed rows, the discard log text, old-save fixtures and the fuzz generator are counted, and no screen exists to show a place or a use-by date, so an engine-only version would run with nobody able to set or see it. It stays a designed next step with the corrections above. Smallest useful first slice, if wanted: `fridgeDays` alone on cold items (a calendar use-by on the batch card and a discard at the end of that day), about 120 lines plus 10 tests, behind the absent-means-today rule.
