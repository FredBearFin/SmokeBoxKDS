# Bump-bar and keyboard keys on the kitchen board

A USB bump bar types like a keyboard, so it works by mapping its buttons to these keys in the bar's own setup tool. The board has no driver. The same list is in the Help sheet, Keys tab (it reads the board's own list, `F.shortcuts`).

## Ticket keys (pick a ticket, then act on it)

| Key | What it does |
|---|---|
| J or Right arrow (or Down) | Select the next ticket. The first press selects the first ticket. The selected ticket has a heavy dark outline. |
| K or Left arrow (or Up) | Select the previous ticket. |
| S | Start the next dish on the selected ticket (a two-step dish that is ready to start; the one that has waited longest). |
| F | Finish (done) the next dish on the selected ticket: a cooking dish whose time is up first, then one still cooking, then a one-step dish that is ready. |
| B or Enter | Bump the selected ticket. If dishes are not done it asks first ("Bump anyway?"). Enter does nothing special while a button has focus. |
| L | Bring back the ticket bumped last. |

Notes:
- With no ticket selected, S, F and B select the first ticket first.
- When the selected ticket leaves the board, the selection moves to the ticket now in its place.
- On a station tab (PIT, HOT and so on) S and F only touch that station's dishes.
- A second press on the same dish within 450 ms is ignored, as with a tap, so a bar that bounces cannot start and finish a dish.
- Start, finish and bump can be undone with Z for 10 seconds. A message says when there is nothing to start or finish.
- Keys are ignored while typing in a box, with a sheet or menu open, or with Ctrl, Cmd or Alt held.

## Other board keys (unchanged)

N new ticket, O orders, R recall sheet, H hold cabinet, 8 the 86 board, D demo, 1 to 6 station tabs, Z undo, ? help, Esc close or clear.

## Not verified

Tried with a computer keyboard in a test browser only. No real bump bar, and no real kitchen, has been used. Many bump bars send number keys by default; 1 to 6 switch station tabs here, so map the bar's buttons to the letters above.
