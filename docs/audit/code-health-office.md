# Code health: the office files

Scope: `36-csv.js`, `37-retention.js`, `40-metrics.js`, `50-charts.js`, `80-` to `89-` office files and the office CSS (`30-` to `34-office*.css`, `40-charts.css`). Method: a script that finds locals declared once and never read, a script that finds exported members (`O.x`, `M.x`) used nowhere else (source, tests, tools), a script that lists each CSS class and whether its name occurs in any JS or the page template, and a function-length scan (acorn is in `/opt/npm-tools`). Verdicts below; only what was clearly dead was removed.

## Removed (dead, no behavior change)
| Where | What | Why it was dead |
|---|---|---|
| `50-charts.js` (bar, histogram and meter drawing) | `fontPx`, `marksOut`, `groupSlot`, `binW`, `hasText` | Declared, never read. |
| `82-office-money.js` | `const weekdayCard =` (the card call stays) | The binding was never used. |
| `84-office-data.js` `check()` of the restore card | `const evN = SB.engine.allEvents(s).length` | Never used, and it walked the whole event log every time a backup was checked. |
| `40-charts.css` | `.ch-meter-top/-l/-r/-st/-sub`, `.ch-ringwrap`, `.ch-ring-st`, `.ch-ring-sub`, `.ch-dim`, `.ch-big-h` | The HTML meter and ring parts were replaced by the SVG ones; no JS builds these classes and no class name is assembled from a prefix. |
| `31-office-money.css` | `.ob-sim-chip` | No user. |
| `32-office-data.css` | `.od-import`, `.od-swap .od-steps` | No user. |

## Kept on purpose (looked dead, is not)
- `.of-card--inset`, `.of-card--plain` (`of-card--` + `o.variant`), `.ch--spark` (`ch--` + chart type), `.ch-card` (documented optional wrapper), `.ch-scope` (documented opt-in theme scope).
- `M._rules` (profiling and tests, commented as such), `M.barPath` (a chart helper other files may reuse), `O.openInspectorLog` (the public entry that the Safety page button also uses).

## Duplicated helpers (listed, not merged)
- `isNum` is defined identically in 11 office files, `h = U.h` in 7, `money` and `ico` in 3 each. `U.isNum` exists in `00-util.js`, so each local copy could become `const isNum = U.isNum`. Left alone: each is a one-line helper inside its own closure and the change touches eleven files for no behavior gain. Verdict: leave; if the load order ever becomes fixed, move them to `SB.office.kit`.
- `SB.officeB` (defined in `82-office-money.js`, used by 83 and 85) is the shared helper set of three page files and has a historical name. Verdict: keep the name (renaming touches four files and the tests); documented in `docs/audit/office-architecture.md`.

## Long functions
Before: `82 render` 536 lines, `85 render` 422, `84 buildData` 409, `83 render` 398, `50 barDraw` 286, `lineDraw` 238.
After, split along the sections each page already had (a section is one `page.section(...)` heading with its cards; each moved block became a module-level function taking one `env` object with exactly the names it reads, and returning the names the rest of the page uses; no logic changed):
- `82-office-money.js`: `render` 536 to 133 lines; new `buildTakingsSection` (92), `buildSellsSection` (88), `buildMarginSection` (76), `buildYieldSection` (166).
- `85-office-stock.js`: `render` 422 to 277; new `buildClockSection` (55), `buildBurnSection` (47), `buildCostSection` (57).
- `84-office-data.js`: `buildData` 409 to 143; new `buildExportCard` (82), `buildImportCard` (123), `buildDangerZone` (75).
Still over 150: `buildYieldSection` (166, the yield chart plus two panels; the next seam is the what-if panel), `85 render` (277), `83 render` (398, not touched), `50 barDraw` and `lineDraw` (chart drawing code with many shared locals; splitting them needs a measured-layout object and is a larger change). Not done, listed for a later pass.

## Tests that guard this
All office unit suites (3 time zones), `reconcile`, `accounting`, `metrics-reference`, and the e2e set `office`, `office-b`, `office-data`, `office-closeday`, `office-sales-csv`, `office-month`, `office-undo-restore`, `print-qa` (see the report).
