# How established kitchen display systems work, and what small kitchens complain about

Date: 2026-10-23. Author: domain advisor (research pass, round 12).

## Limits of this research (read first)

- The sandbox blocked direct page fetches. I worked from web-search summaries of the linked pages, not from reading the pages. Treat each cited fact as "a search summary says"; someone should open the link before building on a fine detail.
- Reddit (r/restaurateur, r/KitchenConfidential) cannot be searched by this tool: the search API refused reddit.com. So I have no Reddit evidence at all and I do not claim any. The complaint themes below come from Capterra and Software Advice listings, Square's community forum and vendor material. Those are self-selected and some reviews are incentivized (the Software Advice summary says so).
- I did not find Lightspeed, TouchBistro or Clover pages on ticket states, recall or timers beyond marketing pages. Gaps are marked.

## 1. How the established systems behave

### 1.1 Ticket states, bump and recall

- **Toast.** Bumping marks an order fulfilled and clears it, using a bump bar or touchscreen ([Toast blog](https://pos.toasttab.com/blog/restaurant-kitchen-display-system)). A Recall button reopens the last fulfilled ticket and can be pressed again for more; recalled tickets show RECALLED in red ([Toast kitchen configuration](https://support.toasttab.com/en/article/Basic-Kitchen-Configuration?lang=en_US)). Tickets show in the order fired, oldest on the left ([Toast KDS overview](https://support.toasttab.com/en/article/Get-Started-With-the-Kitchen-Display-System)).
- **Square.** Each prep or expo device can complete and recall tickets either on all devices at the location or only on that device. With all-device completion, a ticket completed at a prep station clears at other prep stations but not at expo. Expo recall can apply to all devices or prep only. The grill/vegetable example in Square's own article shows why per-station completion exists ([Square help, article 8171](https://squareup.com/help/us/en/article/8171)).
- **Epson TrueOrder.** An order recall screen shows recently bumped orders that can be brought back ([Epson manual, order recall](https://files.support.epson.com/pdf/pos/kds/111-56-qum-017_r3.36_trueorder_kds_order_recall-quick_user_manual.pdf)). "Independent Displays" mode treats the same item sent to two stations as two separate lines, so bumping at station 1 does not cross it out at station 2 ([Epson manual](https://files.support.epson.com/pdf/pos/kds/111-56-qum-025_r3.36_trueorder_kds_independent_displays-quick_user_manual.pdf)).
- **TouchBistro.** Staff can strike through single items and modifiers; past orders can be viewed and recalled any time ([TouchBistro](https://www.touchbistro.com/?p=6151), via search summary).
- **Loyverse KDS** (free iPad app with sound alerts, reopening completed orders): [App Store listing](https://apps.apple.com/app/id1218352383).
- A Bank of America POS guide says a ticket bumped by an expeditor cannot be retrieved ([BoA merchant help](https://merchanthelp.bankofamerica.com/Kitchen-Display-Order-Management)). That is one vendor; it shows that "no recall after expo" exists in the market.

### 1.2 Station routing and expo

- Toast: each device is set as a prep station or an expediter; the setting controls which tickets show ([Toast kitchen configuration](https://support.toasttab.com/en/article/Basic-Kitchen-Configuration?lang=en_US)). A Toast community post reports tickets jumping to the front on expo after a prep station bumps ([Toast community](https://community.toasttab.com/t5/restaurant-operations/kds-tickets-moving-to-the-front-on-expo-kds-after-a-prep-station/m-p/14399), title only).
- Epson: two routing methods, KDS menu routing and POS menu routing ([Epson manual](https://files.support.epson.com/pdf/pos/kds/111-56-qum-025_r3.40_trueorder_kds_independent_displays-quick_user_manual.pdf)). Epson positions it for quick-service and small restaurants under 10 stations and says it runs on the local network without cloud ([Epson blog](https://blog.epson.com/why-trueorder-kds-is-the-smart-choice-for-quick-service-restaurants/)).
- Clover: expo mode, item-level routing, prep-time reporting, color-coded order status, runner tickets ([Clover KDS page](https://www.clover.com/Kitchen-display-system), search summary).
- Lightspeed: show each station only orders by order type, register or product; held orders go to their own view ([Lightspeed](https://www.lightspeedhq.com/au/pos/restaurant/kds/)). I found nothing on Lightspeed expo behavior.

### 1.3 All-day counts

- Toast has an "All Day View": a button on the KDS switches to a total for each unique menu item with a fired item, optionally grouped with modifiers ([Toast, KDS All Day View](https://support.toasttab.com/article/KDS-All-Day-1493055871075)). A separate "Production Item Count" shows ingredient-level totals (10 burger patties, not 5 double cheeseburgers) in a bar at the bottom ([Toast, Production Item Count](https://support.toasttab.com/en/article/Production-Item-Count)).
- Lightspeed K Series has a "Production Mode" for quick service that collates identical items into one ticket, versus "Ticket Mode" that groups by order ([Lightspeed K Series](https://www.lightspeedhq.co.uk/pos/restaurant/k-series-kitchen-display-system)).
- A third-party Shopify KDS describes all-day counts as a way to batch prep ([ECOSIRE](https://ecosire.com/de/apps/shopify/shopify-pos-kds)); a vendor page, weak source.

### 1.4 Timers and color escalation

- Toast shows a stopwatch ticket time (since sent) and a fire time (since fired to the kitchen), on each ticket ([Toast, interpreting ticket times](https://doc.toasttab.com/doc/platformguide/adminInterpretingTicketTimes.html)). I did not find Toast's color thresholds.
- Square has yellow and red timers set per device in the Dashboard under Timers and Alerts, or in the KDS app settings ([Square help, article 7944](https://squareup.com/help/us/en/article/7944)).
- GoTab: gray = new, yellow = near prep time, red = overdue; count-up or countdown modes ([GoTab KDS ticket timer](https://docs.gotab.io/operator/kds-printers-additional-display-setup/kds-ticket-timer/)). Fleksa defaults about 10 minutes yellow and 15 red ([Fleksa](https://fleksa.com/docs/restaurant-pos/kitchen-display/6-8-notifications)). So three stages (fresh, warning, late) with owner-set thresholds is the common pattern.

### 1.5 Counter service versus table service

- Lightspeed: "Ticket Mode" (full service, items grouped by order) versus "Production Mode" (quick service, identical items collated) ([Lightspeed K Series](https://www.lightspeedhq.co.uk/pos/restaurant/k-series-kitchen-display-system)).
- Toast: course pacing and firing courses decide when items reach the KDS; fire times only show in some pacing settings ([Toast, interpreting ticket times](https://doc.toasttab.com/doc/platformguide/adminInterpretingTicketTimes.html)).
- TouchBistro: order types can show on one screen or on dedicated screens for each type ([TouchBistro](https://www.touchbistro.com/?p=6151)).

### 1.6 Sound alerts

- TouchBistro: optional loud audible alert for new orders. Loyverse KDS: sound alerts. Club Essential line station: audible alert setting. Fleksa: different sounds per order type and quiet hours ([Fleksa](https://fleksa.com/docs/restaurant-pos/kitchen-display/6-8-notifications)). Clover hardware lists 85 dB speakers ([Clover KDS page](https://clover.com/kitchen-display-system)). All search summaries. I found no complaints data about sound.

### 1.7 Offline behavior

- **Toast** is the clear example. After about 40 seconds with no connection a yellow Offline Mode banner shows; new in-store tickets keep reaching the KDS if a wired local hub device exists and the router allows UPnP multicast. Online orders do not arrive. If the local network itself fails, on-premise orders are not passed between devices ([Toast, Use Toast in Offline Mode](https://support.toasttab.com/en/article/Offline-Mode-Using-Toast-During-a-Local-Network-Outage); [Toast, KDS devices offline](https://doc.toasttab.com/doc/platformguide/platformOfflineKDSDevices.html)). So even the best-known system has setup requirements for offline KDS.
- **Square.** I could not confirm that KDS offline mode has shipped. A Square community moderator said Square was building one "so POS orders reach your KDS, even during an internet or Square outage"; many users posted in that thread ([Square community, KDS Offline Mode](https://community.squareup.com/t5/Feedback-Discussions/KDS-Offline-Mode/td-p/709200)). A Capterra/Software Advice reviewer says if the internet goes down you lose the tickets ([Capterra, Square for Restaurants reviews](https://www.capterra.com/p/175628/Square-Point-of-Sale/reviews/), search summary).
- **Epson TrueOrder** runs entirely on the local network ([Epson blog](https://blog.epson.com/why-trueorder-kds-is-the-smart-choice-for-quick-service-restaurants/)). **Fresh KDS** via a Lightspeed page "works even if your internet goes down" ([Lightspeed Fresh KDS](https://www.lightspeedhq.com.au/integrations/fresh), search summary). **TouchBistro** is credited with offline mode in a third-party comparison only. **Clover**: nothing found; one community post says KDS orders from a kiosk stopped showing after an update ([Clover community](https://community.clover.com/questions/47555/clover-kds-issue-orders-are-not-showing-anymore.html), title only).

### 1.8 Menu and pricing import

Covered in `pos-export-formats.md`. In short: most vendors let you upload item CSVs to their own system; very few KDS products take a menu in from someone else's POS export.

### 1.9 Cheap and free options

- Loyverse KDS (free, needs Loyverse POS), Fresh KDS (free iPad app, up to 10 screens per its listing, works with Lightspeed and others), SimpleKDS (Android, for Clover), Kanpla KDS, RestaurantOS KDS, Blueplate KDS, eHopper (free only for OmniChannel customers) ([search result list](https://ehopper.com/free-kitchen-display-system/); [Fresh KDS App Store](https://apps.apple.com/us/app/fresh-kds-1-kitchen-display/id1399974398)). None of these results was open source. Odoo has third-party KDS modules (one listed at $4.94; [Odoo apps](https://apps.odoo.com/apps/modules/19.0/pos_kitchen_screen_odoo_fdc)); Odoo Community is open source but I did not verify that module is.
- Prices: Square KDS $50 per month per device on the basic tier (Software Advice listing; unverified), unlimited Square KDS at no cost on Square for Restaurants Plus per Square's US pricing page ([Square pricing](https://square.com/us/en/point-of-sale/restaurants/pricing)). Clover quoted $799 to $899 hardware plus $25 per month per device ([Clover](https://clover.com/kitchen-display-system)), $949 at a reseller. Lightspeed $69 to $399+ per month and TouchBistro $88+ per month, third-party comparison only. A cost guide puts a basic tablet KDS at $150 to $600 per station and monthly software at $20 to $100 or more ([Menusifu](https://www.menusifu.com/blog/kitchen-display-system-price), vendor).

## 2. What small kitchens complain about (themes with links)

Evidence quality: low to medium. Reviews are about whole POS products, many are old, some incentivized.

1. **Internet dependence and lost tickets.** Square's cloud KDS: tickets lost and printers not printing when the internet is down ([Capterra](https://www.capterra.com/p/175628/Square-Point-of-Sale/reviews/); [Square community thread](https://community.squareup.com/t5/Feedback-Discussions/KDS-Offline-Mode/td-p/709200)). Toast: handhelds depend on strong Wi-Fi; lag or outage causes trouble ([Capterra, Toast](https://www.capterra.com/p/136301/Toast-POS/reviews/)).
2. **Glitches and downtime during service.** Toast reviewers report bugs and downtime at dinner and a KDS "not working as expected" with poor support ([Capterra, Toast vs SpotOn](https://www.capterra.com/compare/136301-197473/Toast-POS-vs-SpotOn-Restaurant)). Square reviewers report crashes and random printer disconnects.
3. **Updates breaking setups.** Square reviewers say updates disrupt printer profiles; Clover community post on orders vanishing after updates (links above).
4. **Duplicate tickets.** Double and triple printing reported for Square (Capterra, above).
5. **Cost of add-ons and per-screen pricing.** Toast reviewers say every module, including KDS, is an extra charge ([Software Advice, Toast](https://www.softwareadvice.com/retail/toast-pos-profile/reviews/)); a Toast reviewer reports unwanted extra KDS screens added to a bill; a maker of a low-cost KDS for Square says a second screen makes the price jump (Menusifu/Merchant Maverick search results above).
6. **Per-item alerts instead of per-order.** A Capterra reviewer says the kitchen display sends a separate alert for each item of a five-item order, not one when the whole order is finished ([Capterra, Toast vs Genius](https://www.capterra.com/compare/136301-195074/Toast-POS-vs-Genius-for-Restaurants)).
7. **Switching between tickets and to-go orders, editing items on an entered ticket.** Square reviewer (Capterra, above).
8. **KDS as an expensive ticket printer.** Epson's own blog says many purchases end up as that because operators only know how to use it that way ([Epson blog](https://blog.epson.com/five-must-have-features-to-look-for-in-a-kds/)).
9. **Support.** The most frequent complaint about Toast across reviews (Capterra, Software Advice above).
10. **Positives to keep in mind:** ease of use and fast training for Square; one location subscription covering all screens ([ZoftwareHub summary](https://zoftwarehub.com/en-bh/products/square-for-restaurants/reviews)).

I found nothing, from any source, on accidental bumps, small text, greasy hands, or line-cook adoption. Absence of evidence here is only a limit of the tool.

## 3. The 10 things a cheap, no-tech-needed KDS must get right

(My synthesis from the evidence above plus Smokebox's own docs: SPEC.md, docs/screen-roles.md, docs/bump-bar-keys.md. Items are ordered by how much the research supports them.)

1. **Never lose a ticket when the network drops.** Offline is the top complaint theme, and even Toast needs a hub and router settings. Smokebox: it runs from one file and keeps data on the device, so a single tablet is offline by nature. Likely difference: strength. Open risk: multi-device sync is "Connected", after the gate, so with two tablets the tickets do not cross the room without a network. Say so plainly in setup.
2. **Bump must be hard to do by accident and easy to undo.** Every vendor ships recall (Toast reopens last ticket; Epson recall screen; TouchBistro recall any time). Smokebox: bump asks if dishes are not done, 10-second undo with Z, L brings back the last bumped ticket. This looks ahead of the field. Check: can a non-keyboard user find recall on a touchscreen without the R key?
3. **Zero-setup station routing.** Routing by station is standard everywhere, but the setup is a menu-configuration job (Toast, Epson). A small place with 1 to 3 cooks needs routing to work from the menu import with sensible defaults. Smokebox routes each item to the zone on its menu line; it depends on importer mapping to a zone (see `pos-export-formats.md`: POS exports have no "station" column, so the import cannot fill it).
4. **Whole-ticket view for the person calling the pass (expo) without a second screen.** Square and Toast separate expo from prep, with a second device. Smokebox treats expo as a view; good for one tablet. Check that completion on one station does not hide the item from the other station by mistake (Square's "complete on all devices" versus "this device only" shows how often this bites).
5. **All-day counts that the cook can read at arm's length.** Toast offers both item-level and ingredient-level counts. Smokebox has item-level all-day per station. Gap: no ingredient-level production count in my reading of the docs (not verified in code). Worth considering for the BBQ case (pounds of brisket, not "3 plates").
6. **Timers with three states that never rely on color alone.** Fresh, warning, late, with owner-set thresholds, is the common pattern (GoTab, Square, Fleksa). Smokebox spec: word + icon + color, OK/WARN/OVERDUE. Ahead of most vendors on accessibility; defaults need to come from the menu's prep times, not a global number.
7. **Sound that is useful and can be silenced.** New-order chime, per-device volume, quiet hours (Fleksa). Smokebox: sound from the tablet, one tab leads, warnings only while the screen is on and the page is open. The risk is a sleeping tablet; the SOP says so. Offer a "keep screen awake" check at setup.
8. **Count-per-order, not per-item, alerts.** The Toast complaint above: one notification per order when the whole order is done.
9. **Flat, low price and no per-screen penalty.** Complaints about add-on pricing and per-screen fees are a theme. Smokebox is offline and local; the pricing story is in docs/commercial-decisions.md (not reviewed here).
10. **Import the menu you already have without a data job.** Covered in `pos-export-formats.md`. Nobody in my sources praises a competitor's import; I found no evidence either way, so this is a hypothesis, not a finding.

### Where Smokebox likely differs from the market

- It is a hold/pit manager as much as a KDS (screen-roles.md says the lead product is a pit and hold manager beside someone else's POS). Established KDS products do not track batches, temperatures or deadlines for food safety. That is differentiated, and it is also where the claim risk is (see `food-holding-rules.md`).
- Single-device, local-first by design; competitors are cloud-first and sell offline as a rescue mode.
- The built-in 10-second undo, instrumentation of user errors, and critical-path analytics in the office (SPEC.md section 7.9 and the metrics section) have no equivalent I could find in vendor help pages.
- Missing versus the market: second-screen sync before the gate; printed runner or expo tickets; ingredient-level production counts; per-order "all done" notification to front of house; online-order or delivery-app intake (Toast's offline note and Lightspeed's delivery management show that is a big part of the market). Items are gaps only if the target kitchen needs them; I have not verified which they are.

## 4. Could not verify

- Anything from Reddit; any Capterra or G2 review text first-hand (only search summaries).
- Square KDS offline mode launch status in 2026.
- Clover, TouchBistro and Lightspeed offline behavior, timers, and expo behavior.
- Real pricing for Fresh KDS; Epson TrueOrder pricing.
- Toast's color thresholds.
