# Guide, FAQ and cards checked against the research (A4, round 14)

Sources: [food-holding-rules.md](../research/food-holding-rules.md) (FHR) and [restaurant-ops-checklists.md](../research/restaurant-ops-checklists.md) (ROC). Both say their numbers come from search summaries, not from reading the code, and that nothing is legal advice. I treat that as a limit on what the Guide may claim: no number or rule is stated as the app's own.

## Contradicted or unsupported, and fixed

| # | Where | What it said | What the research says | Fix |
|---|---|---|---|---|
| 1 | Guide "What this app does not replace" (docs/sop/16) | The starting limits, such as 4 hours, are "its own starting values or house rules, not code". | FHR 1.4: a 4-hour limit exists in some codes (time as a public health control), for food held without temperature control. Calling it "not code" is itself a claim. | Now says "starting values, not your local rules. Set the limits your local health department gives you." |
| 2 | Same page | Safety help implied the app covers the kitchen's temperature records. | ROC section 4 gaps 2 to 4: the app logs batches only, not cooler or freezer readings, sanitizer strength or thermometer checks. | Added: Smokebox does not log those, keep a paper log. Same sentence in the owner FAQ (question 7). |
| 3 | Opening and closing cards | Tablet and cabinet items only. | ROC section 1 and gaps 7 and 8: hand sink, thermometer check, cooler and freezer readings, date labels. | Opening card: hand sink and "anyone unwell", thermometer in ice water, readings on a paper log. Closing card: date labels "as your local rule says", final readings on a paper log. No number is stated. |
| 4 | Guide "Cabinet and warnings" (docs/sop/07) and its picture | "Reheat once per batch". | FHR 1.7: no "reheat once" rule found in the code; it is a business rule. | Already changed in round 12 to "Smokebox allows one reheat per batch. That is its own rule, not a health code rule." Still correct. |
| 5 | FAQ and README | "Back office has a printable food safety record". | FHR 3.1 point 4, ROC gap 12: fine, the record says it is not an inspection result. | Kept. The FAQ asks the owner to check whether the health department accepts it. |

## Checked and supported (no change)

- No Guide, FAQ or card text gives a temperature, a hold time, a date-marking day count or a retention period as the app's own claim. The only numbers are the warning steps (60, 30 and 10 minutes), which are the app's own alert timing.
- The Guide never says food is safe, compliant or approved. The test in `test/guide.test.mjs` blocks those words.
- The Guide does not state how long records are kept (ROC gap 9: no source sets a minimum).
- "Sanitize" appears only as a reminder button, with no sanitizer strength (ROC section 3).

## Open, for the cold-item work (A5 and A2 this round)

- FHR 3.1 says cold items need two clocks: days in the fridge (a made date and a use-by date) and hours out of the fridge. When that lands, the Guide must say only: "Use the limits your local health department gives you", and must not copy the model-code numbers (7 days, 4 or 6 hours).
- FHR 3.1 point 5: cooling has two checkpoints, not one. When the cooling readings land, the Guide describes what the screen asks for and nothing more about the rule.
- FHR 3.1 point 7: the cabinet is for holding, not reheating. The Guide should not suggest the cabinet reheats food.
- FHR 3.2: never say a particular food is or is not a time and temperature control food. The Guide does not name any dish in that way.

## Not checked

- The research could not read the code pages, so none of it was verified against the code itself.
- Local rules in any state or county.
