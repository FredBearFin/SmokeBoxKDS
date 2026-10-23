# Decisions for Freddy (A4, round 7)

The questions the agents raised, in plain words, with what I recommend and why. The twelve that matter most come first; the rest are in the "Also" list. Nothing here has been applied. Nobody who runs a restaurant has been asked yet, so a recommendation about owners is my guess. Longer detail: docs/audit/safety-defaults.md, pin-recovery-options.md, wording.md, glossary.md, docs/clean-start-design.md, docs/commercial-decisions.md.

## The twelve that matter most

1. **Default limit for cold dishes and any dish an owner adds as cooked-ahead.** Cold dishes with mayonnaise, egg or dairy usually need a time limit that is a hard stop, not "taste it and keep serving". Recommend **hard stop (Throw-out time) by default**, 4 hours, and a prompt to ask the health department. Built so far: owner-added cooked-ahead items already default to a hard stop with 4 hours. Still open: the three cold sample dishes (slaw, potato salad, banana pudding) keep a quality limit. Recommend changing them in the sample, and dropping any sentence that states a rule. Related, from A5: a longest-any-batch default of **8 hours** instead of 12, and the temperature-check interval (120 minutes today, a house choice; the FDA figure is 4 hours): keep 2 hours, label it a starter value.
2. **Do not let "cooking ahead" end up off by accident.** A5 asks two things: should setup ask a yes or no question that cannot be skipped, and should adding a perishable ingredient push the owner to the cooked-ahead kind? Recommend **yes to both**: one tap each, and "Not sure" counts as No with a line saying what turning it on adds. An owner who holds food hot or cold but leaves it off gets no reminders.
3. **Forgot the PIN.** There is no recovery; the keypad explains the only way back (clear the browser's saved data, then restore a backup). Options: **A** a recovery code shown once when the PIN is set, **B** a backup file made on this device lets you reset it, **C** a 24-hour wait. Recommend **A, with C as the fallback**: no server or email, and nobody loses a day's data. The PIN stays a door latch, not security.
4. **Demo or Practice, and what the demo says.** The app still says demo, practice, pretend and made-up in places, and the backup page says "Practice kitchen (the demo)". Recommend **Demo** for the mode and the bar, **Sample history** for made-up past days, and drop the rest. Keep the one-question confirm before the demo opens. Do **not** let the demo bar say anything like "your own kitchen is safe": say it is not touched.
5. **"New ticket" or "New order".** The big button starts a customer's order; the slip in the kitchen is the ticket. Recommend **New order**. Cost: many tests and the Guide change.
6. **The "Menu" button.** It opens a sheet already titled Settings, and "menu" also means your dishes. Recommend **Settings**.
7. **"Bump" or "Send out".** Cooks from other kitchen screens know Bump. Recommend **keep Bump**, explained once in Help and the Guide, and ask two real cooks before changing it.
8. **Two time limits on a batch.** Cabinet: "quality limit" and "safety limit". Back-office record: "best-by". Recommend **Best-by** (taste it first) and **Throw-out time** (must go) everywhere, after one owner confirms Best-by does not sound like "still fine to sell".
9. **Station names.** Barbecue (Pit, Hot sides) or neutral (Main line, Sides). Recommend **neutral for a new kitchen**, barbecue names in the demo.
10. **Pacing.** The "Pace" page and the "Meal pacing" setting mean different things. Recommend page **Speed**, setting **Finish together**, and **off by default** for a new kitchen.
11. **The fake "Channel sync" strip** (shown with demo or sample data, labeled demo only). A3 left it in. Recommend **remove it from every screen** until a real connection exists: it is a feature that does nothing.
12. **Starting over, and old demo data.** Recommend a **"Start over with an empty menu" button, with a backup taken first**, plus a **one-time offer to clear old demo or sample tickets** from an existing owner's real reports, showing a plain count.

## Also

- **Reading the board from 10 feet (A1).** The Overdue badge is small at that distance; the red outline and "Do this first" tag carry the message. Recommend **a larger Overdue badge in Far display**, and a real look from across a real kitchen on the real TV before anyone relies on it. A 32-inch 2560 by 1440 monitor needs browser zoom.
- **Sound strip on the board.** Now 44 px high. Keep it on the first run; the Guide explains why sound matters.
- **Reordering dishes.** Up and down arrows exist. Recommend **arrows are enough**; no dragging. The order screen should follow the owner's order, not alphabetical.
- **Imported dishes.** Recommend **ticked for clean rows, unticked for rows with a problem**, so a clean file is one tap and nothing broken sneaks in.
- **Counting food.** Built: "I count what I made". Recommend a **"I counted: __" button** that writes a visible correction, an optional "How many right now?" under More options on the add form, and **Small 100 g, Normal 150 g, Big 250 g** instead of asking owners for grams.
- **Day / Night vs Ember / Paper:** **Day / Night** everywhere. **Thrown out** not discard. **Customer** not guest.
- **Units:** default **°F and kg**; lb as a choice in settings.
- **Cooking-ahead question location:** the dishes sheet only. Yes turns everything on at once.
- **"Not used" stations:** keep "Not used" and "Use again".
- **Auto-start the busy-night crew in the demo:** no; a "Busy-night crew" button. **Resume the demo:** no resume button.
- **Starting cash on Close the day:** an optional "cash in the drawer at open", remembered from yesterday. **Closing twice in a day:** keep allowing it.
- **Business decisions** (price, billing, terms, liability, insurance, pilot terms): eleven open items in docs/commercial-decisions.md, none decided. Terms and liability need a lawyer or broker before money is taken, and decision 1 above feeds into both.
