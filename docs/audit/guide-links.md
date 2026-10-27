# Where to add the "?" help links (Guide round 3)

The Guide is an in-app screen at `#/guide/<page>`. Any screen can add a small round "?" that opens one Guide page. A4 has built the helper; the owners of each screen wire it in during a later round. A4 did not edit those files.

## The helper

```js
// Returns a small <a class="gd-help"> element (a round "?", 28 px, keyboard focusable, with an aria-label).
// Returns null in Node (tests), and SB.guide may not exist if 78-guide.js failed to load, so guard it.
const help = (page, label) => (SB.guide && SB.guide.link ? SB.guide.link(page, label) : null);
heading.appendChild(help('taking-an-order', 'taking an order'));   // appendChild/h() both skip null
```

- `SB.guide.link(page, label)`: `page` is a page id from the list below; `label` says what the help is about (it becomes "Help: label" for screen readers and the tooltip).
- `SB.guide.open(page)` does the same from a button: it moves to `#/guide/<page>`.
- Opening the Guide hides the board; "Back to the board" (or Escape) returns to the screen the device normally opens on. A sheet that is open when the link is clicked closes first in the usual way, so call `sheet.close()` before `SB.guide.open()` when the link sits inside a sheet.
- Styling is the `.gd-help` rule in `src/css/24-guide.css`. If a header needs a different size, add a modifier class there (ask A4).

## Page ids

getting-started, taking-an-order, running-the-line, hold-cabinet-and-warnings, closing-the-day, backup-and-restore, replacing-a-device, troubleshooting, empty-lost-or-locked, questions-and-answers, what-this-app-does-not-replace, and the printable cards card-opening-checklist, card-closing-checklist, card-when-something-goes-wrong.

## Suggested places

| Screen (file, owner) | Put the "?" next to | Opens | Label |
|---|---|---|---|
| Board header (70-floor-board.js, A1) | the Menu button area, or inside the Settings sheet's "More" list as a Guide entry (that entry is A1's round 3) | `getting-started` | "Smokebox guide" |
| Empty-board welcome card (70-floor-board.js, A1) | "Practice run (2 minutes)" | `getting-started` | "getting started" |
| New ticket screen (71-floor-order.js, A1) | the screen title | `taking-an-order` | "taking an order" |
| Kitchen board, a ticket's hint line or the board's first-run strip (70, A1) | the "Next step" line help | `running-the-line` | "reading a ticket" |
| Orders sheet (73-floor-orders.js, A1) and the Take payment sheet title | the sheet title | `getting-started` (payment is step 4) | "taking payment" |
| Hold cabinet sheet title (72-floor-sheets.js, A1) | the sheet title | `hold-cabinet-and-warnings` | "the hold cabinet" |
| Sound warning bar ("Tap here to turn on warning sounds") and the Sound block in Settings (70 and 72, A1) | the bar's text | `troubleshooting` | "no sound" |
| Set up this tablet, step 1 "Sound" and step 2 "Keep the screen on" (77-floor-setup.js, A2) | each step title | `troubleshooting` | "sound and sleep" |
| Dishes and prices sheet title (77-floor-setup.js, A2) | the sheet title | `getting-started` | "adding dishes" |
| Tax, hours and PIN sheet, PIN part (77, A2) and the PIN pad (60-shell.js, A1/A3) | under the pad: "Forgot the PIN?" | `empty-lost-or-locked` | "forgot the PIN" |
| Back office, Menu and settings, Data section "Export" (84-office-data.js, A3) | the Export heading | `backup-and-restore` | "backing up" |
| Back office, Data section "Import" and the step-by-step "Replacing this device" list (84, A3) | each heading | `replacing-a-device` | "replacing a device" |
| Back-up reminder banner ("Service is over", 60-shell.js banner text, A1/A3) | after the message | `backup-and-restore` | "backing up" |
| Close day (no screen exists yet; when it is built) | the screen title | `closing-the-day` | "closing the day" |
| Back office Safety page title (83-office-safety.js, A4 owns the text) | the page title | `hold-cabinet-and-warnings` | "the safety page" |
| Back office filters when a chart looks odd (80-office-core.js, A3) | the filter row | `troubleshooting` | "numbers that look wrong" |
| Any "What this app does" or About text (72 Help and about, 84 About this build) | the heading | `what-this-app-does-not-replace` | "what Smokebox does not replace" |

## Printable cards

Add a "Print the closing checklist" style link on the Back office close-of-day area and on "Set up this tablet": `SB.guide.open('card-closing-checklist')`. Each card page has a Print button; the print styles hide everything but the card.

## Wording that the Guide quotes

The Guide shows these names in bold as button labels. `test/guide.test.mjs` fails if one disappears from the source, so rename them together with `docs/sop` (then run `node tools/build-guide.mjs`): see the `labels()` list in the test output, or run `node -e "import('./test/_load.mjs').then(async m=>{const SB=await m.loadSB(['00-util','78-guide']);console.log(SB.guide.labels())})"`.
