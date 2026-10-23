# Keyboard-only audit of the back office

Test: `test/office-keyboard.e2e.mjs` (Playwright; only Tab, Shift+Tab, Enter, Space, Escape and the arrow keys; demo kitchen for the seven pages and the safety record, a real own kitchen with paid orders for the sheets and the Data page). Run: `node test/office-keyboard.e2e.mjs`.

## What is asserted
- **All seven office pages:** every control (links, buttons, inputs, selects, summaries, tab stops) is reached with Tab (the Data page has about 690); Tab never stalls (no keyboard trap); every stop is a visible element with a focus ring (computed outline or box shadow) that contrasts at least 3 to 1 with what is behind it (an outline is judged against the parent surface, since it is drawn outside the control); the tab order is the document order (no `tabindex` above 0) and inside each card the document order is also the visual order; headings never skip a level.
- **Arrow-key groups** (Date range, Data source, Rank items by, Show margin): one tab stop each, arrow keys move inside and keep focus in the group.
- **Buttons:** Space and Enter on "View as table" show and hide the table and keep focus on the button; Space on "Show report" shows the pilot report.
- **Sheets:** Close the day, the food safety record and Close the month: Enter on the opening button opens it, focus moves in, Tab (40 presses) and Shift+Tab never leave it, Escape closes it, and focus goes back to the button that opened it.
- **Erase box** on the Data page: Enter on "Erase tickets and records" opens the typed-word box and moves focus into it, the confirm button stays off until the word is typed, Escape closes only the box and gives focus back to the erase button.
- **Landmarks:** a navigation, one main area and one top heading in the back office.

## Found and fixed (my files)
| Where | Problem | Fix |
|---|---|---|
| `40-charts.css` `.ch-svg:focus-visible` | A chart that is a tab stop (the stock curve) showed a near-black ring (`rgb(16,16,16)`) on its dark surface: contrast 1.1 to 1. | The ring uses the chart's own text color (`--ch-text`), 3 px, offset 2 px. |
| `84-office-data.js` `askTyped` | Escape in the erase box was handled only on the input, and it did not stop the page-wide Escape (`60-shell.js` leaves the back office when nothing else handled the key), so Escape in the erase box threw the owner out of the back office and focus was lost. | Escape anywhere in the box now closes only the box, stops the event, and returns focus to the erase button. |
| Test harness | The Tab starting point survived page changes. | Not a product bug; the walk now starts at the first control. |

## For others (not changed)
No keyboard defects were found in the parts of other owners that the test touches: the segmented control (60-shell `SB.ui.segmented`, roving tabindex and arrows work), the sheet shell (`SB.ui.sheet`: focus in, trap, Escape, focus back), and A2's Close the month sheet (opens with focus inside, Tab stays inside, Escape returns focus to the card button).

## Not checked
- The restore confirmation dialog (`SB.ui.confirm`, shared) and the PIN keypad: they need a file or a PIN to reach.
- The thrown-out log sheet (A1, `76-floor-discards.js`, `.dlog-wrap`, `.dlog-table`) and the manager glance (`86-office-glance.js`, drawn on the board in wall mode): not walked.
- An early run of the test saw "View as table" press without a table after the arrow-key groups had been used; it was the test's stale button (the same button works by mouse and by keyboard, also after changing "Rank items by", checked in isolation), so the table check now runs first.
- Screen reader announcements (axe cannot judge them either); a real tablet keyboard.
