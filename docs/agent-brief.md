# Brief for every wave-2 agent (read this first, then SPEC.md, then docs/design-notes.md)

## What this is
Smokebox KDS: a kitchen display and ticketing app for a BBQ restaurant, shipped as ONE self-contained offline HTML file, plus a hidden back office ("the office") full of charts about pace and ticket speed. The owner (Freddy) wants it **beautiful, super intuitive, with an amazing front end**, and he admired how lean the original 700-line file was. Lean means: no frameworks, no dependencies, no clutter, every element earns its place. It is a **separate app** from his other project, Pitcall. Do not touch anything outside `/home/claude/smokebox`.

## State of the code (wave 1 is finished and tested)
Read the code, not your memory of it. In `src/js/`:
`00-util` (SB.util) `05-icons` `10-config` `20-engine` (pure logic, total operations) `30-store` (state, clock, persistence, tab sync) `40-metrics` (analytics) `50-charts` (SVG charts) `60-shell` (SB.ui, SB.sheets, SB.router, SB.theme, SB.shell, ignition, PIN) `99-boot`. CSS: `00-tokens.css`, `10-base.css`, `40-charts.css`.

* **SPEC.md** is the contract. Section 0 (ground rules) binds you. **Section 20 (as-built addendum) overrides any earlier section it contradicts, and the code overrides both.**
* **docs/design-notes.md** lists every CSS token, class and UI component you may use (section 4). Use them; do not invent a parallel look. If a component you need is missing, build it in your own CSS file using the tokens.
* `SB.engine.ACTIONS` lists every action and payload. `SB.engine.describe(report, info, settings)` turns a refusal into human words.
* Dispatch user actions with `SB.store.dispatchEx(type, payload, {source:'ui'})` (records refusals for the friction analytics). Dispatch simulator actions with `{source:'sim'}`. Views never mutate state.

## Design standard (the quality bar)
The first thing people see should make them say "wow, that is a real product". Kitchen staff read it in one-second glances with greasy gloves; the owner reads the office on a tablet at night. Follow the design notes: tactile flat slabs, ticket slips that look like thermal-paper order tickets, sentence-case plain words, status = word + icon + colour, no decoration that does not carry meaning. UI-guide rules we follow: familiarity (kitchen words), consistency, minimal surprise, recoverability (undo/confirm), guidance (empty states say what to do next), diversity (Day/Night, large text, keyboard), instrument the interface. Veen: conventions, shallow structure, speed above flourish.

## Hard rules
1. Vanilla JS/CSS only. No external scripts. Own only your listed files. If you need a change in someone else's file, put it in your report.
2. Never rebuild a whole list/board on a timer. Update changed nodes only; the 1 Hz tick may only touch timer text and level classes. A tap must never be lost because the node under the finger was replaced.
3. Honesty: sample and demo data is labelled as such; channel sync is **simulated** and says so; starter numbers (prep times, yields, costs) are labelled "starter estimate" until confirmed; food-safety screens carry `SB.config.safetyLine`. Weights in grams/kilograms (never cups): use `SB.util.fmtG`.
4. Works from 280 px to 2560 px wide, no horizontal page scroll, long names wrap, 48 px touch targets (56 px for primary actions) on floor screens, visible focus, `prefers-reduced-motion` respected, contrast >= 4.5:1 (3:1 large/UI), no console errors.
5. Copy: sentence case, plain verbs, errors say what is wrong and how to fix it. No ALL-CAPS labels (stamps excepted), no "A · B · C" meta strings, no arrows in buttons, no eyebrow labels, no monospace small labels.
6. Handle every report from the engine with words a cook understands.

## How to build and test (do NOT use dist/smokebox.html: other agents build it at the same time)
```
node tools/build.mjs --out dist/<yourname>.html --quiet        # private build of everything currently in src/
node tools/test.mjs <pattern>                                    # node:test files; add yours as test/<name>.test.mjs
node tools/shot.mjs out.png --w 1280 --h 800 --hash '#/' --eval "..." --wait 800     # uses dist/smokebox.html unless you write your own script
```
For browser work write scripts that call `withPage({file: 'dist/<yourname>.html', w, h, hash}, async (page, logs) => {...})` from `tools/pw.mjs` (it clears storage once per run and collects `logs.errors` / `logs.pageErrors`; a clean run has both empty). Put screenshots in `test/.out/<yourname>/`. **Look at your screenshots with the Read tool** at 1280x800 and 390x844 (and 280 wide once) and fix whatever is ugly, cramped, overlapping or confusing before you report. Test Day and Night (and Ember/Paper for the office). Other agents' files may be half-written while you work; an error that comes from a file you do not own is not yours: wait a few minutes and rebuild, or stub it in your test.

Sandbox note: Google Fonts is unreachable here, so Barlow never loads and screenshots use fallback fonts; layouts must survive both.

## Reporting
Final report at most 25 lines: what you built, files, how to run it, what is incomplete or deviates from the contract, anything the lead must integrate, and honest known gaps. Append every defect you find and fix to `docs/findings.md` as a table row (`| # | what went wrong | fix | test |`, numbering `F-<yourarea>N`). If the harness refuses that write, put the rows in your report instead.
