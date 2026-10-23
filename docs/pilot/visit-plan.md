# Visit plan: one observed service

Goal: watch one real service at one barbecue restaurant, beside the restaurant's own system, and find out if the four gates in [exit-gates.md](exit-gates.md) pass. You are an observer, not a helper. Allow about 30 minutes before service and the whole service after.

Nothing here has been tried at a real restaurant. Times marked "target" are estimates, not measurements of a real owner.

## Before the visit (at home)

- Fix the monthly price and write it on the [observer sheet](observer-sheet.md) and the offer. If there is no price, there is no visit: gate 4 needs one.
- Build `dist/smokebox.html` (`node tools/build.mjs --quiet`) and put a copy on a USB drive and in an email to yourself. Download links are unreliable in a kitchen.
- Pack: a charger and battery pack, a small Bluetooth speaker, a printed observer sheet, a pen, a stopwatch or phone timer. The restaurant supplies the tablet if it can, so you test their real device.
- Ask the owner beforehand for: their menu as a file if they have one (a spreadsheet or point-of-sale export), the names and holding limits they use for brisket, pork, ribs and any cold sides, and the local health department's limits if they have them written down.
- Read the offer one-pager aloud once so you say it the same way every time.

## Setup in 15 minutes (target)

Do it with the owner watching, at the tablet.

1. Open the file and install it as an app (Share, Add to Home Screen, or Install app). Tap **Settings**, **Set up this tablet**, and work through its seven steps: sound test, screen kept on, protect data, install, where the tablet sits, your dishes, hold limits. The tablet must sit where the person at the cutting board can tap it without walking.
2. Dishes: if the owner has a menu file, use **Have a menu file? Import it** and check the preview. Otherwise tap **Add your first dish** and add the main dishes by hand. Settings, **Tax, hours and PIN**: set tax and opening hours. Skip the PIN unless the owner wants one; if they set one, they must write down the recovery code.
3. Cooked-ahead food: answer **Yes, I cook ahead**. Add each held item (brisket, pulled pork, ribs, beans, slaw) as hot or cold with the limit the owner gives you. Leave a box empty rather than guess: Smokebox then only shows the time. Use the limits the owner's health department gives them, and write on the sheet where each limit came from.
4. Play a test warning from where the pit cook stands, with the fans and fryer running. Tap **Back office**, then Menu and settings, then enter real cost per kg for each product, or the dollar numbers stay starter estimates.
5. Settings, **How you serve**: leave Counter service off for a kitchen that works from tickets.
6. Take a backup (Back office, Menu and settings, Data, **Download backup (JSON)**) and email it to the owner. This is the clean starting point.
7. Make one test batch and tap one Pull so the owner sees the loop, then tap **Undo** or discard it as a test and note that you did so.

Do not run the demo on their tablet. If you showed the demo, tap **Back to my kitchen** and check the Pilot report does not warn about demo data.

## During the service (observe only)

Stand where the cutter and the pit can both be seen. Do not point at the screen, explain it or coach. If something is wrong in a way that could cause a food-safety mistake, say aloud that the cook follows their own rules, and write it down.

Count independently of the app, on the observer sheet:

- **Cuts.** Make a mark each time a cook cuts or pulls meat for an order. Do not tell the cook your count. At the end, type your total into the Pilot report; the app compares its Pull taps with your number.
- **Discards.** Write each thing thrown out: time, what, about how much, the reason the cook gives, and whether you saw anyone log it in the app. Ask the owner about discards you did not see.
- **Warnings.** For every warning you see or hear: time, which batch, whether you heard it from the pit without looking at the screen, and what the cook did. Write "beeped for nothing" or "should have beeped" if a cook says so.
- **Looks.** Tally each time a cook looks at the screen strip.

## After the service (15 minutes)

1. Back office, Menu and settings, Data, the group "Spreadsheet files and the pilot report": choose "Since opening", type your cut count in **Cuts counted**, tap **Show report**, then **Download CSV**. Keep the file and a photo of the screen.
2. Ask, and write the exact words: "What did you throw out last week, and what did it cost?" then "What would you pay for this each month?" Do not suggest numbers.
3. Fill the gate result table on the sheet, using [exit-gates.md](exit-gates.md).
4. Take a backup. Then **Erase tickets and records** (it keeps their settings) so their next day starts clean, or leave it if the owner wants to carry on.
5. Leave the observer sheet and offer, and say when you will follow up.

## What to say

- "This is a helper for the pit. It is not a food-safety system, not your register, and it never charges a card. Your own rules and your own system stay in charge."
- "I will not help during service. I am here to see what works and what does not."
- "It works without internet and keeps its data on this one tablet. I made a backup and emailed it to you."
- If asked about two tablets: "Not yet. Today it is one tablet."
- If asked about price: say the number you wrote down, then stop talking.
- Never say it makes the kitchen safe, compliant or inspection-ready.

## Do not

- Promise features that are not built (two-tablet sync, card payments, a register, delivery-app links).
- Tell the owner a holding limit. Ask what their health department says.
- Leave without a backup copy off the tablet.
