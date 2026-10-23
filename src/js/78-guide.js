/*
 * WHAT THIS FILE IS: The in-app Guide: plain-words help pages and printable quick cards (SB.guide) shown on their
 *   own screen at the address #/guide (or #/guide/page-name). The text comes from docs/sop/*.md.
 * PARTS: the page data (written by tools/build-guide.mjs), text and search helpers, drawing the screen, show, open, help link.
 * USES: 00-util.js (h, clear), 05-icons.js, 60-shell.js (router), 79-guide-art.js (pictures).
 * USED BY: 60-shell.js; menus and screens call SB.guide.open() and SB.guide.link(). Styles are in 24-guide.css.
 */
(function (g) {
  'use strict';
  const SB = (g.SB = g.SB || {});
  const doc = g.document || null;

  // The Guide pages: id, group (guide or cards), title, summary and blocks (h = heading, p = paragraph, ol, ul and
  // check = lists, fig = a picture from 79-guide-art.js). Inside the text, **double stars** mark the name of a
  // button or screen exactly as it appears in the app.
  // audit:data-start
  // guide:data-start (written by tools/build-guide.mjs from docs/sop; do not edit by hand)
  const PAGES = [
   {
    "id": "getting-started",
    "group": "guide",
    "title": "Getting started",
    "summary": "Add your dishes, send a test order, take payment and save your first backup. About ten minutes.",
    "blocks": [
     {
      "t": "h",
      "x": "1. Add your first dish"
     },
     {
      "t": "ol",
      "x": [
       "A new Smokebox starts empty on purpose. Tap **Add your first dish** on the welcome screen.",
       "Type what the dish is called and its price. Tap where it is made: Pit, Hot sides, Fry or Cold and drinks.",
       "Tap **Save and add another** until your menu is in. Then tap **Save and finish**."
      ]
     },
     {
      "t": "p",
      "x": "Change dishes and prices later: tap **Menu**, then **Dishes and prices**. A dish you remove goes to **Removed dishes**. Tap **Bring it back** to put it back."
     },
     {
      "t": "p",
      "x": "Have your menu in a spreadsheet? In Dishes and prices, tap **Have a menu file? Import it**."
     },
     {
      "t": "p",
      "x": "Want to see how a ticket works first? Tap **Show me how it works** for a one-minute walkthrough."
     },
     {
      "t": "h",
      "x": "2. Set your tax and hours"
     },
     {
      "t": "p",
      "x": "Tap **Menu**, then **Dishes and prices**, then **Tax, hours and PIN** at the bottom. Enter your sales tax (0 if you charge none) and your opening hours. A PIN is optional. It keeps your cooks out of the back office."
     },
     {
      "t": "p",
      "x": "Do you cook food ahead and keep it hot or cold? Say so in **Dishes and prices** (see Cooked-ahead food and portions). If you cook everything to order, skip it."
     },
     {
      "t": "p",
      "x": "Temperatures show in °F and weights in kilograms. You can change both in the **Back office**, under **Menu and settings**."
     },
     {
      "t": "h",
      "x": "3. Send a test order"
     },
     {
      "t": "ol",
      "x": [
       "Tap **New ticket**.",
       "Tap a dish, then tap **Send to kitchen**.",
       "The ticket appears on the board. Tap **Start**, then **Done** on the dish, then **Bump** the ticket."
      ]
     },
     {
      "t": "p",
      "x": "A test order counts in your reports. To remove it, cancel it (see Taking an order)."
     },
     {
      "t": "h",
      "x": "4. Take payment"
     },
     {
      "t": "p",
      "x": "Tap **Orders**. For cash, tap the Pay button on the order. It shows the total, like Pay $8.50 cash. For a card, a tip or a discount, tap **Tip or discount**, choose how it was paid, then tap **Mark paid**."
     },
     {
      "t": "p",
      "x": "Smokebox only writes down how the order was paid. It never charges a card."
     },
     {
      "t": "h",
      "x": "5. Save a backup"
     },
     {
      "t": "p",
      "x": "Tap **Back office**, then **Menu and settings**. Find Data, backup and reset and tap **Download backup (JSON)**. Keep a copy off this device: email it to yourself or put it on a USB drive."
     }
    ]
   },
   {
    "id": "taking-an-order",
    "group": "guide",
    "title": "Taking an order",
    "summary": "Start an order, add dishes and notes, send it to the kitchen, and add to it later.",
    "blocks": [
     {
      "t": "h",
      "x": "Start the order"
     },
     {
      "t": "p",
      "x": "Tap **New ticket**. Tap a dish to add it. Tap it again to add one more. A dish marked 86 (sold out) cannot be added."
     },
     {
      "t": "h",
      "x": "Customer and order type"
     },
     {
      "t": "p",
      "x": "Type a name or tap a quick name. Leave it blank for Walk-up. Choose how the order came in: Dine-in, Takeout, Drive-thru or Delivery app. Each type has its own time limit before a ticket turns amber and then red."
     },
     {
      "t": "h",
      "x": "Allergies and notes"
     },
     {
      "t": "p",
      "x": "Under Any food allergy?, tap **Allergy**, then tap what the customer is allergic to. Put allergies first in the note. Cooks read the first line first."
     },
     {
      "t": "h",
      "x": "Rush"
     },
     {
      "t": "p",
      "x": "Switch on **Rush ticket** when a customer is waiting. Every dish starts at once and the ticket goes to the front of the board."
     },
     {
      "t": "h",
      "x": "Send it"
     },
     {
      "t": "p",
      "x": "Tap **Send to kitchen**. Each station sees only its own dishes. Pay now, or leave it on Pay later and take payment from **Orders** when the customer is ready."
     },
     {
      "t": "h",
      "x": "Add to an order that is still open"
     },
     {
      "t": "p",
      "x": "Tap **New ticket** again and choose **Add to open order**. The new ticket is added to the same order."
     },
     {
      "t": "h",
      "x": "Fixing a mistake"
     },
     {
      "t": "ul",
      "x": [
       "**Undo** appears for 10 seconds after an action. After that, fix it by hand.",
       "To cancel a ticket, open its small menu on the board, tap **Void ticket** and say why. Cancelled tickets are still counted in your reports."
      ]
     }
    ]
   },
   {
    "id": "running-the-line",
    "group": "guide",
    "title": "Running the line",
    "summary": "What a cook does on the kitchen board.",
    "blocks": [
     {
      "t": "h",
      "x": "Read a ticket"
     },
     {
      "t": "fig",
      "id": "ticket",
      "alt": "A ticket on the kitchen board with seven numbered parts: ticket number and clock, customer, next step, a dish row, Start or Done, the more menu, and Bump.",
      "cap": "A ticket on the board. The numbers match the list below."
     },
     {
      "t": "ol",
      "x": [
       "Ticket number and clock. The clock counts up from when the order came in. It turns amber, then red, when the order is taking too long.",
       "The customer, the order type and how many dishes are done.",
       "The next step. This line says what to do next.",
       "A dish. It shows its station, and a countdown once it is cooking.",
       "**Start** or **Done** for that dish. Quick dishes, like drinks, only need Done.",
       "The small menu (the ... button): cancel the ticket or mark it as a rush.",
       "**Bump** finishes the ticket and takes it off the board, once every dish is done."
      ]
     },
     {
      "t": "h",
      "x": "Start and finish dishes"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Start** when you begin a dish that takes time. A countdown shows the usual cooking time.",
       "When the countdown reaches zero the row says Check it. Look at the food. Smokebox never decides that a dish is done.",
       "Tap **Done** when the dish is really finished."
      ]
     },
     {
      "t": "p",
      "x": "Gray dishes are waiting on purpose, so the whole order finishes together. Tap **Start now** to start one early."
     },
     {
      "t": "h",
      "x": "Send the ticket out"
     },
     {
      "t": "p",
      "x": "If a dish is not done, Bump asks first. Bumped by mistake? **Undo** brings it back for 10 seconds. After that, use **Recall**."
     },
     {
      "t": "h",
      "x": "When something runs out"
     },
     {
      "t": "p",
      "x": "Tap **86 board**, find the dish and mark it sold out. Smokebox also does this by itself when a dish's food runs low."
     }
    ]
   },
   {
    "id": "cooked-ahead-and-portions",
    "group": "guide",
    "title": "Cooked-ahead food and portions",
    "summary": "Two ways to keep track of food you make before the order comes in.",
    "blocks": [
     {
      "t": "h",
      "x": "Count portions"
     },
     {
      "t": "p",
      "x": "Use this for a dish you make a batch of and sell until it is gone, like 20 sandwiches."
     },
     {
      "t": "ol",
      "x": [
       "Tap **Menu**, then **Dishes and prices**. Under the dish, tap **I count what I made**.",
       "Type how many you made and tap **Start counting**.",
       "The dish shows how many are left, like \"20 left\". Tap **+10** or **Add** when you make more.",
       "At zero the dish shows as sold out. **Stop counting** turns it off."
      ]
     },
     {
      "t": "p",
      "x": "Counting does not track temperature or time."
     },
     {
      "t": "h",
      "x": "Track food you hold hot or cold"
     },
     {
      "t": "p",
      "x": "Use this for food kept in a warmer or cooler, like chili or potato salad, so Smokebox can warn you before it runs out of time."
     },
     {
      "t": "ol",
      "x": [
       "In **Dishes and prices**, find \"Do you cook any of this ahead and hold it?\" and tap **Yes, I cook ahead**. Then tap **Add a cooked-ahead item**.",
       "Type what you cook ahead and choose Hot or Cold.",
       "Set how long it may stay. 4 hours is a careful starting point. Ask your health department and change it to match.",
       "Select the dishes that use it. Smokebox takes about 150 grams off the batch for each dish made, a starting guess you can change.",
       "Tap **Save cooked-ahead item**. Then tap **Log a first batch**, or **Done for now**."
      ]
     },
     {
      "t": "p",
      "x": "Choose **No, skip this** if you cook everything to order. You can add cooked-ahead items later from the Cabinet."
     }
    ]
   },
   {
    "id": "hold-cabinet-and-warnings",
    "group": "guide",
    "title": "Hold cabinet and warnings",
    "summary": "How cooked food is tracked, and how the board warns you before it runs out of time.",
    "blocks": [
     {
      "t": "h",
      "x": "Food in the hold cabinet"
     },
     {
      "t": "fig",
      "id": "cabinet",
      "alt": "Steps for a batch in the hold cabinet: it goes in, it is checked, portions are taken out, and it ends by being reheated once or thrown out.",
      "cap": "A batch in the hold cabinet."
     },
     {
      "t": "p",
      "x": "No **Cabinet** tab? Say yes to cooking ahead first (see Cooked-ahead food and portions)."
     },
     {
      "t": "ol",
      "x": [
       "Open the **Cabinet** tab. Tap **New batch**, choose the food, and enter the weight and a first temperature reading. Tap **Put in hold cabinet**.",
       "Each batch has a card with one main button. Usually it is **Log temp**: take a reading at every check. A reading in range keeps the batch on the menu. When a batch is too cool the button becomes **Reheat** (once per batch). When it is past its best, it becomes **Taste it, keep serving**.",
       "The **More for this batch** button (...) opens the rest: **Pull** as portions leave the cabinet, **Start cooling**, and **Discard**.",
       "A batch out of time or out of range is thrown out: tap **Discard** and pick a reason."
      ]
     },
     {
      "t": "h",
      "x": "Warnings before the time runs out"
     },
     {
      "t": "fig",
      "id": "ladder",
      "alt": "Four warning steps as a batch nears its time limit: a soft chime about an hour before, a voice call at thirty minutes, a loud repeating tone at ten minutes, and a different sound when time is up. A note says warnings only sound while the screen is on and Smokebox is open.",
      "cap": "The warning steps. Times shown are the usual ones."
     },
     {
      "t": "ol",
      "x": [
       "About an hour left: a soft chime, and a row appears in the strip at the top.",
       "30 minutes left: a voice call.",
       "10 minutes left: a loud tone and voice. It repeats every 20 seconds until you tap the strip row.",
       "Time is up: a different sound, and the batch comes off the menu."
      ]
     },
     {
      "t": "p",
      "x": "Some foods warn earlier. You can change the times in Menu and settings. A batch that is almost empty, or on pace to sell out in time, stays quiet."
     },
     {
      "t": "p",
      "x": "Warnings only sound while the screen is on and Smokebox is open on the board. They do not sound when the tablet is asleep, the page is closed, the volume is off, or it is outside your opening hours."
     }
    ]
   },
   {
    "id": "closing-the-day",
    "group": "guide",
    "title": "Closing the day",
    "summary": "Close the day when the last order is paid. It saves the day's totals and gives you a page to print.",
    "blocks": [
     {
      "t": "h",
      "x": "Close the day"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Orders**, then **Close the day** at the bottom.",
       "If an order is still open, it is listed. Every order must be paid or cancelled first. Tap **Open Orders to pay or void**, then come back.",
       "If you cook ahead and food is left in the cabinet, choose **Keep it** (the timers keep running) or **Throw it all out** (logged as other).",
       "Read Money today: cash, card and other. The cash line says how much should be in the drawer, on top of the cash you started with.",
       "Tap **Close the day**.",
       "Tap **Back up today's data now** and **Print today's summary**."
      ]
     },
     {
      "t": "p",
      "x": "Closing does not lock anything. You can still take orders, and closing again later includes them. The app's day turns over at 4 am."
     },
     {
      "t": "h",
      "x": "Also"
     },
     {
      "t": "ul",
      "x": [
       "Wipe down food-contact surfaces and tap **Sanitize** if you cook ahead.",
       "If your health department asks, save or print the thrown-out log. Open it from the **Menu** button on the board.",
       "Keep a copy of the backup off this device (see Backup and restore)."
      ]
     }
    ]
   },
   {
    "id": "who-made-this-entry",
    "group": "guide",
    "title": "Who made this entry",
    "summary": "Initials go next to temperature readings and thrown-out batches, so the log shows who did what. A wrong entry is corrected, not erased.",
    "blocks": [
     {
      "t": "h",
      "x": "Initials"
     },
     {
      "t": "ol",
      "x": [
       "The first time you log a temperature or throw a batch out on a tablet, Smokebox asks \"Who is this?\". Type your initials. **Skip** is allowed, and the action still goes ahead.",
       "The tablet remembers them while you keep working, and asks again after two idle hours.",
       "When someone else takes over, tap **Switch person** in the cabinet."
      ]
     },
     {
      "t": "h",
      "x": "Fix an entry"
     },
     {
      "t": "ol",
      "x": [
       "Open the thrown-out log from the board's menu.",
       "Tap **Fix this entry** on the row.",
       "Say what was wrong, add your initials and tap **Save the fix**."
      ]
     },
     {
      "t": "p",
      "x": "The old entry stays in the log. Your fix is saved as a new entry next to it, with your initials and the time. That keeps the record honest."
     }
    ]
   },
   {
    "id": "backup-and-restore",
    "group": "guide",
    "title": "Backup and restore",
    "summary": "Everything Smokebox knows is saved in this browser on this device. A backup is a file you keep somewhere else.",
    "blocks": [
     {
      "t": "h",
      "x": "Make a backup"
     },
     {
      "t": "ol",
      "x": [
       "Tap **Back office**, then **Menu and settings**.",
       "Find Data, backup and reset. In the first card, **Back up now**, tap **Download backup (JSON)**. Or tap **Copy backup** and paste the text into an email to yourself.",
       "Keep a copy off this device."
      ]
     },
     {
      "t": "p",
      "x": "Back up every day at close. If the browser data is cleared or the device is replaced, a copy on the same device goes with it."
     },
     {
      "t": "h",
      "x": "Restore from a backup"
     },
     {
      "t": "ol",
      "x": [
       "In the second card, **Restore from a backup**, tap **Choose a backup file**. Pick the newest one, named smokebox-backup-(date).json. Or paste the text and tap **Check pasted backup**.",
       "Read the summary: the saved date, the tickets and the batches should match what you expect. Nothing has changed yet.",
       "If it is right, tap **Replace everything with this backup**. This replaces all data on this device, including the PIN. There is no undo, so back up what is here first if you might want it.",
       "Open the board and check your menu and your food. Sound and loudness are set per device, so test them again."
      ]
     },
     {
      "t": "p",
      "x": "A file that is not a valid backup is refused, and nothing is changed. A backup from the demo is refused too."
     },
     {
      "t": "h",
      "x": "Erasing"
     },
     {
      "t": "p",
      "x": "The Danger zone has **Erase live data** and **Erase everything**. Each one asks you to type a word first, so it cannot happen by accident. Back up before you use either."
     }
    ]
   },
   {
    "id": "replacing-a-device",
    "group": "guide",
    "title": "Replacing a device",
    "summary": "Move Smokebox to a new tablet or computer and keep your menu, settings and history. The Data page has a card, **Replacing this device**, with the same steps.",
    "blocks": [
     {
      "t": "ol",
      "x": [
       "On the old device, if it still works, download a backup (see Backup and restore). Copy the file somewhere else: email it to yourself or use a USB drive.",
       "On the new device, copy the same smokebox.html file onto it and open it. Install it as an app: on an iPad tap Share, then Add to Home Screen. In Chrome tap the menu, then Install app.",
       "Tap **Menu**, then **Set up this tablet**. Sound and keeping the screen on are set on each device, so do them again here.",
       "Tap **Back office**, then **Menu and settings**. In the **Restore from a backup** card, choose the backup file, check the summary and tap **Replace everything with this backup**.",
       "Check the board and your menu. Save a fresh backup from the new device, then retire the old one."
      ]
     },
     {
      "t": "p",
      "x": "If the old device is broken and you have no backup file, its data cannot be recovered. This is why a daily backup matters."
     },
     {
      "t": "p",
      "x": "Separate devices do not share data yet. Two tabs on the same device stay in step."
     }
    ]
   },
   {
    "id": "troubleshooting",
    "group": "guide",
    "title": "Troubleshooting",
    "summary": "Plain fixes for sound, sleep, missing dishes and odd numbers. Lost data and the PIN are on the next page.",
    "blocks": [
     {
      "t": "h",
      "x": "No sound"
     },
     {
      "t": "ol",
      "x": [
       "If the board says \"Tap here to turn on warning sounds\", tap it. Browsers need one tap first.",
       "Turn the tablet volume up and check its silent switch.",
       "Tap **Menu** and check that Sound is on and the loudness is not low.",
       "Tap **Menu**, then **Set up this tablet**, then **Play a test warning**.",
       "If the bar says \"Sound paused\", it is outside your opening hours. Set the hours under **Tax, hours and PIN**.",
       "Close any second Smokebox tab. Only the tab on screen makes sound."
      ]
     },
     {
      "t": "h",
      "x": "The screen went to sleep"
     },
     {
      "t": "p",
      "x": "Warnings cannot sound while the screen is off. Smokebox asks the browser to keep the screen on, but some browsers say no. Set the tablet to never sleep (Auto-Lock on an iPad, Screen timeout on Android) and keep it plugged in. When you wake it, check the times on the cards."
     },
     {
      "t": "h",
      "x": "A dish is missing"
     },
     {
      "t": "ul",
      "x": [
       "Clear the search box and choose the All category on the New ticket screen.",
       "Open the **86 board**. A dish that is sold out or off the menu is listed there with the reason.",
       "Open **Dishes and prices** to see every dish you have added. A dish you removed is under **Removed dishes**: tap **Bring it back**.",
       "No **Cabinet** tab or **Sanitize** button? They show only after you say **Yes, I cook ahead** in **Dishes and prices**."
      ]
     },
     {
      "t": "h",
      "x": "A number looks wrong"
     },
     {
      "t": "ul",
      "x": [
       "Check the date range and the filters at the top of the Back office page.",
       "Choose **Live only** to leave out the sample history, which is made up.",
       "Unpaid orders are not counted as money collected.",
       "Starter estimates (prep times, yields, costs) are guesses until you confirm them."
      ]
     }
    ]
   },
   {
    "id": "empty-lost-or-locked",
    "group": "guide",
    "title": "Empty, lost or locked",
    "summary": "What to do when Smokebox opens empty, your data is gone, or you cannot get past the PIN.",
    "blocks": [
     {
      "t": "h",
      "x": "I closed the tab"
     },
     {
      "t": "p",
      "x": "Smokebox saves every change on this device as you go. Open it again the same way, in the same browser, and the board comes back. The clocks kept running while it was closed, and no warning sounded."
     },
     {
      "t": "h",
      "x": "The tablet was replaced or cleared"
     },
     {
      "t": "p",
      "x": "Your data lives only in the browser on one device. Clearing the browser data, using another browser, another file location or a private window shows an empty Smokebox. Restore your last backup (see Backup and restore)."
     },
     {
      "t": "h",
      "x": "I forgot the PIN"
     },
     {
      "t": "p",
      "x": "Smokebox has no forgot-PIN button. The PIN is a door latch kept on this device, not real security. Five wrong tries lock the pad for 30 seconds."
     },
     {
      "t": "p",
      "x": "The only way back in is to clear this site's saved data in your browser settings. That erases everything Smokebox saved on this device, including today's tickets and your menu. Do it only with a backup you can restore. A backup brings its PIN back, so use one made before the PIN was set."
     },
     {
      "t": "h",
      "x": "Smokebox opens empty"
     },
     {
      "t": "p",
      "x": "That is by design for a new Smokebox. It starts with no dishes, tickets or food in the cabinet, and it never guesses. Add dishes under **Dishes and prices**. If it was full yesterday, see \"The tablet was replaced or cleared\" above."
     },
     {
      "t": "h",
      "x": "What is saved where"
     },
     {
      "t": "ul",
      "x": [
       "Tickets, dishes, settings and the PIN: in this browser on this device only.",
       "Sound, loudness, Day or Night and text size: on this device only.",
       "Other devices do not see your board. A backup file is the only copy you can move."
      ]
     }
    ]
   },
   {
    "id": "trying-the-demo",
    "group": "guide",
    "title": "Trying the demo",
    "summary": "See Smokebox with food on it, without touching your own kitchen.",
    "blocks": [
     {
      "t": "ol",
      "x": [
       "On the welcome screen, or in the **Menu**, tap **Try the demo**. Then tap **Try the demo** again to confirm. Tap **Not now** to stay where you are.",
       "The demo opens with sample dishes, three sample tickets and food in the cabinet. A bar at the top says \"You are trying the demo\". Cook, bump, pay and throw out food as much as you like.",
       "Nothing you do there reaches your own kitchen.",
       "Tap **Back to my kitchen** on the bar to return. Your own dishes and orders are as you left them."
      ]
     },
     {
      "t": "p",
      "x": "A backup made in the demo cannot be loaded into your own kitchen, and a real backup cannot be loaded into the demo. Smokebox refuses it and changes nothing."
     },
     {
      "t": "p",
      "x": "Sample numbers are made up. They are never your sales or your food."
     }
    ]
   },
   {
    "id": "questions-and-answers",
    "group": "guide",
    "title": "Questions and answers",
    "summary": "Short answers to the questions owners ask first.",
    "blocks": [
     {
      "t": "h",
      "x": "Does it need the internet?"
     },
     {
      "t": "p",
      "x": "No. Smokebox is one file and works without internet."
     },
     {
      "t": "h",
      "x": "Can two tablets share one board?"
     },
     {
      "t": "p",
      "x": "Not yet. Each device has its own board. Two tabs in the same browser on the same device stay in step."
     },
     {
      "t": "h",
      "x": "Does it charge cards?"
     },
     {
      "t": "p",
      "x": "No. It only writes down how an order was paid. Keep your card reader."
     },
     {
      "t": "h",
      "x": "Where is my data?"
     },
     {
      "t": "p",
      "x": "In this browser on this device. Save a backup every day at close."
     },
     {
      "t": "h",
      "x": "What does 86 mean?"
     },
     {
      "t": "p",
      "x": "Sold out or off the menu. The **86 board** lists what is out and why."
     },
     {
      "t": "h",
      "x": "What is a starter estimate?"
     },
     {
      "t": "p",
      "x": "A number that came with the app, such as a prep time or a cost. It is a guess until you replace it with your own."
     },
     {
      "t": "h",
      "x": "Why is there no Cabinet tab?"
     },
     {
      "t": "p",
      "x": "The Cabinet shows only when you tell Smokebox you cook food ahead. Tap **Menu**, then **Dishes and prices**, and tap **Yes, I cook ahead**."
     },
     {
      "t": "h",
      "x": "Can I try it without risking my data?"
     },
     {
      "t": "p",
      "x": "Yes. See Trying the demo."
     },
     {
      "t": "h",
      "x": "Can I change a price on an open order?"
     },
     {
      "t": "p",
      "x": "New tickets use the new price. Tickets already on the board keep theirs."
     },
     {
      "t": "h",
      "x": "Has it been used in a real kitchen?"
     },
     {
      "t": "p",
      "x": "It has been tested in a browser on a computer, not in a working kitchen. Try it on your own tablet before a busy service, and keep your usual system beside it until you trust it."
     }
    ]
   },
   {
    "id": "what-this-app-does-not-replace",
    "group": "guide",
    "title": "What this app does not replace",
    "summary": "Smokebox is a helper. You and your local rules stay in charge.",
    "blocks": [
     {
      "t": "ul",
      "x": [
       "Food-safety procedures. Smokebox reminds you to take temperatures and flags readings and times outside the limits you set. It cannot see, taste or measure your food. Your own food-safety plan, your training and your thermometer checks still apply.",
       "Your local health code. The starting limits come from the FDA Food Code. Your state or county may require something different. Ask your health department, then change the limits in Menu and settings.",
       "Card processing. Smokebox only writes down how an order was paid. Keep your card reader and your processor.",
       "Your register or POS. Smokebox is a kitchen display with simple order entry. It does not file taxes, run payroll or replace your bookkeeping. Sales tax is one flat percent that you set.",
       "Allergy care. A note on a ticket is a reminder. Tell your staff about every allergy, and follow your own allergen rules.",
       "Your backups. If you do not save backups, clearing the browser data erases everything.",
       "Real numbers. Demo tickets and sample history are made up. Starter estimates for prep times, yields and costs are guesses until you confirm them."
      ]
     }
    ]
   },
   {
    "id": "card-opening-checklist",
    "group": "cards",
    "title": "Opening checklist",
    "summary": "Print this card and keep it by the tablet.",
    "blocks": [
     {
      "t": "check",
      "x": [
       "Tablet plugged in, and set to never sleep",
       "Volume up. Smokebox open on the kitchen board",
       "Tap the warning bar once, or use Play a test warning under Set up this tablet",
       "Check the 86 board: what is out today?",
       "Counted dishes: how many did you make today?",
       "If you cook ahead: log a first temperature on each batch in the Hold cabinet",
       "If you cook ahead: wipe food-contact surfaces and tap Sanitize",
       "Yesterday's backup saved and a copy kept off the device"
      ]
     }
    ]
   },
   {
    "id": "card-closing-checklist",
    "group": "cards",
    "title": "Closing checklist",
    "summary": "Print this card and keep it by the tablet.",
    "blocks": [
     {
      "t": "check",
      "x": [
       "Orders: every open order paid or cancelled, then Close the day",
       "If you cook ahead: every batch left in the cabinet decided (keep, or throw out with a reason)",
       "If you cook ahead: surfaces wiped and Sanitize logged",
       "Sales and money looks right in the Back office",
       "Log of thrown-out batches saved or printed",
       "Backup downloaded and a copy kept off the device",
       "Tablet on its charger"
      ]
     }
    ]
   },
   {
    "id": "card-when-something-goes-wrong",
    "group": "cards",
    "title": "When something goes wrong",
    "summary": "Print this card and keep it by the tablet.",
    "blocks": [
     {
      "t": "check",
      "x": [
       "No sound: tap the warning bar, turn the volume up, then Menu, Set up this tablet, Play a test warning",
       "Screen asleep: wake it and check the times on the cards. Set it to never sleep",
       "Wrong tap: Undo, within 10 seconds",
       "Bumped by mistake: Recall it from the board header",
       "Wrong ticket: cancel it with Void ticket in its small menu, and give a reason",
       "Dish missing: check the 86 board and Dishes and prices",
       "Opened empty: restore the last backup (Back office, Menu and settings)",
       "Forgot the PIN: see Empty, lost or locked in the Guide. There is no reset button"
      ]
     }
    ]
   }
  ];
  // guide:data-end
  // audit:data-end

  // The page with this id, or the first page when the id is unknown or missing.
  const byId = (id) => PAGES.find((p) => p.id === id) || PAGES[0] || null;
  // Splits text into plain and bold pieces: [{ b: false, s: 'Tap ' }, { b: true, s: 'Pay' }, ...].
  function pieces(text) {
    return String(text).split(/\*\*([^*]+)\*\*/).map((s, i) => ({ b: i % 2 === 1, s })).filter((p) => p.s);
  }
  // The text with the bold marks removed, as a screen reader or a test would read it.
  const plain = (text) => pieces(text).map((p) => p.s).join('');
  // Every piece of text on a page, bold marks kept, in reading order (the alt text of a picture included).
  function textsOf(p) {
    return [p.title, p.summary].concat(p.blocks.map((b) => (Array.isArray(b.x) ? b.x.join(' ') : b.t === 'fig' ? b.alt + ' ' + b.cap : b.x)));
  }
  // The names of every button or screen the Guide mentions in bold, so a test can check they still exist.
  function labels() {
    const out = [];
    PAGES.forEach((p) => textsOf(p).forEach((t) => pieces(t).forEach((x) => { if (x.b && out.indexOf(x.s) < 0) out.push(x.s); })));
    return out;
  }
  // Searches the pages for every word typed (all words must appear). Returns [{ page, snippet }], best matches first:
  // a title hit ranks above a body hit.
  function search(query) {
    const words = String(query || '').toLowerCase().split(/[^a-z0-9$]+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    const out = [];
    PAGES.forEach((p) => {
      const parts = textsOf(p).map(plain);
      const all = parts.join(' ').toLowerCase();
      if (!words.every((w) => all.indexOf(w) >= 0)) return;
      const title = p.title.toLowerCase();
      const score = words.filter((w) => title.indexOf(w) >= 0).length * 10 + words.reduce((n, w) => n + all.split(w).length - 1, 0);
      // The first heading, paragraph or list item that holds a typed word, for the line under the result.
      const units = [];
      p.blocks.forEach((bl) => { if (Array.isArray(bl.x)) units.push(...bl.x); else units.push(bl.t === 'fig' ? bl.alt : bl.x); });
      const hit = units.find((u) => words.some((w) => plain(u).toLowerCase().indexOf(w) >= 0)) || p.summary;
      out.push({ page: p, score, snippet: plain(hit).slice(0, 140) });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  // Node (tests) has no page, so only the data and text helpers are offered there.
  if (!doc) { SB.guide = { pages: PAGES, byId, pieces, plain, labels, textsOf, search, link: () => null }; return; }

  const U = SB.util, h = U.h;
  // An icon of this name and size, or an empty span when icons are missing.
  const ico = (n, size) => { try { return SB.icons.svg(n, { size }); } catch (e) { return doc.createElement('span'); } };
  const R = () => SB.router;

  // The screen being shown, or null: { el, root, nav, main, article, page, ... }.
  let cur = null;

  // Makes the DOM for a piece of text, turning the bold marks into button-name chips.
  function inline(text) {
    const frag = doc.createDocumentFragment();
    pieces(text).forEach((p) => frag.appendChild(p.b ? h('strong', { class: 'gd-ui' }, p.s) : doc.createTextNode(p.s)));
    return frag;
  }
  // The address that opens one Guide page, so a link can be copied or bookmarked.
  const hashOf = (id) => (R() && R().hashFor ? R().hashFor({ kind: 'guide', page: id }) : '#/guide/' + id);
  // Goes to a Guide page through the router, which calls show() for us.
  const go = (id) => { if (R() && R().go) R().go({ kind: 'guide', page: id }); else show(id); };
  // Leaves the Guide and returns to the board (or the screen this device normally opens on).
  const back = () => { if (R() && R().go) R().go(R().home()); };
  // A click handler for a link to one page: moves there through the router instead of reloading the page.
  const linkClick = (id) => (e) => { e.preventDefault(); go(id); };

  // One block of a page (heading, paragraph, list, checklist or picture) as DOM.
  function block(b) {
    if (b.t === 'h') return h('h3', { class: 'gd-h' }, b.x);
    if (b.t === 'p') return h('p', { class: 'gd-p' }, inline(b.x));
    if (b.t === 'fig') {
      const art = SB.guideArt && SB.guideArt[b.id];
      if (!art) return h('p', { class: 'gd-p' }, b.alt);
      return h('figure', { class: 'gd-fig' }, art(b.alt), b.cap ? h('figcaption', null, b.cap) : null);
    }
    const tag = b.t === 'ol' ? 'ol' : 'ul';
    return h(tag, { class: 'gd-list' + (b.t === 'check' ? ' gd-check' : b.t === 'ol' ? ' gd-legend' : '') }, ...b.x.map((x) => h('li', null, inline(x))));
  }
  // Prints the page now showing. The print styles in 24-guide.css hide everything except the page text.
  const printNow = () => { try { g.print(); } catch (e) { /* printing is optional */ } };
  // Fills the content pane with one page: title, print button, summary, blocks and the Previous / Next links.
  function paint(page) {
    const a = cur.article;
    U.clear(a);
    const list = PAGES.filter((p) => p.group === page.group);
    const i = list.indexOf(page);
    const printBtn = h('button', { type: 'button', class: 'btn gd-print' + (page.group === 'cards' ? ' btn-primary' : ''), onClick: printNow }, ico('receipt', 20), h('span', null, page.group === 'cards' ? 'Print this card' : 'Print this page'));
    a.appendChild(h('div', { class: 'gd-head' }, h('h2', { class: 'gd-page-title', tabindex: -1 }, page.title), printBtn));
    a.appendChild(h('p', { class: 'gd-lede' }, inline(page.summary)));
    page.blocks.forEach((b) => a.appendChild(block(b)));
    const pager = h('div', { class: 'gd-pager' });
    // Builds a Previous or Next link to a neighbouring page.
    const link = (p, dir) => h('a', { class: 'btn gd-pg gd-pg-' + dir, href: hashOf(p.id), onClick: linkClick(p.id) },
      dir === 'prev' ? ico('chevron-left', 20) : null, h('span', null, (dir === 'prev' ? 'Previous: ' : 'Next: ') + p.title), dir === 'next' ? ico('chevron-right', 20) : null);
    if (i > 0) pager.appendChild(link(list[i - 1], 'prev'));
    if (i < list.length - 1) pager.appendChild(link(list[i + 1], 'next'));
    a.appendChild(pager);
  }
  // Marks the current page in the left list for sighted users and for screen readers.
  function markNav(page) {
    cur.nav.querySelectorAll('a').forEach((a) => {
      const on = a.getAttribute('data-page') === page.id;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // Shows one page (by id) in the open Guide: updates the list, the text, the title and the focus.
  function show(id) {
    if (!cur) return false;
    const page = byId(id);
    if (!page) return false;
    // An unknown page name in the address is tidied to the real first page, so the address never lies.
    if (id && page.id !== id && R() && R().go) R().go({ kind: 'guide', page: page.id }, { replace: true });
    cur.page = page;
    markNav(page);
    paint(page);
    cur.main.scrollTop = 0;
    // On a phone, fold the list again after choosing a page, and show the new page's name on the fold.
    if (cur.narrow && cur.narrow.matches) cur.box.open = false;
    cur.nav.querySelector('.gd-navsum').textContent = 'Pages: ' + page.title;
    if (!(cur.narrow && cur.narrow.matches)) cur.nav.querySelector('.gd-navsum').textContent = 'All pages and search';
    try { cur.article.querySelector('.gd-page-title').focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
    return true;
  }

  // One entry (a numbered link) in the page list.
  const navItem = (p, n) => h('li', null, h('a', { class: 'gd-link', href: hashOf(p.id), 'data-page': p.id, onClick: linkClick(p.id) },
    h('span', { class: 'gd-num', 'aria-hidden': 'true' }, String(n)), h('span', null, p.title)));
  // The list of pages (two groups: the Guide, and the printable quick cards).
  function buildList() {
    const guide = PAGES.filter((p) => p.group !== 'cards'), cards = PAGES.filter((p) => p.group === 'cards');
    return h('div', { class: 'gd-lists' },
      h('ol', { class: 'gd-nav-list' }, ...guide.map((p, i) => navItem(p, i + 1))),
      cards.length ? h('p', { class: 'gd-group', id: 'gd-cards-h' }, 'Quick cards to print') : null,
      cards.length ? h('ul', { class: 'gd-nav-list', 'aria-labelledby': 'gd-cards-h' }, ...cards.map((p) => navItem(p, '⎙'))) : null);
  }
  // Wires the search box: typing swaps the page list for matching pages; Enter opens the best match; Escape clears.
  function buildSearch(listBox) {
    const input = h('input', { type: 'search', class: 'input gd-search-in', id: 'gd-search', placeholder: 'Search the Guide', 'aria-label': 'Search the Guide', autocomplete: 'off' });
    const status = h('p', { class: 'gd-search-n', role: 'status', 'aria-live': 'polite' });
    const results = h('ul', { class: 'gd-results', hidden: true, 'aria-label': 'Search results' });
    // Redraws the results (or brings the page list back when the box is empty).
    function run() {
      const q = input.value.trim(), found = search(q);
      U.clear(results);
      listBox.hidden = !!q; results.hidden = !q;
      status.textContent = q ? (found.length ? found.length + (found.length === 1 ? ' page matches' : ' pages match') : 'No page matches. Try fewer or different words.') : '';
      found.forEach((f) => results.appendChild(h('li', null, h('a', { class: 'gd-result', href: hashOf(f.page.id), onClick: linkClick(f.page.id) }, h('strong', null, f.page.title), h('span', null, f.snippet)))));
    }
    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = results.querySelector('a'); if (first) { e.preventDefault(); first.click(); } }
      else if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; run(); }
      else if (e.key === 'ArrowDown') { const first = results.querySelector('a'); if (first) { e.preventDefault(); first.focus(); } }
    });
    return h('div', { class: 'gd-search', role: 'search' }, h('label', { class: 'visually-hidden', for: 'gd-search' }, 'Search the Guide'), input, status, results);
  }

  // Closes the Guide on Escape, unless a pop-up sheet is open (then Escape belongs to the sheet).
  function onKey(e) { if (e.key === 'Escape' && !doc.querySelector('.sheet-root')) { e.preventDefault(); back(); } }

  // Builds the Guide screen inside el and shows the page named in opts.page. Returns a cleanup function.
  function mount(el, opts) {
    unmount();
    const listBox = buildList();
    // On a phone the list folds away so the page itself is the first thing seen; on wide screens it is always open.
    const sum = h('summary', { class: 'gd-navsum' }, 'All pages and search');
    const box = h('details', { class: 'gd-navbox' }, sum, buildSearch(listBox), listBox);
    const nav = h('nav', { class: 'gd-nav', 'aria-label': 'Guide pages' }, box);
    const narrow = g.matchMedia ? g.matchMedia('(max-width: 760px)') : null;
    // Opens the list on wide screens and folds it on narrow ones.
    const fit = () => {
      const small = !!(narrow && narrow.matches);
      box.open = !small;
      sum.textContent = small && cur && cur.page ? 'Pages: ' + cur.page.title : 'All pages and search';
    };
    fit();
    if (narrow && narrow.addEventListener) narrow.addEventListener('change', fit);
    const article = h('article', { class: 'gd-article' });
    const main = h('main', { class: 'gd-main', id: 'gd-main' }, article);
    const topBack = h('button', { type: 'button', class: 'btn gd-back', onClick: back }, ico('chevron-left', 20), h('span', null, 'Back to the board'));
    const top = h('header', { class: 'gd-top' }, topBack, h('h1', { class: 'gd-title' }, ico('info', 24), h('span', null, 'Guide')));
    // Keyboard users can jump past the page list straight to the page text.
    const skip = h('a', { class: 'gd-skip', href: '#gd-main', onClick: (e) => { e.preventDefault(); const t = article.querySelector('.gd-page-title'); if (t) t.focus(); } }, 'Skip to this page');
    const root = h('div', { class: 'gd' }, skip, top, h('div', { class: 'gd-body' }, nav, main));
    U.clear(el);
    el.appendChild(root);
    el.addEventListener('keydown', onKey);
    cur = { el, root, nav, main, article, box, narrow, fit, page: null };
    show(opts && opts.page);
    return unmount;
  }
  // Takes the Guide screen down and forgets it.
  function unmount() {
    if (!cur) return;
    const c = cur; cur = null;
    c.el.removeEventListener('keydown', onKey);
    if (c.narrow && c.narrow.removeEventListener) c.narrow.removeEventListener('change', c.fit);
    U.clear(c.el);
  }
  // True while the Guide screen is showing.
  function isOpen() { return !!cur; }

  // Opens the Guide (optionally at one page) by moving the address to #/guide or #/guide/page-name.
  function open(id) { go(id || (PAGES[0] && PAGES[0].id)); }

  // A small round "?" link that opens one Guide page; other screens place it next to a heading or button.
  // label says what the help is about ("Help: taking payment"), for screen readers and the tooltip.
  function link(page, label) {
    const name = label ? 'Help: ' + label : 'Help';
    return h('a', { class: 'gd-help', href: hashOf(page), title: name, 'aria-label': name, onClick: linkClick(page) }, h('span', { 'aria-hidden': 'true' }, '?'));
  }

  SB.guide = { pages: PAGES, ids: PAGES.map((p) => p.id), byId, pieces, plain, labels, textsOf, search, mount, unmount, show, open, isOpen, link };
})(typeof globalThis !== 'undefined' ? globalThis : window);
