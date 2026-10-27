# Setup, target flow: the owner's first ten minutes

Status: design for review, written 2026-10-23 from the measured journey in `docs/setup-journey-before.md`. Nothing here is built yet. Wireframes: `docs/setup-wireframes.txt`.

## Principles

1. **The app starts empty.** No dishes, prices, ingredients, batches or tickets that the owner did not enter. (Needs A5's empty first-run data state; today `src/js/10-config.js` seeds a 21-dish menu.)
2. **One path, the shortest.** First open leads to one big button: Add your first dish. Everything else waits until after the first dish or lives in Settings.
3. **Name, price, where it is made.** Three things per dish. Everything else has a sensible hidden default.
4. **Never block the first order.** A dish with no ingredient list is always orderable. Nothing says "sold out" unless the owner turned on stock tracking.
5. **Optional means hidden, not warned about.** No red badges, nags or second checklists for things the owner has not chosen.
6. **Plain words.** No 24-hour numbers, "starter estimate", "bills of materials" or "86" in setup text.

## The flow, screen by screen

| # | Owner sees | Owner does | App fills in |
|---|---|---|---|
| 1 First open | Empty board with one message, "Welcome. Let's build your menu. About two minutes." and one big button, Add your first dish. Quiet links: Practice run (2 minutes), Try the busy-night demo (pretend). | Taps Add your first dish. | Nothing is stored yet. |
| 2 Add a dish | One form: name box, price box, four big tiles for where it is made (Pit, Hot sides, Fry, Cold and drinks), Save and add another, Save and finish. A "More options" fold (short name, prep time, ingredients) is shut. | Types name, types price, taps a tile (3 actions; the tile is already selected to the last choice after the first dish). Taps Save and add another. | Category from the tile; short name from the first 24 letters; prep time guessed from the tile (for example Cold and drinks is a one-tap dish, the others start-then-done); the last tile choice stays selected. A list of dishes just added shows under the form. |
| 3 Three dishes in | A quiet card: "Your menu has 3 dishes." Buttons: Add more, Edit menu, New ticket (big). One line: "Tax, hours and PIN are in Settings when you want them." | Taps New ticket. | Wizard flag stays "not started"; nothing is forced. |
| 4 New ticket | The order screen with only the owner's dishes; no sold-out tiles. | Taps dishes, picks Cash or Card or Pay later, taps Send to kitchen. | Walk-up customer, dine-in channel, no tax until the owner sets one. |
| 5 First paid ticket | The ticket on the board and a toast that clears itself in about 5 seconds: "Ticket 1 sent. Paid $20.00 cash." | Nothing. | The welcome message is gone for good once a dish exists. |

Fewest steps for the run-A path: 1 tap (Add your first dish), then 3 dishes at about 3 actions each, then New ticket, 3 dish taps, Cash, Send. Target about 17 taps and 6 typed fields, against 24 taps, 7 typed fields and 4 list choices today.

## Where the optional things hide

| Optional thing | Where it lives | When it is offered |
|---|---|---|
| Cook-ahead meat (batches, cabinet, hold times) | One yes/no question inside Settings, "Do you cook meat ahead and hold it?" Default no. Answering yes turns on the Cabinet, ingredient fields and temperature logging. | Never at first run. A quiet line after the first paid ticket may mention it once. |
| Menu import (paste a list, CSV, POS export) | Under "More ways to add dishes" on the Add a dish screen, never on screen 1. This does not exist today (the only Import restores a backup); it is new work and must be checked with a preview before anything is saved. | Only if the owner opens that fold. |
| Example menu | A labeled "Load a sample barbecue menu" button inside that same fold. Every dish carries a Sample label and one tap removes them all. | Only if asked. Never automatic. |
| Sales tax, opening hours, manager PIN | A short "Your shop" page in Settings with plain-word fields (a time picker for hours, a percent box for tax). | One line on screen 3 and one in the first-ticket toast; never a blocking step. |
| Ingredients and stock counts | The "More options" fold on a dish and the Stock page. | When the owner wants stock tracking. |
| Prep time, short name, category | "More options" fold on Add a dish; editable later on the Menu page. | Never needed. |
| The tablet checklist (sound, keep the screen on, protect data, install, placement) | Menu, "Set up this tablet" only. The 8-second toast goes away. | Owner opens it. |
| Advanced settings and all back office pages | Back office, as today. | Owner opens it. |

## If they skip steps or leave

- **Close the tab after adding some dishes:** dishes save the moment each Save is tapped (the store persists every change). On return the board shows the menu in use; if no ticket exists yet the card from screen 3 shows ("Your menu has N dishes... New ticket").
- **Close it on a half-typed form:** the form keeps its draft text in this browser, so the owner returns to the same name and price. (To build.)
- **Return with zero dishes:** screen 1 again, unchanged.
- **Skip to New ticket with no dishes:** the order screen says "No dishes yet. Add your first dish" with a button into screen 2, not a sold-out wall.
- **Skip tax and hours:** tax 0% and hours stay as defaults; the owner sees one gentle line in Settings. Nothing is blocked.
- **Mistakes:** every dish row in the Menu page has Edit and Remove. Remove archives (past tickets keep the dish).
- **A "Finish setup" button is not needed.** Setup is done when there is one dish; there is no flag that can get stuck, so the welcome message can never outlive setup.

## Success measures

1. A person with no instructions adds **three dishes in under two minutes**, measured from tapping Add your first dish to the third dish showing in the list (target 6 typed fields, at most 3 tile taps, no list choices).
2. **Fresh install to first paid ticket in under ten minutes** (today's modeled best case is about 2 minutes, but that needs knowing the right buttons; the ten-minute target is for a real first-timer including reading and mistakes).
3. **Zero** items on screen that the owner did not enter, on first open and after the first paid ticket.
4. **Zero dead ends**: no tile that does nothing when tapped; no empty list that points at a filter instead of an action.
5. Observed, once Freddy or a pilot can try it: how many people find Add a dish without being told. This must be measured with real people; the script can only model time.

## What this changes in the code (for later rounds, not done now)

- First-run state and the welcome card: `src/js/70-floor-board.js:1687` to `1713`; the wizard file `src/js/77-floor-setup.js` is rewritten around screens 1 to 3, and its tax/hours/PIN steps move into a Settings page.
- Add a dish form: `src/js/84-office-data.js:496` to `560`, reshaped to three inputs plus a hidden "More options" fold, with an Add a dish entry point reachable from the board.
- Order screen empty and sold-out states: `src/js/71-floor-order.js` (A-others own it; only the "No dishes yet" and a sold-out tap message are needed).
- From A5: an empty first-run menu and ingredient list, and the sample menu loadable on demand with a Sample flag.
