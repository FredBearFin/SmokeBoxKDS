# How US food codes treat holding prepared food

Date: 2026-10-23. Author: domain advisor (research pass, round 12).
This is background research for the builders. It is not legal advice and it is not a statement that the app is compliant with any code.

## How to read this document (important limits)

- During this pass the research sandbox blocked direct page fetches (every fetch to fda.gov, state sites and county sites failed; a 403 from the egress proxy and DNS errors). I could only use web search, which returns short summaries plus links. So every claim below comes from a search-result summary of the linked page, not from me reading the page. I mark this as "(search summary)" where the claim is the only support. Nobody should treat these as verified quotes. Before any number goes into app wording, someone with open internet should open the linked page and check it.
- Several summaries came from secondary sources (county handouts, consultant sites). I prefer government pages and say when a claim rests on a vendor or exam-prep page.
- Where sources disagree I say so.

## Part 1. What the sources say

### 1.1 The model code and who adopts it

- The FDA Food Code is a model. It has no force by itself; each state or local agency adopts all or part of it, often with changes. Source: [FDA, adoption of the Food Code by state and territorial agencies](https://www.fda.gov/food/fda-food-code/adoption-fda-food-code-state-and-territorial-agencies-responsible-oversight-restaurants-and-retail) (search summary of title; the "each jurisdiction adopts" point is also made by [Food Safety Magazine](https://www.food-safety.com/articles/10947-11-states-and-counting-have-adopted-most-recent-fda-food-code-as-of-2024)).
- Current edition is the 2022 Food Code (released December 2022), with a supplement published in 2024. Adoption is slow and uneven: as of the end of 2024 only 11 state agencies in seven states, about 16% of the US population, had adopted the 2022 edition ([Food Safety Magazine](https://www.food-safety.com/articles/10947-11-states-and-counting-have-adopted-most-recent-fda-food-code-as-of-2024), search summary). I could not find a 2025 or 2026 count. Many places still enforce 2017, 2013 or older text. Example: Florida's rule 61C-1.001 (amended effective 2026-03-17) references the 2017 Food Code ([FL Rules gateway](https://flrules.org/gateway/ruleno.asp?id=61C-1.001), search summary).
- Consequence: the section numbers and the exact text below are the model code, and your customer's county may differ.

### 1.2 TCS foods

"TCS" means time/temperature control for safety food: food that needs time and temperature limits because bacteria can grow in it. Examples in health department handouts include cooked meat, cut melons, dairy, cooked rice, and house-made salads with egg or mayonnaise (see the date-marking handouts, for example [Minnesota Dept. of Health](https://www.health.mn.gov/communities/environment/food/docs/fs/datemarkingfs.pdf)). I did not retrieve the formal definition text from the Code. Whether a particular dish (for example banana pudding) counts as TCS depends on its ingredients and pH/water activity and is decided by the regulator. I found no source that rules on banana pudding or on coleslaw specifically (search summary says neither appeared). Do not let the app decide this.

### 1.3 Hot holding and cold holding (Code 3-501.16)

- Model code: hold TCS food at 135 F or above, or at 41 F or below. Sources: [South Carolina Dept. of Agriculture poster, citing 3-501.16 in its adopted form](https://agriculture.sc.gov/wp-content/uploads/2024/04/ProperHoldingTemps2024_Sticker_4x6_digital.pdf); [Oregon Dept. of Agriculture](https://www.oregon.gov:443/oda/programs/FoodSafety/FoodSafe/Documents/Temperature%20Requirements.pdf); [Texas DSHS quick reference](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/Reg-Code-Quick-Reference_47Item_Version1_0---August-2021-FINAL.pdf) (all search summaries).
- The code has no maximum time for food that is held continuously at 135 F or above. The limit is the temperature. (This is my reading of the structure of 3-501.16 and of the TPHC rule, which exists precisely for food that is NOT temperature-controlled. I did not find a page that states "there is no time limit for hot holding" in so many words, so treat it as unverified wording.) Quality (dry brisket, hard rice) is a separate matter from safety.
- Texas lists cold holding as "41 F / 45 F" because Texas allows 45 F for some items such as certain eggs ([Texas DSHS quick reference](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/Reg-Code-Quick-Reference_47Item_Version1_0---August-2021-FINAL.pdf), cited at 228.75(f)(1), search summary). Oregon's 2013 sheet mentions 45 F for unpasteurized eggs (search summary).
- Hot-hold equipment is for holding, not heating. Guidance: if hot food has fallen below 135 F, reheat to 165 F for 15 seconds only if the last good reading was 135 F or more within the last 2 hours; discard if you cannot say how long it was below 135 F ([ICN fact sheet, "Holding hot foods"](https://theicn.org/resources/521/food-safety-fact-sheets/107118/holding-hot-foods.pdf), search summary).
- Checking frequency: the ICN sheet suggests checking product temperature at least every 2 hours; Island County (WA) suggests checking hot-hold equipment at least twice per shift ([Island County](https://www.islandcountywa.gov/DocumentCenter/View/4174), search summary). These are guidance, not code requirements, as far as I can tell. The Code itself does not (in what I found) require a written temperature log for ordinary hot holding; some jurisdictions or HACCP plans do. Not verified.

### 1.4 Time as a public health control (TPHC), Code 3-501.19

TPHC lets an operator hold TCS food without temperature control for a limited time if written procedures are in place.

- Written procedures prepared in advance, kept on site, and shown to the inspector on request. Sources: [Rhode Island DOH guidance](https://health.ri.gov/sites/g/files/xkgbur1006/files/2025-05/Time_as_a_Control_guidance_and_application_Fillable.pdf), [Texas DSHS TPHC page](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/Time-as-a-Public-Health-Control.pdf), [Sacramento County handout](https://emd.saccounty.gov:443/EH/Documents/TIME%20AS%20A%20PUBLIC%20HEALTH%20CONTROL%20HANDOUT-LOG%209-16-22.pdf) (search summaries).
- 4-hour option (3-501.19(B)): food starts at 41 F or below (or 135 F or above in the version several local agencies describe), is marked with the time that is 4 hours after it left temperature control, and is served, cooked or discarded by that time. Unmarked food, or food past the time, is discarded. Sources: [Delaware's adopted text](https://www.law.cornell.edu/regulations/delaware/16-Del-Admin-Code-SS-3-501.19) (search summary says the 4-hour option is paragraph (B) and 6-hour is (C)); [Louisiana/other county handout via Lake-Forest-Co. PDF](https://www.lfchd.org/wp-content/uploads/2022/11/Time-as-a-Public-Health-Control-11.14.2022.pdf). Sources differ on the starting temperature: one search summary reports "135 F or above, or 41 F or below" for the 4-hour option, others describe only the cold start. I could not resolve this without the Code text.
- 6-hour option (3-501.19(C)): food starts at 41 F or below, must not rise above 70 F, is marked with the removal time and the discard time, and must be served or discarded by 6 hours. If it goes over 70 F it is discarded. A record of temperature monitoring is needed to show it stayed at or below 70 F ([Rhode Island DOH](https://health.ri.gov/sites/g/files/xkgbur1006/files/2025-05/Time_as_a_Control_guidance_and_application_Fillable.pdf); [Chester County PA](https://www.chesco.org/DocumentCenter/View/64599/Time-as-a-Public-Health-Control); search summaries). Sources differ on wording of the discard rule (discard at the 6-hour mark versus discard as soon as 70 F is exceeded; a food at or below 70 F is still discarded at 6 hours).
- Edition matters: the 6-hour option is in the 2013-onward model text per the Delaware and Rhode Island pages, but many local agencies only allow the 4-hour option. California county handouts I saw describe only the 4-hour rule (California Retail Food Code section 114000; [Sacramento County](https://emd.saccounty.gov/EMDForms/Documents/TIME%20AS%20A%20PUBLIC%20HEALTH%20CONTROL%205-16-13.pdf), search summary). Texas DSHS describes TFER 228.75(i) with the 4-hour mark (search summary).
- Some uses are not allowed in some places, for example raw eggs for highly susceptible populations (a county page in the first search). Not verified at the Code level.
- Limits on use: it is for a working supply of food, or ready-to-eat food held for immediate service; it is not a way to cook ahead for a day. California county handouts say "working supply of raw potentially hazardous food before cooking, or ready-to-eat food held for immediate consumption" (Sacramento County, cited above).

### 1.5 Date marking, Code 3-501.17

- Applies to ready-to-eat TCS food that is refrigerated and held in the establishment more than 24 hours. Mark it with a date or day by which it must be eaten, sold or discarded. Maximum 7 days at 41 F or below. The day of preparation (or day a commercial package was opened) is day 1, so the last day is day 7. Sources: FDA training excerpt ([fda.gov/media/127796](https://fda.gov/media/127796/download), search summary); [Minnesota rule 4626.0400](https://law.cornell.edu/regulations/minnesota/Minn-R-4626-0400); [Minnesota Dept. of Health](https://www.health.mn.gov/communities/environment/food/docs/fs/datemarkingfs.pdf); [Columbus Public Health](https://columbus.gov/files/sharedassets/city/v/1/public-health/food-protection/food-safety-toolbox-english/datemarking.pdf).
- The label form is not fixed: dates, days of the week or color codes are accepted (FDA excerpt above).
- The clock does not reset after freezing. Freezing pauses it (a Food Code based guide; see [Food Date Labeling Guide](https://www.gofoodservice.com/guides/food-date-labeling-guide), a vendor page, so weaker).
- Exemptions are for commercially made products (for example commercial deli salads, some cheeses) and a manufacturer's use-by date can govern while in the original container ([Columbus](https://columbus.gov/files/sharedassets/city/v/1/public-health/food-protection/food-safety-toolbox-english/datemarking.pdf); [North Carolina](https://ehs-prod.dph.ncdhhs.gov/faf/docs/coldhold/CHC-DateMarking.pdf); search summaries).
- House-made deli salads (egg, tuna, chicken, potato, pasta) are generally listed as needing a date mark ([Whatcom County](https://whatcomcounty.getanchor.io/DocumentCenter/View/67094/Date%EF%B9%AA20Marking%EF%B9%AA20handout.pdf), search summary). Coleslaw and banana pudding are not named in anything I found.
- Day counting differs in wording between sources ("seven calendar days including the day of preparation" in Minnesota versus "day 1 plus 6 more days" elsewhere); these mean the same thing.

### 1.6 Cooling, Code 3-501.14

- Cooked TCS food: from 135 F to 70 F within 2 hours, then from 70 F to 41 F within 4 more hours, 6 hours in total. The 2-hour clock starts when the food drops below 135 F. Sources: [Texas DSHS inspection form and quick reference](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/47-Item-Inspection-Report-2015.pdf) (228.75(d)(1)); [Maryland Dept. of Health chart](https://health.maryland.gov/qahealth/environmental-health/Documents/Food%20Temperature%20Chart.pdf); [Sacramento County summary of CalCode 114002](https://emd.saccounty.gov/EH/FoodProtect-RetailFood/Documents/ReasonableCareCARetailFood.pdf) (all search summaries).
- TCS food made from room-temperature ingredients (for example reconstituted or canned items, or chopped tomatoes) must reach 41 F within 4 hours ([Long Beach bulletin](https://www.longbeach.gov/globalassets/health/media-library/documents/services/directory/food-safety-and-inspections/food-safety-information-bulletins/cooling-and-reheating-food); [Texas city document](https://docs.cityofbrenham.org/Departments/development/compliance/TEXAS__FOOD__ESTABLISHMENT__RULES.pdf)). One search summary noted that some California SOPs also list a separate 4-hour window for 70 F to 41 F; the two descriptions are consistent with each other if read as stage 2 versus the ambient rule, but I flag it as unresolved.
- San Diego County treats a missed 6-hour cooling as a major violation ([San Diego County DEH](https://www.sandiegocounty.gov/deh/fhd/ffis/violations/major9.html), search summary).
- I found no official source approving a smoked brisket "holding in an insulated box for hours" as a substitute for cooling or hot holding. BBQ forum posts describe doing it (for example [BBQ Brethren](https://www.bbq-brethren.com/threads/holding-brisket-in-cambro-for-extended-time.107052/page-2)); those are anecdotes, not rules. Some jurisdictions have specific guidance for it; ask the local department.

### 1.7 Reheating, Code 3-403.11

- Leftover TCS food that is reheated for hot holding must reach 165 F for 15 seconds, and must pass through the 41 F to 165 F range within 2 hours. Commercially processed ready-to-eat food from an inspected plant only needs to reach 135 F. Source: [Delaware's adopted 3-403.11](https://www.law.cornell.edu/regulations/delaware/16-Del-Admin-Code-SS-3-403.11); [Minnesota 4626.0360](https://www.revisor.mn.gov/rules/4626.0360/version/2019-01-02T09:58:27-06:00); [Douglas County CO](https://www.douglas.co.us/wp-content/uploads/2023/09/07.17.23_Reheating_DCHD.pdf) (search summaries).
- Douglas County lists steam tables and chafing dishes as not approved for reheating ([Douglas County](https://www.douglas.co.us/wp-content/uploads/2023/09/07.17.23_Reheating_DCHD.pdf), search summary). I did not find a source that addresses a hot holding cabinet used for reheating; the safe assumption is that it is also not for reheating. Not verified.
- The old rule "reheat once only" is not something I found in the Code text. Do not present "once per batch" in the app as a legal limit; it is a business rule.

### 1.8 How the foods in the question fall out

| Food | What applies (model code, per sources above) | Notes |
|---|---|---|
| Brisket, pulled pork, ribs held hot in a cabinet | Keep at 135 F or above (3-501.16); no code time limit while it stays hot; check temperatures; if it drops, 165 F reheat only if last good reading is within 2 hours | Quality limit (dryness) is the owner's call, not a code limit. If cooled for later: 135 to 70 F in 2 h, to 41 F in 4 more h; then date mark if held over 24 h cold; reheat to 165 F |
| House-made potato salad, egg salad, mayo-based slaw | Cold hold 41 F or below; date mark if held over 24 h, 7 days max, day made = day 1; out-of-fridge time is governed by TPHC if the place uses it | Exact rule for each dish is up to the local regulator |
| Banana pudding, custards, whipped dairy desserts | Cold hold at 41 F; whether TCS is for the regulator to say; if TCS, same date marking | I found no source on banana pudding. Ask the health department |
| Commercially made deli salads | Often exempt from the 7-day mark while in the original package; manufacturer date governs | Once opened, many jurisdictions start the 7 days at opening |
| Sauces, beans, cooked rice | Same as cooked meat (hot hold or cooled with the 2/4 steps) | Listed as typical TCS foods in handouts |

## Part 2. Where states and counties differ (examples)

I give four, as asked. All are search summaries.

- **California.** The California Retail Food Code (not the FDA text) sets hold at 135 F hot and 41 F cold, with TPHC in section 114000 described in county handouts as the 4-hour rule with written procedures, and cooling in 114002 as 135 F to 70 F in 2 h and to 41 F within 6 h in total ([Sacramento County](https://emd.saccounty.gov/EMDForms/Documents/TIME%20AS%20A%20PUBLIC%20HEALTH%20CONTROL%205-16-13.pdf); [Contra Costa](https://cchealth.org/home/showpublisheddocument/30257/638593197072470000); [Orange County](https://www.ochealthinfo.com/sites/hca/files/2022-04/TPHC%204.7.22.pdf)). Counties also publish their own logs and SOP templates.
- **Texas.** Texas Food Establishment Rules, 25 TAC chapter 228. Hot hold 228.75(f)(1)(A), cold hold 228.75(f)(1)(B) (41 F, 45 F for some items), cooling 228.75(d)(1), date marking cited as 228.75(g)(1) in a city inspection report, TPHC at 228.75(i) with a 4-hour mark ([Texas DSHS](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/Time-as-a-Public-Health-Control.pdf); [DSHS quick reference](https://www.dshs.texas.gov/sites/default/files/foodestablishments/pdf/GuidanceDocs/Reg-Code-Quick-Reference_47Item_Version1_0---August-2021-FINAL.pdf)). I could not confirm the 7-day maximum in Texas text; the search tool could not verify it.
- **New York.** State sanitary code Subpart 14-1, section 14-1.40: 45 F or below, or 140 F or above, "at all times" except preparation and a limited period while held for service not to exceed 2 hours ([Justia copy of 10 NYCRR 14-1.40, current to Sept 2024](https://regulations.justia.com/states/new-york/title-10/chapter-i/part-14/subpart-14-1/food-protection/section-14-1-40)). New York City uses its own health code: 41 F cold, 140 F hot, with smoked fish at 38 F ([NYC DOHMH study guide](https://www.nyc.gov/assets/doh/downloads/pdf/rii/study-guide.pdf), search summary). So two New York places can have different numbers, and neither uses 135 F.
- **Florida.** Florida adopts the FDA Food Code by reference in rule 61C-1.001, currently the 2017 edition ([FL Rules gateway](https://flrules.org/gateway/ruleno.asp?id=61C-1.001)). I did not retrieve Florida-specific temperature text; the numbers come from the 2017 model Code, which I also could not read directly.

Important difference for the app: 135 F hot hold is the model code and California and Texas; New York State requires 140 F. If the app's hot-hold floor can never be set below 135 F that is fine for those places, but a New York kitchen needs a higher figure. The app lets the owner raise it (bounds 135 to 200 per docs/audit/safety-defaults.md), so that works, provided the wording tells them to.

### How an owner finds the local rule

1. Search "[county name] environmental health food establishment" and look for the retail food code, plain-language handouts on cooling, date marking and "time as a public health control".
2. Ask the inspector which Code edition is enforced and whether the 6-hour TPHC option or reheating in hot holding equipment is permitted.
3. Ask for the written TPHC and cooling log templates; many counties publish them (for example the [Alameda County cooling log](https://deh.acgov.org:443/operations-assets/docs/foodsafety/CoolingLog.pdf)).
4. FDA publishes a state-by-state list of which Food Code each agency adopted ([FDA adoption page](https://www.fda.gov/food/fda-food-code/adoption-fda-food-code-state-and-territorial-agencies-responsible-oversight-restaurants-and-retail)).

## Part 3. What this means for the app (recommendations)

This is design advice from the research, not a legal opinion.

### 3.1 Model a cook-ahead item with separate limits

1. **Two kinds of clock, never one.** Cold items need (a) days in the fridge (date mark; the model max is 7 days with day made counted as day 1) and (b) hours out of the fridge (only if the owner has a written TPHC procedure, 4 or 6 hours in the model code). Today's data model has one "longest hold" in hours. A potato salad that sits 5 days in the walk-in and 2 hours on the line needs both numbers. Treat "fridge days" as a date-based expiry (the label date), not a rolling hour count.
2. **Hot-held items: temperature is the safety limit, not time.** There is no model-code hour limit while the food stays at 135 F or above. So for brisket and pulled pork keep two separate things: a temperature floor (safety) and an optional quality limit in hours (owner's choice, labeled as quality). This is close to what the app does with `holdBasis: 'quality'`. The audit doc's 8-hour quality limit for brisket is a placeholder and no source supports 8 hours; say "your quality limit".
3. **Slaw, potato salad, banana pudding stay on the safety basis.** The audit already concluded this; the research agrees: they are house-made, commonly mayo, egg or dairy based, and date-marking and cold-hold rules apply. Do not offer "taste it, keep serving" for cold-held items past their limit.
4. **Temperature log.** Log each reading with time, person, item, and what was done (kept, reheated, discarded). The Code text I saw does not mandate a log for ordinary hot holding, but TPHC at 6 hours needs a record of monitoring to show food stayed under 70 F, and inspectors and HACCP plans commonly expect logs. Keep the log exportable for the inspector.
5. **Cooling is its own flow.** Two checkpoints, not one: 135 to 70 F within 2 hours from when it drops under 135 F, then 41 F by the 6th hour in total. If the first checkpoint is missed the food is discarded, or (in some local procedures) reheated to 165 F and cooling restarted (the Alameda County cooling log describes this; that is a county procedure, so label it as local). The app's "Start cooling" button should start both countdowns.
6. **Reheat.** Offer reheating to 165 F with a 2-hour window to get there from storage; do not call the reheat count a legal limit. If the "once per batch" limit stays, call it "our rule" not "the law".
7. **Cabinet is for holding.** Do not suggest that the cabinet reheats food. Warn "reheat on the stove or in an oven first, then hold".
8. **Per-state/county profile.** Let the owner set: hot-hold floor, cold-hold max, TPHC allowed (none / 4 h / 6 h), cooling windows. Start with the model-code numbers, prefilled but labeled "model code; check your county".

### 3.2 What the app must never claim

- That it is compliant, approved, certified, or "HACCP compliant"; that it replaces a written plan or a health department inspection.
- That any particular food is or is not TCS (banana pudding, slaw).
- That a time limit shown is "the legal limit" unless the owner typed it in. Show it as "your limit".
- That food past its limit is safe because it "looks fine" or the owner tasted it (for safety-basis items).
- That a reading entered by a person was measured correctly.
- Any specific state rule inside the app text, since editions and local amendments vary.

### 3.3 Wording that is safe

- "Set the limit your local health department gives you."
- "Starting values follow the FDA model Food Code. Your county may use different numbers. Check with your health department."
- "Smokebox helps you remember and keep a record. It does not make food safe and is not a health inspection."
- "Quality limit: when the food starts to taste worse. Safety limit: when it must be thrown out."
- For cold items: "Made [date]. Use by [date]." and let the owner set the number of days; default text "Check your local rule. The FDA model code uses 7 days counting the day made."

## Open questions nobody could resolve here

1. Exact starting temperature for the 4-hour TPHC option in the 2022 model text (cold only versus hot or cold).
2. Whether the Code text states any limit on reheat count, and whether a hot holding cabinet is allowed to reheat (I found none, but could not read the Code).
3. Texas and Florida date-marking maximum days and which Code edition text each enforces today.
4. Whether coleslaw, banana pudding and similar desserts are TCS in a given county.
5. Whether any county requires a written temperature log for ordinary hot holding.
