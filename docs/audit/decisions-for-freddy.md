# Decisions for Freddy (A4, round 6)

The questions the agents raised, in plain words, with what I recommend and why. The twelve that matter most come first; the rest are in the "Also" list. Nothing here has been applied. Nobody who runs a restaurant has been asked yet, so a recommendation about owners is my guess. Longer detail: docs/audit/wording.md, glossary.md, pin-recovery-options.md, docs/clean-start-design.md, docs/commercial-decisions.md.

## The twelve that matter most

1. **Default limit for cold dishes and any dish an owner adds as cooked-ahead.** Cold dishes with mayonnaise, egg or dairy usually need a time limit that is a hard stop, not "taste it and keep serving". Recommend **hard stop (Throw-out time) by default**, 4 hours, with a prompt to ask the health department. The owner can relax it. Built so far: owner-added cooked-ahead items already default to a safety limit with 4 hours. The barbecue demo dishes keep their quality limits, because the demo says it is made up. A too-loose default is a food-illness and liability risk.
2. **Forgot the PIN.** There is no recovery; the keypad explains the only way back (clear the browser's saved data, then restore a backup). Options: **A** a recovery code shown once when the PIN is set, **B** a backup file made on this device lets you reset it, **C** a 24-hour wait. Recommend **A, with C as the fallback**: no server or email, and nobody loses a day's data. The PIN stays a door latch, not security.
3. **Demo or Practice.** The app says "demo", "practice", "pretend", "made-up" and "simulated" in different places, and the backup page says "Practice kitchen (the demo)". Recommend **Demo** for the mode and the bar, **Sample history** for the made-up past days, and drop the rest.
4. **"New ticket" or "New order".** The big button starts a customer's order; the slip in the kitchen is the ticket. Recommend **New order**. Cost: many tests and the Guide change.
5. **The "Menu" button.** It opens a sheet already titled Settings, and "menu" also means your dishes. Options: keep, More, or Settings. Recommend **Settings**.
6. **"Bump" or "Send out".** Cooks from other kitchen screens know Bump. Recommend **keep Bump**, explained once in Help and the Guide, and ask two real cooks before changing it.
7. **Two time limits on a batch.** Now "quality limit" and "safety limit" (the back-office record already says "best-by"). Recommend **Best-by** (taste it first) and **Throw-out time** (must go), after one owner confirms Best-by does not sound like "still fine to sell". Use the same words on the cabinet and the safety record.
8. **Station names.** Barbecue (Pit, Hot sides) or neutral (Main line, Sides). Recommend **neutral for a new kitchen**, barbecue names in the demo. Owners can rename either way.
9. **Pacing.** The "Pace" page and the "Meal pacing" setting mean different things. Recommend page **Speed**, setting **Finish together**, and **off by default** for a new kitchen: one cook does not need staggered starts, and gray waiting dishes confuse a new user.
10. **Simulated channel feeds** (fake Counter POS, Online ordering). A fake feature on real screens. Recommend **hide now, remove later**.
11. **Starting over, and old demo data.** Recommend a **"Start over with an empty menu" button, with a backup taken first**, plus a **one-time offer to clear old demo or sample tickets** that sit in an existing owner's real reports, showing a plain count of what would go.
12. **Counting food.** Built: "I count what I made" under each dish. Missing: a recount button and a way to see it on the add form. Recommend a simple **"I counted: __"** button that writes a visible correction (not a silent overwrite), an optional **"How many right now?"** under More options on the add form, and **Small 100 g, Normal 150 g, Big 250 g** instead of asking owners for grams.

## Also (short answers)

- **Day / Night vs Ember / Paper:** use **Day / Night** everywhere.
- **Thrown out vs discard vs thrown away:** **thrown out** everywhere. **Customer** not guest.
- **Units:** default **°F and kg**; lb as a choice in settings, not in first setup.
- **Cooking-ahead question:** keep it in the dishes sheet only (it is also at the bottom of Tax, hours and PIN). Yes turns everything on at once; keep that.
- **"Not used" stations:** keep "Not used" and "Use again".
- **4-hour default for cooked-ahead food:** keep it; say "ask your health department"; do not name a typical cold value.
- **Busy-night demo on a real kitchen's first screen:** moved behind "Try the demo", which is right.
- **Auto-start the busy-night crew in the demo:** no. Show a "Busy-night crew" button instead.
- **Resume the demo:** no resume button; only restart and Back to my kitchen.
- **Starting cash on Close the day:** yes, an optional "cash in the drawer at open", remembered from yesterday.
- **Closing the same day twice:** keep allowing it; it covers the whole day and the sheet says so.
- **Business decisions** (price, billing, terms, liability, insurance, pilot terms): eleven open items in docs/commercial-decisions.md, none decided. Terms and liability need a lawyer or broker before money is taken, and decision 1 above feeds into both.
