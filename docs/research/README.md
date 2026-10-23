# Domain research index

Date: 2026-10-23. Author: domain advisor (round 12). Not legal advice; nothing here certifies compliance.

**Read this caveat first.** The research sandbox blocked every direct page fetch (fda.gov, state, county and vendor help sites all failed). Facts come from web-search summaries of the linked pages, GitHub code search for real sample files, and the repo itself. Reddit could not be searched at all. Each document says what it could not verify. Before any number or section reference goes into user-facing text, someone with open internet should open the cited link.

## Documents

| File | What it covers |
|---|---|
| [food-holding-rules.md](food-holding-rules.md) | Food Code holding, TPHC, date marking, cooling, reheating; state differences; how to model cook-ahead |
| [kds-market-practice.md](kds-market-practice.md) | How Toast, Square, Clover, Lightspeed, TouchBistro, Epson and free KDS apps behave; review themes; top 10 must-haves |
| [pos-export-formats.md](pos-export-formats.md) | Real header rows from Square and Clover exports; importer mismatches with exact strings |
| [restaurant-ops-checklists.md](restaurant-ops-checklists.md) | Opening, service, closing routines; logs; gaps in the inspector record |

## The 10 findings that most change what builders should do (most important first)

1. **Clover prices will be misread as cents.** The only real Clover-style file found has dollar prices (`5.99`, `12`). The importer treats whole-number Clover prices as cents, so `12` becomes $0.12 with just a warning, and the row still imports. Fix: decide by the whole file (any decimal point means dollars) or ask once. See `pos-export-formats.md` section 2 (row 4) and R1.
2. **Hot-hold has no time limit in the model code; temperature is the limit. Cold salads have two clocks.** The app has one "longest hold" in hours. Cold items need a calendar date mark (7 days maximum in the model code, day made is day 1) plus, only if the kitchen has a written TPHC procedure, a 4- or 6-hour out-of-fridge limit. Hot items need a temperature floor plus an optional quality limit the owner sets. See `food-holding-rules.md` sections 1.3 to 1.5 and 3.1.
3. **135 F is not universal.** New York State's sanitary code says 140 F hot and 45 F cold; New York City says 41 F and 140 F. The app's hot-hold floor cannot go below 135 F, which is fine, but setup wording must say "use your health department's number" and show the model code as a starting value only. See `food-holding-rules.md` Part 2.
4. **Several comments and help claims in the app have no source.** "The FDA minimum check interval is 4 hours" and "190 days is the minimum to keep" could not be found anywhere; sources say retention varies (30 days to a year in one blog, no universal rule). The 8-hour brisket limit and "reheat once per batch" are business rules, not code. Remove "FDA" and "minimum" from those claims or label them "our default". See `restaurant-ops-checklists.md` gaps 9 and 10, `food-holding-rules.md` 1.7.
5. **The Toast and Lightspeed importer paths rest on guesses.** No real Toast menu CSV was found; the fixture is invented. A plain sheet with headers `Menu,Price` is treated as Toast and every row fails with "no dish name"; `Item,Item Price`, `Dish,Price (USD)` and `Food,Price` fall back to typed-lines mode and make a dish out of the header row. Lightspeed K-Series files put `Item/Sub-item/Combo` in `Type`, which the importer reads as the category. See `pos-export-formats.md` rows 7 to 13 and R2 to R6.
6. **Clover `Printer Labels` is the only kitchen-station field in any export.** Square, Toast and Lightspeed exports have none, so the importer cannot fill Smokebox stations from them; the owner must pick stations after import. Add `Printer Labels` as a station alias and make the post-import "assign stations" step quick. See `pos-export-formats.md` R3, `kds-market-practice.md` item 3.
7. **Offline is the top complaint about cloud KDS products, and it is Smokebox's strongest point, with one hole.** Square's KDS lost tickets in outages and a promised offline mode could not be confirmed as shipped; even Toast needs a wired hub and router settings. Smokebox on one tablet is offline by design, but two tablets do not sync until "Connected". Say so in setup and sales wording. See `kds-market-practice.md` 1.7 and section 3 item 1.
8. **Cooling needs its own record.** County cooling logs have the 70 F checkpoint, the 41 F checkpoint, a corrective action (reheat 165 F or discard) and a manager verify. The app enforces the gates but its printed record shows only "cooling started" with a weight. Also: no cooler or freezer temperature log, no sanitizer strip reading, no thermometer check. See `restaurant-ops-checklists.md` gaps 1 to 4.
9. **Never let the app say what is or is not TCS, or call any limit "the legal limit".** No source ruled on banana pudding or coleslaw; each county decides. Keep slaw, potato salad and banana pudding on the safety basis (discard at the limit). Safe wording: "Set the limit your local health department gives you." See `food-holding-rules.md` 3.2 and 3.3.
10. **Print cards and the Guide should cover the kitchen, not only the tablet.** Opening and closing cards omit hand sink, thermometer check, cooler readings, sanitizer test, date labels and illness check, which every health department and vendor checklist lists. Draft card content is in `restaurant-ops-checklists.md` section 4. Also note that "reheat only once" appears in some counties' procedures but I could not find it in the model Code text.

## What nobody has verified (all documents)

Direct reading of the FDA Food Code 2022 text; any state code text; Square and Toast offline status in 2026; Toast menu export headers; Clover export price units; Reddit and G2 review content; extension-service guidance; sanitizer ppm figures as rules.
