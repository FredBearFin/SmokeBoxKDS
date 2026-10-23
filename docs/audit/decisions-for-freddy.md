# Decisions for Freddy (gathered by A4, updated round 5)

Every naming and product question the agents raised so far, in plain words. For each: the options, what I recommend, and why. I have not applied any of these. Items 1 to 21 are from rounds 1 to 4 (some now built, noted); items 22 to 32 are new in round 5. Nobody who runs a restaurant has been asked yet; where a recommendation is a guess about owners, it says so. Sources: docs/audit/wording.md, glossary.md, office.md, board-ordering.md, e2e-triage.md, docs/clean-start-design.md, docs/commercial-decisions.md.

## Names

1. **"New ticket" or "New order"** (the big button). Today it says New ticket. It really starts a customer's order, and the slip in the kitchen is the ticket. Recommend **New order**: customers and counter staff say order. Cost: many tests and the Guide change.
2. **"Menu" button.** It opens the Settings sheet, but "menu" also means your dishes. Options: keep Menu, call it More, or call it Settings. Recommend **Settings**: the sheet is already titled Settings. "Menu" then only ever means your dishes.
3. **"Bump" or "Send out".** Cooks who used another kitchen screen know Bump. Owners may not. Recommend **keep Bump** for now and explain it once in Help and the Guide. Ask two real cooks before changing it.
4. **"Pace" page and "Meal pacing" setting.** Two meanings: the page shows kitchen speed, the setting staggers dish starts. Recommend page **Speed**, setting **Finish together**.
5. **"Ember / Paper" (back office) and "Day / Night" (board).** Two pairs for the same idea. Recommend **Day / Night** everywhere.
6. **"Demo" or "Practice".** The first screen says practice, the header says Demo, older text says pretend or made-up. Now that the demo becomes its own mode with its own bar, recommend **Demo** for the mode and **Sample history** for the made-up past days, and stop using practice, pretend and simulated. (This reverses my round 1 advice; the separate mode makes Demo clearer.)
7. **Two time limits on a batch.** Today: quality limit and safety limit. Plain options: **Best-by** (taste it first) and **Throw-out time** (must go). Recommend the plain words, after a quick check with one owner that Best-by does not sound like "still fine to sell".
8. **Station names.** Barbecue names (Pit, Hot sides) or neutral ones (Main line, Sides). Recommend **neutral for a new kitchen**, barbecue names in the demo. Owners can rename either way.

## Safe defaults

9. **Slaw, potato salad, banana pudding.** They start with a "quality" limit (taste it and keep serving), but cold dishes made with mayonnaise, egg or dairy usually need a time limit that is a hard stop. Recommend **default to the hard stop (Throw-out time)**; the owner can relax it after asking the health department. A wrong default is a food-illness and liability risk (see commercial decisions 8 and 9).
10. **Custom cook-ahead items** (an owner adds their own): recommend the same careful default, a 4-hour hold, a hard stop, and a prompt to confirm it. Easier to loosen than to find out later it was too loose.
11. **Pacing on or off for a new kitchen.** Recommend **off**. One cook does not need staggered starts, and gray waiting dishes confuse a new user. Turn it on when they ask.

## What a new owner sees

12. **"Start over with an empty menu" button** for existing owners. Recommend **yes, with a backup taken first**, next to the sample-dish option.
13. **Busy-night demo on the first screen of a real kitchen.** Recommend **move it to the Menu list** under "Try the demo", so a new owner sees two buttons: Add your first dish, Show me how it works.
14. **Simulated channel feeds** (Counter POS, Online ordering and so on). A fake feature on real screens. Recommend **hide now, remove later**.
15. **Where the cooking-ahead question lives.** Now built: after the first dish, Dishes and prices asks "Do you cook any of this ahead and hold it?" and "Add a cooked-ahead item" creates the food, so the Cabinet works on day one. What is left: the same switch also sits at the bottom of Tax, hours and PIN. Recommend **one place only (the dishes sheet)** so there is one answer to find.

## Counting food (A2 and the engine)

16. **"Portions on hand" on the add-dish form.** Built as "I count what I made" under each dish, not on the add form. Recommend **keep it there and also offer an optional "How many right now?" under More options of the add form**, so a new owner sees it the first time.
17. **Recount.** Not built (only +10 and Add exist). Owners physically count. Recommend a simple **"I counted: __"** button on a counted dish that writes a visible correction, not a silent overwrite, so waste numbers stay honest.

## Locked out

18. **Forgot the PIN** (full options in docs/audit/pin-recovery-options.md). Today there is no recovery; the keypad now explains the only way back in (clear the browser's saved data, then restore a backup). Options: **A** a one-time recovery code shown when the PIN is set, **B** a backup file made on this device lets you reset it, **C** a 24-hour wait. Recommend **A, with C as the fallback** for owners who did not keep the code: no server or email, nobody loses a day's data, and the PIN stays honestly a door latch.

## Smaller ones

19. **Units.** Settings hold °F or °C and kg or lb, with no screen yet. Recommend default **°F and kg** (your rule) with lb as a choice in settings, not in the first setup.
20. **Thrown away, discard or thrown out.** Recommend **thrown out** everywhere (log, buttons, reports). Waste stays only as a total.
21. **Customer or guest.** Recommend **customer**.

## New in round 5

22. **Where "Not used" stations live.** Built: Dishes and prices, Change stations, tap Not used. A hidden station leaves the tiles and its board tab while it has no tickets. Recommend **keep "Not used" and "Use again"**: plainer than "hide", and a station with tickets can never vanish.
23. **The 4-hour default for cooked-ahead food.** Recommend **keep 4 hours**, say "ask your health department" next to it (it does), and do not name a "typical" cold value: that would state a rule we cannot back.
24. **150 grams per serving.** The setup uses 150 g as a starting guess for how much of a batch one dish uses. Most owners will not know grams. Recommend **three choices that show their grams**: Small 100 g, Normal 150 g, Big 250 g, plus a typed number.
25. **Yes, I cook ahead turns everything on at once.** Built that way. Recommend **keep**: asking twice annoys people.
26. **Resume the demo.** The design keeps demo data so you can resume it. Recommend **no resume button**, only Restart the demo and Back to my kitchen: the demo is for trying, and fewer buttons means fewer mistakes.
27. **Auto-start the busy-night crew in the demo.** Recommend **no auto-start**: show a "Start the busy-night crew" button in the demo bar. Orders and sounds appearing on their own on a first look are confusing.
28. **One-time offer to clear old demo data.** Existing owners may have demo or sample tickets mixed into their real reports. Recommend **yes, offer once after the update, with a backup taken first**, and show a plain count of what would go.
29. **Starting cash for Close the day.** Today the page says "Cash in the drawer should be $X, plus the cash you started the day with". Recommend **an optional "cash in the drawer at open" number**, remembered from yesterday, so the line becomes one total. Owners count the drawer.
30. **Closing again the same day.** Today it is allowed and covers the whole day; nothing locks. Options: allow, lock, or warn. Recommend **keep allowing it** (late orders happen in small kitchens), with the sentence that already says so.
31. **Demo wording in the app.** The welcome button says "Try the busy-night demo (practice)", the header says Demo, the new bar will say DEMO. Same as item 6: recommend **Demo** everywhere and drop "practice".
32. **Cold starter dishes (item 9) for the demo only.** Keep the barbecue dishes and their quality limits in the demo, since it says it is made up; the careful default (hard stop) applies to every dish an owner adds. Recommend **yes**.

## Business decisions already listed elsewhere

docs/commercial-decisions.md has eleven open items (customer, price, billing, onboarding, support, updates, privacy, terms, liability and insurance, entity and tax, pilot terms). None is decided. Two of them (software terms, liability) need a lawyer or broker before money is taken, and item 9 above feeds into both.
