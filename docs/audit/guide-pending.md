# Guide pages waiting for features (round 4)

Draft wording for things the Guide must explain once they are built. None of this is in the in-app Guide yet, on purpose: the Guide never describes a button that is not in the app. When a feature lands, check the real labels with `node tools/guide-walk.mjs` (add the new steps to it), move the text into `docs/sop/`, run `node tools/build-guide.mjs`, and run `node --test test/guide.test.mjs` (it checks that every bold name exists in the source).

Status when written (kds/deploy c2a8537): none of the items below was in the merged build. A1, A2, A3 and A5 were building them in their round 4.

## 1. Cooked-ahead dishes and "portions on hand" (A2; engine docs/smokebox.z.md section 6.4b)

What the engine already supports: a dish can be switched to count portions (`SetPortions`). Smokebox then keeps a hidden counted ingredient named after the dish, one portion per order, and a dish is sold out only when fewer than one portion is left ("I made 20" sells 20). Turning it off keeps the stock and the books. A dish with no recipe is never sold out by itself and records no cost. Cook-ahead food that must be held at temperature still uses a batch in the Hold cabinet and needs Cooking ahead set to Yes.

Draft page, "Counting portions" (replace the wording with the real button names):

> Some dishes you make ahead and sell until they run out, like 20 pulled pork sandwiches. Tell Smokebox how many you made and it counts them down. When the count reaches 0 the dish shows as sold out.
> 1. Open **Dishes and prices** and choose the dish.
> 2. Turn on [the counting switch] and enter how many portions you have.
> 3. When you make more, add the new count. [recount action: wording to be decided]
>
> Counting portions does not track temperature or time. If the food must be held hot or cold, use the Cabinet instead.

Open items for A2: where the switch and the number sit on the add-dish form; what "recount" is called; the careful default for a custom cook-ahead item (see decisions-for-freddy.md).

## 2. Closing the day (A3)

What exists today: the engine closes the day (refuses while orders are open; asks what happens to batches left in the cabinet: keep for tomorrow or discard). There is no screen. The current Guide page "Closing the day" is a manual routine and says so by its steps.

Draft replacement once a Close the day screen exists:

> 1. Tap **Close the day** [label to confirm].
> 2. If an order is still open, Smokebox lists it. Take payment on each one, or void it, then close again.
> 3. Choose what happens to food left in the cabinet: keep it for tomorrow, or throw it out. [only when Cooking ahead is Yes]
> 4. Read the day's totals, then save a backup.

## 3. Staff initials (A1)

Today initials are asked only when food is kept serving past its quality limit, when that is corrected, and in the thrown-out log (a column the owner fills in). They are remembered on the tablet for two hours. If A1 adds initials to more actions, add one line to Running the line and one to the thrown-out log step in Closing the day.

## 4. The demo as a separate mode (A5)

Design (docs/clean-start-design.md section 3.4): the demo becomes its own mode on its own storage, with a permanent "demo" bar and a "Back to my kitchen" button, and it never mixes with a real kitchen's data. Draft page, "Trying it out":

> Want to see Smokebox with food on it? Tap [Try the demo]. A bar at the top says Demo the whole time. Nothing you do in the demo touches your real kitchen. Tap [Back to my kitchen] to return.

Also update: the welcome screen button names, the Menu entry "Demo and clock", the Q and A answer "What does Practice mean?" and the card "When something goes wrong" if the demo can be mistaken for real data.

## 5. Units (A1/A2)

Settings already hold temperature (F or C) and weight (kg or lb) and the helpers format them, but there is no screen to change them in the merged build. When one appears: one short line in Getting started ("Choose degrees and kilograms or pounds under [screen]"), and check every weight and temperature the Guide mentions (the Guide says grams and kilograms only in ideas, never as numbers, so no rewrite should be needed).

## 6. Questions the Guide cannot answer yet

- Will the cabinet work on a new kitchen? The New batch Product list is empty because there is no way to create an ingredient on the add-dish form (see decisions-for-freddy.md, item 14).
- Is there a PIN reset? No. The Guide says so.
