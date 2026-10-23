# Decisions for Freddy (gathered by A4, round 4)

Every naming and product question the agents raised so far, in plain words. For each: the options, what I recommend, and why. I have not applied any of these. Nobody who runs a restaurant has been asked yet; where a recommendation is a guess about owners, it says so. Sources: docs/audit/wording.md, glossary.md, office.md, board-ordering.md, e2e-triage.md, docs/clean-start-design.md, docs/commercial-decisions.md.

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
15. **Where the cooking-ahead question lives.** Today it is at the bottom of "Tax, hours and PIN", default No. And choosing Yes leaves the Cabinet's Product list empty, because there is no way to create an ingredient. Recommend **ask once in the first setup**, and when the answer is Yes, offer "Add a cooked-ahead item" (name and weight) right there, so the Cabinet works on day one. Until that exists, the Guide says the Cabinet may be empty.

## Counting food (A2 and the engine)

16. **"Portions on hand" on the add-dish form from day one.** Most small owners think "I have 12 left". Recommend **yes, as an optional line under More options** ("Made ahead? How many right now?"), and promote it if testers use it.
17. **Recount.** Owners physically count. Recommend a simple **"I counted: __"** button on a counted dish that writes a visible correction, not a silent overwrite, so waste numbers stay honest.

## Locked out

18. **Forgot the PIN.** Today there is no recovery; the only way back in is clearing the browser's saved data, which erases everything. Options: leave it (and say so, as the Guide does), show a **one-time recovery code** when the PIN is set (print it, keep it), or let a backup file remove the PIN. Recommend the **recovery code**: no server or email is needed, and nobody loses a day's data. The PIN stays a door latch, not security.

## Smaller ones

19. **Units.** Settings hold °F or °C and kg or lb, with no screen yet. Recommend default **°F and kg** (your rule) with lb as a choice in settings, not in the first setup.
20. **Thrown away, discard or thrown out.** Recommend **thrown out** everywhere (log, buttons, reports). Waste stays only as a total.
21. **Customer or guest.** Recommend **customer**.

## Business decisions already listed elsewhere

docs/commercial-decisions.md has eleven open items (customer, price, billing, onboarding, support, updates, privacy, terms, liability and insurance, entity and tax, pilot terms). None is decided. Two of them (software terms, liability) need a lawyer or broker before money is taken, and item 9 above feeds into both.
