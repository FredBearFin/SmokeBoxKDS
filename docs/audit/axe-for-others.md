Hand-off list for files owned by other teams (A1 floor and board, 70-76; A3 office, 80-89; A4 guide, 78-79). Nothing was sent to them.

**A3, office (src/js/84-office-data.js)**
- Rule `list` (serious), on the Office Data page and the Pilot report view, every look and size: `.od-toc-list`. The group headings are added as `h('li', { class: 'od-toc-group', role: 'presentation' }, ...)` (line 1832, in the `ORDER.forEach` that fills `tocList`). A list item with role presentation is not a list item, so the `ul` has a child that is not allowed. Plain fix: drop `role: 'presentation'` from that `li` (a plain `li` with the group name is allowed), or give each group its own nested `ul` under an `li`.

**A1, board (src/js/70-floor-board.js), found by hand, not by axe**
- Station tab names read "Fry station, FRY 1 tickets with work here" for a count of one (lines 631-632, the two `visually-hidden` spans added to each tab). Say "1 ticket" for one. Axe does not check wording, so this is a polish note, not a violation.
