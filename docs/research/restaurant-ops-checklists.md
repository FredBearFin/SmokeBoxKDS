# Opening, service and closing routines, and the paperwork behind them

Date: 2026-10-23. Author: domain advisor (research pass, round 12).
Not legal advice. Not a statement that following this makes any kitchen compliant.

## Limits of this research

- The sandbox blocked page fetches; I used web-search summaries. I looked for health department and extension-service sources. What came back was mostly health department logs (good), vendor checklist templates (weaker) and exam-prep sites (weakest). I found no university extension page. Each claim names its source type.
- Numbers for sanitizer strength differ by product label and by state. I give only what a regulator page said.

## 1. What small kitchens actually do (routines)

### 1.1 Opening

Sources agree on a short list. Evidence is mostly checklists, not rules.

- Handwashing sink works, has hot water, soap and towels, and is not blocked. A NACCHO/CIFOR sample form asks for hot water of at least 100 F at the hand sink and treats a blocked sink as unacceptable ([CIFOR/NACCHO sample checklist](https://cifor.naccho.org/uploads/resources/Tool-11-Sample-Food-Establishment-Food-Safety-Checklist-Form.pdf), search summary). A vendor checklist calls a blocked or cold hand sink a critical violation in most places ([Manifestly food safety checklist](https://app.manifest.ly/public/checklists/32b33a8f4136968506603f96b391d8cc), vendor).
- Check and record cold storage: coolers at 41 F or below, freezers at 0 F or below (the 0 F figure is from a vendor checklist, not the Food Code; [Taqtics checklist library](https://taqtics.co/wp-content/uploads/checklist-library/restaurant-checklist-library.pdf)). One checklist says log the walk-in twice daily as a minimum.
- Thermometers: check accuracy in a 50/50 ice-water bath, reading 32 F plus or minus 2 F (CIFOR/NACCHO sample above); one vendor says do it at the start of every shift.
- Sanitizer: mix, then test with a strip for the product in use, and write the reading down ([Orange County CA daily checklist](https://www.ochealthinfo.com/sites/hca/files/import/data/files/documents-dailyinspectionchecklist.pdf) asks that test strips be available for each sanitizer in use; the log point is from vendors).
- Employee health check: any worker with vomiting, diarrhea, jaundice, sore throat with fever, or a reportable diagnosis is reported to the person in charge. Vendor list: symptom-free 24 hours before return for vomiting or diarrhea; health department clearance for jaundice or Hepatitis A exposure ([Manifestly](https://app.manifest.ly/public/checklists/32b33a8f4136968506603f96b391d8cc), vendor). The 2022 Food Code lists six reportable organisms, adding non-typhoidal Salmonella ([FDA summary of 2022 changes](https://www.fda.gov/food/fda-food-code/summary-changes-2022-fda-food-code), search summary). I found no source requiring a written illness log.
- Date-marked food from yesterday: discard what has passed its day (see `food-holding-rules.md`).

### 1.2 During service

- Probe temperature of hot and cold held food. Guidance (not code, as far as I found): every 2 hours ([ICN fact sheet](https://theicn.org/resources/521/food-safety-fact-sheets/107118/holding-hot-foods.pdf)); hot-hold equipment at least twice per shift ([Island County WA](https://www.islandcountywa.gov/DocumentCenter/View/4174)).
- Re-test sanitizer in the wiping bucket and the dish machine or sink as it gets dirty (vendor guidance, [Xenia sanitizer log](https://www.xenia.team/food-safety/sanitizer-concentration-log), vendor page).
- Wash hands at the times the Code names (after handling raw food, after touching face, after the restroom, and so on). The Code also added handling money (a new paragraph 2-301.14(I)) and tobacco products in the 2022 edition ([FDA summary](https://www.fda.gov/food/fda-food-code/summary-changes-2022-fda-food-code), search summary).
- Cool leftover cooked food in steps (135 to 70 F in 2 h, to 41 F within 6 h in total) and log it. Counties publish a cooling log with columns for date, food, time and temperature at each checkpoint, corrective action, employee initials and a manager's verify initials ([Fairfax County cooling log](https://www.fairfaxcounty.gov/health/sites/health/files/Assets/Documents/PDF/forms/Cooling-Log.pdf); [Lincoln NE](https://www.lincoln.ne.gov/files/sharedassets/public/v/2/health-dept/food-safety/infusecoolinglog.pdf); [Bethlehem PA](https://www.bethlehem-pa.gov/getattachment/Health-Bureau/Environmental/FOOD-ESTABLISHMENT-INSPECTIONS/Food-Safety-Tools-For-Success/BHB-Log-Cooling.pdf.aspx?lang=en-US); [Alameda County CA](https://deh.acgov.org:443/operations-assets/docs/foodsafety/CoolingLog.pdf)). All search summaries.
- Corrective actions on those logs: Fairfax's key is R = reheat to 165 F, D = discard. Policies on a missed first checkpoint differ: North Dakota says reheat once to 165 F and start cooling again; Washoe County NV limits reheating to one time; Alameda says reheat and restart if 70 F was missed, discard if the 6-hour limit is missed ([North Dakota guidance](https://www.hhs.nd.gov/sites/default/files/documents/DOH%20Legacy/FL/F%26L%20Retail%20Guidance/cooling-methods-exception.pdf)). So "reheat once" is a local procedure that several departments use, not something I could show in the model code.
- Discards: write the food, the date and the reason (vendor guidance: [Taqtics](https://taqtics.co/wp-content/uploads/checklist-library/restaurant-checklist-library.pdf)).

### 1.3 Closing

- Date-mark and label what stays (food held more than 24 hours gets a date; 7 days maximum in the model code).
- Cool anything cooked that is going into the walk-in, using the cooling steps, and log it.
- Discard what is past its limit; record discards with the reason.
- Clean and sanitize food-contact surfaces and equipment; the model Code sets a 4-hour interval for surfaces in continuous use (the app already uses that, cited in `10-config.js` as 4-602.11; I did not verify the section number).
- Take final cooler and freezer readings; leave a note if a unit is out of range.
- Empty and sanitize the dish and wiping systems; restock hand sink supplies.
- Record anything unusual (equipment failure, power outage, product thrown out because of it).

## 2. Typical paperwork

| Record | Typical content | Source and strength |
|---|---|---|
| Cold and hot holding temperature log | Date, unit or food, time, reading, initials, corrective action | Health department and vendor templates; not a code requirement in what I found for ordinary holding |
| Cooling log | Food, start time and temperature, 70 F checkpoint, 41 F checkpoint, corrective action, employee initials, manager verify | County templates listed in 1.2 (health department, good) |
| Sanitizer test log | Date, time, which sink or bucket, product, test strip result in ppm, who | Vendors; the Code requires the concentration to be determined with a test kit, quoted via a vendor page (the 4-501.116 point is not verified from the Code) |
| Thermometer calibration log | Date, thermometer, ice-bath reading, who | CIFOR/NACCHO sample (good) |
| Discard or waste log | Date, food, quantity, reason, who | Vendor guidance |
| TPHC discard-time marks and written procedure | Written procedure on site; time marks on containers; for the 6-hour option a record of temperature monitoring | Health department pages (see `food-holding-rules.md`) |
| Date labels on prepared food | Food name, day prepared, discard date | Health department date-marking handouts |
| Employee illness reports | Not found as a required log | Unverified |
| Shellstock tags | Kept 90 days after the last shellstock from the container is used | Exam-prep site; only specific period I found ([open-exam-prep records](https://open-exam-prep.com/study-guides/cfpm/regulatory-training/records-compliance)); weak |

**How long to keep records.** There is no single number. One exam-prep page warns against assuming a universal two-year rule and says to follow the Code where explicit and the local regulator otherwise ([open-exam-prep](https://open-exam-prep.com/study-guides/cfpm/regulatory-training/records-compliance)). A Toast blog says "30 days to one year depending on local rules" ([Toast](https://pos.toasttab.com/blog/on-the-line/temperature-log-sheet), vendor). A claim that California requires 90 days came from a document of unknown origin and I could not verify it. Conclusion: ask the county.

## 3. Sanitizer facts I could confirm

- Minnesota's version of the Code sets chlorine at a 50 ppm minimum unless the product label says otherwise and says to follow the EPA-registered label and never exceed its maximum ([Minnesota Rule 4626.0805](https://www.law.cornell.edu/regulations/minnesota/Minn-R-4626-0805), search summary).
- Washington's version ties chlorine's minimum water temperature to concentration and pH, and requires at least 75 F for quaternary ammonium solutions, following manufacturer labeling and water hardness limits ([WAC 246-215-04565](https://lawfilesext.leg.wa.gov/law/WAC/WAC%20246%20%20TITLE/WAC%20246%20-215%20%20CHAPTER/WAC%20246%20-215%20-04565.htm), search summary).
- A "200 to 400 ppm" quat range appeared only on vendor pages, and "50 to 100 ppm" chlorine on a vendor page. The "171 F for 30 seconds" hot-water figure for dishwashing could not be confirmed. The Code defers to the product label for chemicals, so the app should not show a ppm number as a rule.

## 4. Gaps between this and the app

What the app records now (read from `src/js/20-engine.js` SAFETY_EVENT and `src/js/89-office-inspector.js`): temperature readings, reheats, discards (reasons expired, quality, temperature, cooling, other), cooling started (weight only), sanitize rounds (with lateness), keep-serving past quality limit, and later corrections, each with who logged it. The printed record has columns When, What, Food, Detail, Logged by, Corrections. The safety log is kept 190 days. The Opening and Closing cards (`docs/sop/20-card-opening-checklist.md`, `21-card-closing-checklist.md`) are mainly about the tablet, orders and backup, plus three cook-ahead items.

| # | Gap | Evidence | Suggested response (for the owner of the feature) |
|---|---|---|---|
| 1 | **Cooling is recorded only as "started" with a weight.** The standard cooling log has the 70 F checkpoint time and temperature and the 41 F checkpoint, with corrective action and a verifier. The engine enforces the 2-hour and 6-hour gates, but the printed record cannot show the checkpoint readings. | County cooling logs (1.2) | Log each cooling reading as its own entry and print it as a cooling table (start, 70 F reading, 41 F reading, action R or D). |
| 2 | **No cooler, freezer or display-case temperature log.** Every checklist asks for these once or twice a day. The app logs batch temperatures only. | CIFOR/NACCHO sample; vendor checklists | Add a short "equipment temperatures" entry type, or say plainly on the printed record that it covers batches only and that the kitchen needs a separate cooler log. |
| 3 | **Sanitizer test strip reading is not recorded.** The app logs that surfaces were sanitized, not the ppm or the product. Vendors say the strip alone is not a record. | 1.1, section 3 | Optional ppm field and product name; do not display a target number except what the owner types in from the label. |
| 4 | **No thermometer check.** | CIFOR/NACCHO sample | Optional "thermometer checked in ice water" entry; opening card line. |
| 5 | **Discard log lacks free text or a reason for "other"**, and the printed record does not show the date prepared or the date marked. A discard that was a date-marking discard should say so. | Vendor discard logs; date-marking handouts | Reason "past date mark" in addition to "expired"; show made date. |
| 6 | **No date-marking record for cold items** (made date, use-by date). The app has an hours-based limit, not a calendar date. | Date-marking handouts | See `food-holding-rules.md` section 3.1. |
| 7 | **No handwashing sink or employee health check on the cards.** Opening card has tablet items, not kitchen items. | CIFOR/NACCHO sample; vendor lists | Add two lines (hand sink stocked and clear; anyone sick?) to the printed cards; no app logging needed. |
| 8 | **Opening and closing cards** lack: cooler and freezer readings, sanitizer buckets tested, thermometer, date labels, cooling in progress, equipment off/on. | 1.1 and 1.3 | Rewrite both cards using the lists above, keeping the cook-ahead lines conditional as today. |
| 9 | **Retention.** The app keeps 190 days and describes it in code comments as "just over six months, the minimum to keep". I found no source that sets a minimum, and requirements vary (30 days to a year in one vendor blog). | section 2 | Reword to "we keep 190 days; ask your health department how long you must keep records" and make the period configurable or exportable. |
| 10 | **The app's own comment that "the FDA minimum" check interval is 4 hours** (`10-config.js`, `tempCheckEveryMin`). I could not find this in any source. ICN suggests every 2 hours; Island County twice per shift. | 1.2 | Remove "FDA minimum" from comments and any help text unless someone confirms the Code text. |
| 11 | **The record says "Logged by" but not whether the person was trained** or who verified. Cooling logs have a manager verify column. | County cooling logs | Optional "verified by" on the daily printout. |
| 12 | **Printed record title.** It is already marked as not an inspection result, which fits the research. | Rules for this document set | Keep. |

### Print cards: suggested content (draft for the Guide owner)

Opening: hand sink works and stocked; thermometer checked in ice water (32 F plus or minus 2); cooler and freezer readings written down; sanitizer mixed and strip tested; anyone sick reported; yesterday's date-marked food checked; tablet ready (existing items).
Service: probe hot and cold food on your schedule; re-test sanitizer when the water is dirty; cooling logged at each checkpoint; discard and write the reason.
Closing: label and date what stays; cooling started and logged; discards logged; surfaces sanitized; final cooler readings; backup (existing items).

## 5. Could not verify

- Whether any state requires a written illness log, temperature log for ordinary hot holding, or sanitizer log (varies; not found).
- Official record-retention periods.
- Exact Code text for 4-501.116, 4-501.114, 4-602.11 and the 171 F hot-water sanitizing figure.
- Any extension-service source (none surfaced).
