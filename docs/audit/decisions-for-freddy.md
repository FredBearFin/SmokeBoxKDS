# Decisions for Freddy (A4, updated round 12)

Decisions Freddy has made come first, then what is still open, then smaller items with my recommendation. Nobody who runs a restaurant has been asked yet, so a recommendation about owners is my guess. Longer detail: docs/audit/wording.md.

## Decided (Freddy, round 12)

One line each. The Guide, FAQ, print cards and glossary follow these.

- **New ticket** stays.
- **Settings** replaces the Menu button.
- **Demo** is the word for the mode and the bar; **Sample history** is made-up past days. Not "Practice".
- **Bump** stays, explained once in the Guide.
- **Quality limit** and **Throw-out time** everywhere. No "best-by".
- The Pace page is **Speed**; the setting is **Finish together**, off by default for new kitchens.
- The fake channel sync strip is removed.
- "Do you cook food ahead?" is a required Yes, No or Not sure. Not sure counts as No for now.
- A **PIN recovery code** exists: shown once when the PIN is set, and Forgot PIN asks for it.
- **Start over with an empty menu** (backup made at the moment of erasing). The old-demo-tickets offer (Clear them or Keep them) is built.

## Still open

1. **Limits for cold food and for cooked-ahead items.** Not decided, and no default should be invented. Two cases differ: food kept in a fridge (rules usually count days) and food out on the line with no temperature control (rules usually count hours). The exact numbers depend on the local health department. Proposal: the owner types the limit for each item, the app offers no legal-looking number of its own, and every screen says "set the limit your local health department gives you". A5's investigation will be in docs/audit/safety-defaults.md when it lands.
2. **Station names.** New kitchens now start with neutral names (Kitchen, Prep, Fryer, Cold and drinks); the demo keeps its barbecue names. Say if you want something else.
3. **Business decisions** (price, billing, terms, liability, insurance, pilot terms): eleven open items in docs/commercial-decisions.md. Terms and liability need a lawyer or broker before money is taken.

## Also

- **Reading the board from 10 feet (A1).** The Overdue badge is small at that distance; the red outline and "Do this first" tag carry the message. Recommend **a larger Overdue badge in Far display**, and a real look from across a real kitchen on the real TV before anyone relies on it. A 32-inch 2560 by 1440 monitor needs browser zoom.
- **Sound strip on the board.** Now 44 px high. Keep it on the first run; the Guide explains why sound matters.
- **Reordering dishes.** Up and down arrows exist. Recommend **arrows are enough**; no dragging. The order screen should follow the owner's order, not alphabetical.
- **Imported dishes.** Recommend **ticked for clean rows, unticked for rows with a problem**, so a clean file is one tap and nothing broken sneaks in.
- **Counting food.** Built: "I count what I made". Recommend a **"I counted: __" button** that writes a visible correction, an optional "How many right now?" under More options on the add form, and **Small 100 g, Normal 150 g, Big 250 g** instead of asking owners for grams.
- **Day / Night vs Ember / Paper:** **Day / Night** everywhere. **Thrown out** not discard. **Customer** not guest.
- **Units:** default **°F and kg**; lb as a choice in settings.
- **"Not used" stations:** keep "Not used" and "Use again".
- **Auto-start the busy-night crew in the demo:** no; a "Busy-night crew" button. **Resume the demo:** no resume button.
- **Starting cash on Close the day:** an optional "cash in the drawer at open", remembered from yesterday. **Closing twice in a day:** keep allowing it.
