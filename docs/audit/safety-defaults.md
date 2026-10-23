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

## Questions

1. Should slaw, potato salad and banana pudding in the sample use the safety basis (recommended yes)?
2. Should the cook-ahead switch ask a yes/no question in setup that cannot be skipped, so an owner never ends up with it off by accident?
3. Should the form for a new perishable ingredient push the owner to the cook-ahead kind?
