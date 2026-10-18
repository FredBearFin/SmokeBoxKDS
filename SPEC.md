# Smokebox KDS v2: build specification

Read this whole file before writing code. It is the contract between the agents building the app. If something here is wrong or impossible, fix it in the file *and tell the lead* in your final report; do not silently diverge.

Smokebox is a **separate app** from Pitcall (the BBQ cook-count phone app). They are cousins: Smokebox runs the live ticket screen during service; Pitcall decides the night before how many pieces to cook. Smokebox borrows Pitcall's *method and lessons* (section 3). Never edit anything outside `/home/claude/smokebox/`.

---

## 0. Ground rules for every agent

1. **Stack:** plain HTML + CSS + vanilla JavaScript (ES2020). No frameworks, no npm runtime dependencies, **no external scripts**. The only external resource allowed is the Google Fonts stylesheet already in the template (fallback stacks must make the app look fine without it). Icons and charts are drawn by us as inline SVG. The app must work **offline** from one file.
2. **Output:** `node tools/build.mjs` concatenates `src/css/*.css` and `src/js/*.js` (name order) into `dist/smokebox.html`. Test in a real browser with `tools/pw.mjs` / `tools/shot.mjs` (headless Chromium, Playwright). Logic modules also run in Node (`test/_load.mjs`, `node tools/test.mjs`).
3. **Module pattern:** every JS file is an IIFE: `(function (g) { const SB = (g.SB = g.SB || {}); ... })(typeof globalThis !== 'undefined' ? globalThis : window);` and exposes a namespace on `SB`. Logic layers (`util`, `config`, `engine`, `store` logic, `metrics`, `sim`) must not touch `document`/`window` at load time so Node tests can import them.
4. **Own your files only** (section 18). If you need a change in someone else's file, write it in your report; the lead integrates. Exception: tiny obvious bug fixes in `00-util.js`/`10-config.js` are fine if you list them.
5. **No throwing across module boundaries.** Engine operations are *total*: every input returns a report (section 9), never an exception. UI code must handle every report with human wording.
6. **Quality floor:** works at 280px wide through 2560px; visible keyboard focus; `prefers-reduced-motion` respected; text contrast >= 4.5:1 (3:1 for large text and UI borders); never colour alone (every status also has a word and/or icon); touch targets >= 48px on the floor screens (>= 56px for primary actions); no horizontal page scroll; long names wrap (`overflow-wrap:anywhere`). No console errors.
7. **Performance rule (Veen, "speed is the most critical factor"):** never rebuild the whole board every second. State changes re-render only what changed; the 1 Hz clock only updates text nodes/classes of timers. A tap must never be lost because a DOM node was replaced mid-press (the original file had this defect).
8. **Copy:** sentence case, plain verbs, specific. Buttons say what happens ("Send to kitchen", "Bump", "Mark done"). Errors say what is wrong and how to fix it, never apologise. Kitchen vernacular stays (fire, bump, recall, 86, expo, all-day, hold). Avoid: ALL-CAPS labels (allowed only for short status stamps like RUSH, 86, OVERDUE), "A · B · C" meta strings, "→" in buttons, monospace for small labels, eyebrow labels above headings.
9. **Honesty:** sample/demo data is always labelled as such in the UI. Channel sync (POS, delivery apps) is **simulated** and says so. Food-safety screens carry `SB.config.safetyLine`. Starter numbers (prep times, yields, costs) are labelled "starter estimate" until the owner confirms them.
10. **User preference:** all food weights in grams/kilograms (never cups). Show kg from 1000 g up (`SB.util.fmtG`).

---

## 1. Product

**One sentence:** a kitchen display system for a BBQ joint that routes every ticket item to the right station, paces items so a whole ticket finishes together, keeps stock and food-safety timers honest, and quietly records everything so the owner can open a hidden back office full of charts about how fast the line really is.

**What the original 700-line file did:** one static timer per ticket; station filter only hid whole tickets; no per-item routing; no all-day totals; bump did nothing to stock; passive safety text; hard-coded "7.8:1" contrast claim; **re-rendered the whole board every second** (taps can be lost).

**What v2 adds (traceability to the research report, `reference/research_report_foodservice_systems.pdf`):**

| Report gap | v2 feature | Section |
|---|---|---|
| Static ticket timer; no meal pacing | Item-level pacing: `D_max = max d(i)`, `O(i) = D_max - d(i)`, item shown when `now >= t_fire + O(i)`. Prep times are learned from actual line speed | 7.2, 7.8 |
| Station filter is cosmetic | True item routing to zones (pit, sides, fry, cold) + an expo view that sees whole tickets | 7.1, 14 |
| No all-day summary | All-day totals per station and overall, tap to highlight | 7.3, 14 |
| Bump does not touch stock; no 86 | BOM depletion on item done (`dS = sum w/Y * N`), auto-86 at threshold, simulated propagation to 4 channels inside 60 s | 7.4, 7.5 |
| Passive safety banners | Active gates: hold timers, temperature checks, lockout (item cannot be ordered), cooling stages, 4-hour sanitise timer | 7.6 |
| Static yield | Texas A&M thermal yield for brisket, true cooked cost | 7.7 |
| (UI guide) instrumentation for evaluation | Every action is logged; the back office shows pace, speed, errors, undo use | 12, 15 |

**Hidden back office:** tap the flame logo 5 times quickly (also `Ctrl/Cmd+Shift+O`, and `#/office`). An ember "ignition" transition reveals a dark analytics world with ~7 sections and ~25 charts. Optional PIN (keeps line cooks out; not real security, and says so).

**Priority tags:** `P0` must ship, `P1` should ship, `P2` ship only if everything else is solid.

---

## 2. Users and jobs

* **Line cook** (gloves, greasy hands, sun or dim light, glances for 1 s): sees only *their* items, knows what to start now, taps once. Must never be surprised.
* **Expeditor**: sees whole tickets and which items are done, assembles, bumps.
* **Cashier/counter**: enters orders fast; sees what is 86'd *before* promising it.
* **Owner/manager** (back office): wants to know "how fast are we, where does time go, what do we waste, when do we run out".

---

## 3. Lessons carried over from Pitcall (sibling app; same owner)

Pitcall was specified in Z notation (Wordsworth) and then inspected; 21 defects were found. Smokebox applies the same method and avoids the same traps.

1. **Z-style spec:** state + numbered invariants (section 10); every operation total (correct case + error cases that change nothing); property/fuzz tests that check invariants after *every* step of random action sequences; critical tests are mutation-checked (break the fix on purpose, the test must go red). `docs/smokebox.z.md` records the spec; `docs/findings.md` records defects found.
2. **Service night, not calendar day (F13):** `serviceDate = date(now - 4h)`; 12:45 am belongs to last night and is hour 24.75. Use `SB.util.serviceDate/serviceHour` everywhere. Never use the raw calendar date for tickets or analytics.
3. **Unknown is not zero (F4):** an unset timestamp is `undefined`, never `0`. A ticket with no `startedAt` has not been started. Metrics must skip, not zero-fill.
4. **Monotone timestamps (F6):** a later stamp is never earlier than an earlier one. `stampAfter(prev, now) = Math.max(now, prev)`. The virtual clock never goes backwards.
5. **Honest input is never refused (F19):** grams typed back from a displayed figure are accepted (rounding tolerance 0.5 g); refuse only real violations.
6. **Do not trust starter numbers:** like Pitcall's `confirmed:false`, starter prep times/yields are flagged and shown as estimates until confirmed in the back office.
7. **Safety constants are bounded parameters** (`SB.config.safetyBounds`; hot hold can never go below 135 F) and every safety message carries the "local health code overrides" line.
8. **Navigation is total and reversible (F21):** every URL hash maps to a view (unknown -> floor), a view's hash maps back to it, Back/Forward walk visited views, closing an overlay with its own button does not add history.
9. **Layout (F18, F20):** no control may leave its card at 280 px; long unbroken names wrap; number steppers never produce `1e+30`.
10. **Accessibility (F20d):** set `aria-selected / aria-expanded / aria-pressed / aria-checked` and roles on tabs, toggles, accordions.
11. **Contrast (Pitcall F section):** the research palette's Brisket Amber `#B85C38` on Parchment `#F5F2EB` is **4.06:1** (fails 4.5:1 for small text). Use `--amber-ink #A05031` (5.10:1) for small amber text; the exact amber stays for fills, borders, large glyphs. Zinc `#656E72` is 4.66:1 on parchment but 4.42:1 on the sub-surface `#EFECE6`: do not use it for small text on `--sub`. The original file's header claim "7.8:1" is not any real pair; charcoal on parchment is 14.34:1. The Specs panel must **compute** ratios from the live tokens with `SB.util.contrast`.
12. **Multi-tab = one state (F17):** committed writes are announced on a `BroadcastChannel`; other tabs reload. Separate *devices* cannot sync without a server (not built; say so in the About sheet).
13. **Backups:** export is refused rather than producing a file import would reject; import repairs repairable rows and refuses the rest, changing nothing on refusal.

From the UI guide (`reference/ui_design_slides.pdf`): *user familiarity* (kitchen words), *consistency* (same gesture, same result everywhere), *minimal surprise*, **recoverability** (10 s undo, confirm destructive actions, soft delete), *user guidance* (help sheet, helpful errors), *user diversity* (Day/Night, text size, keyboard shortcuts as the "command language" alongside touch), *analog vs digital presentation* (bars/meters for relative values like stock and progress, digits for precise values like timers), and **instrumentation of code to collect facility use and user errors** (-> the back office "line friction" panel).

From Veen (`reference/veen_art_science_web_design.pdf`): follow conventions (learned behaviour beats novelty), keep structure shallow (<= 2 levels), behaviour should be self-explanatory, and speed matters more than flourish.

---

## 4. Architecture and file layout

```
src/index.template.html     (shell owner)
src/css/00-tokens.css       design tokens (shell owner)
src/css/10-base.css         buttons, chips, sheets, toasts, forms, focus (shell owner)
src/css/20-floor.css        board + ticket cards (floor-board owner)
src/css/21-floor-sheets.css order entry, hold cabinet, 86 board, recall, demo (floor-sheets owner)
src/css/30-office.css       office frame and pages 1-3 (office owner A)
src/css/31-office-money.css pages 4-7 (office owner B; own file so A and B never edit the same CSS)
src/css/40-charts.css       chart tokens and chart styles (charts owner)
src/js/00-util.js           DONE: SB.util
src/js/05-icons.js          SB.icons.svg(name, {size, stroke}) -> SVGElement; SB.icons.html(name) -> string (shell owner)
src/js/10-config.js         DONE: SB.config
src/js/20-engine.js         pure logic: SB.engine (engine owner)
src/js/30-store.js          state container, clock, persistence, tab sync: SB.store (engine owner)
src/js/40-metrics.js        pure analytics: SB.metrics (metrics owner)
src/js/45-sim.js            seeded sample history + live demo traffic: SB.sim (metrics owner, wave 2)
src/js/50-charts.js         SVG chart library: SB.charts (charts owner)
src/js/60-shell.js          SB.ui (sheets, toasts, menus), router, theme, secret gesture, ignition (shell owner)
src/js/70-floor-board.js    header, station tabs, ticket board, all-day dock (floor-board owner)
src/js/71-floor-order.js    order entry sheet (floor-sheets owner)
src/js/72-floor-sheets.js   hold cabinet, 86 board, recall, demo, help/about, specs (floor-sheets owner)
src/js/80-office-core.js    office frame, nav, filters, tiles, tables, insights list (office owner A)
src/js/81-office-pace.js    Pace overview, Tickets, Stations pages (office owner A)
src/js/82-office-money.js   Menu and money page (office owner B)
src/js/83-office-safety.js  Safety page, Stock and 86 page (office owner B)
src/js/84-office-data.js    Data and settings page (office owner B)
src/js/99-boot.js           boot sequence (shell owner)
test/*.test.mjs             node:test files
docs/smokebox.z.md          Z-style specification (engine owner)
docs/findings.md            defects found and fixed (everyone appends a row for each defect they find)
```

**Data flow (MVC, UI guide slide 27):** `store` holds the model; `engine` is the pure controller logic; floor/office are views. Views call `SB.store.dispatch(type, payload)` and re-render from `SB.store.subscribe`. Views never mutate state.

---

## 5. Domain model

All times are epoch milliseconds in **virtual time** (`SB.store.now()`; equals real time unless the demo clock is sped up). Weights are grams. `undefined` means "not recorded" and is never replaced by 0.

### 5.1 Config items (see `10-config.js`)
`zone {id,name,long,code,icon}`, `channel {id,name,short,icon,warnSec,breachSec}`, `ingredient {id,name,unit('g'|'ea'),tcs,hold('hot'|'cold'),maxHoldH,parG,thresholdG,costPerKg|costEach,thermal?,yield?,yieldConfirmed?}`, `menu item {id,name,short,zone,cat,price,prepSec,track('one'|'two'),bom:[{ing,qty}]}`. The editable copies live in `state.menu` and `state.ingredients` (seeded from config) so the owner's edits persist. Each menu item in state also carries `prepConfirmed:false` (starter estimate flag) and `archived:false` (soft delete; never hard-delete a menu item that has history).

### 5.2 Ticket
```js
Ticket = {
  id: 't_17',               // unique, never reused
  num: 104,                 // display number, unique within serviceDate, starts at 101 each service day
  serviceDate: '2026-10-17',
  customer: 'Table 4',      // 1..40 chars
  channel: 'dine_in',       // config channel id
  createdAt: ms,
  rush: false,
  note: '',                 // <= 140 chars; shown prominently (allergy notes!)
  src: 'live' | 'demo' | 'sample',
  pacing: true,             // pacing setting when created
  dmaxSec: 300,             // D_max snapshot (0 when pacing off/rush)
  status: 'active' | 'expedited' | 'voided',
  expeditedAt?: ms, forced?: true,          // forced = bumped with undone items
  voidedAt?: ms, voidReason?: string,
  recalls: 0,                               // times recalled after a bump
  items: Item[]
}
Item = {
  id: 't_17.2',
  menuId, name, zone, qty, mods: string[],
  track: 'one'|'two',
  price: 14.00,             // unit price snapshot
  prepSec: 120,             // planned prep for this line = learned estimate x quantity factor, at creation
  offsetSec: 180,           // D_max - prepSec (0 when pacing off or rush)
  fireAt: ms,               // createdAt + offsetSec*1000
  status: 'queued' | 'displayed' | 'cooking' | 'done',
  firedAt?: ms,             // set when it becomes visible to its station (exactly fireAt unless overridden)
  override?: true,          // fired early by "Fire now"
  startedAt?: ms,           // two-step items only
  doneAt?: ms,
  depleted?: [{ing, g, batchId?, short?}],  // what was deducted from stock on done (needed for undo and cost)
  cost?: number             // ingredient cost of this line, set on done
}
```
Rules: `firedAt` exists iff `status !== 'queued'`; `startedAt` exists only for `track:'two'` and only if status is `cooking|done` (a two-step item may be completed without an explicit start only via "Mark done" shortcut: then `startedAt` is left `undefined`); `doneAt` exists iff `status:'done'`; `createdAt <= firedAt <= startedAt <= doneAt <= expeditedAt`.

### 5.3 Batch (hold cabinet)
```js
Batch = {
  id, ing, label: 'Brisket batch 3',
  kind: 'hot' | 'cold' | 'cooling',
  enteredAt: ms,                    // put into hold
  rawG?: number, cookedG: number, remainingG: number,
  yieldPct?: number,                // realised model/entered yield
  costPerCookedKg?: number,
  src: 'starter' | 'cook' | 'sample',
  temps: [{t, f}],                  // readings, oldest first
  lastTempF?, lastTempAt?,
  outSince?: ms,                    // first reading out of range (hot: < hotHoldF, cold: > coldHoldF) not yet corrected
  reheats: 0,                       // single reheat only
  coolStartAt?: ms,                 // kind 'cooling'
  status: 'ok'|'check'|'reheat'|'chill'|'discard',
  action: 'NONE'|'CHECK_TEMP'|'REHEAT_IMMEDIATE'|'CHILL_NOW'|'DISCARD_LOCKOUT',
  canServe: boolean,
  discardedAt?: ms, discardReason?: 'expired'|'temp'|'cooling'|'manual'|'quality'|'other', wasteG?: number
}
```

### 5.4 State
```js
state = {
  v: 1, rev: 0,
  settings: { pacing:{...config.pacing}, service:{...}, safety:{...}, channels:[{id,warnSec,breachSec}], undoMs, syncTargetSec,
              ui:{ theme:'day'|'night', textSize:'normal'|'large', sound:false }, office:{ theme:'ember'|'paper', pinHash:null } },
  menu: MenuItem[], ingredients: Ingredient[],
  tickets: Ticket[],               // oldest -> newest; pruned to config.limits.maxTickets (oldest completed first)
  batches: Batch[],
  stock: { [ingId]: number },      // non-TCS ingredients only; TCS stock is the sum of servable batch remainingG
  manual86: { [menuId]: { since: ms } },
  avail: { [menuId]: { ok, reason: null|'manual'|'stock'|'safety', ing: null|string, since: ms } },   // derived, kept for transitions
  syncs: [{ id, menuId, kind:'86'|'back', t, targets: { [targetId]: { dueAt, doneAt? } } }],      // simulated channel propagation
  learned: { [menuId]: { n, ema, est } },                                                          // seconds
  sanitize: { lastAt, dueAt },
  seq: { ticket: 0, byDate: { [serviceDate]: 100 } },
  events: Event[],
  undo: [{ id, label, at, expiresAt, kind, data }],
}
```
`settings.channels` overrides `config.channels` thresholds. The clock is **not** in `state` (store concern).

---

## 6. Event log

Every state change appends `{ id, t, type, ...fields }` to `state.events` (capped at `config.limits.maxEvents`, oldest dropped). Metrics read tickets *and* events. Types (fields in brackets are required):

`ticket_created[ticketId,num,channel,items,rush,src]`, `item_fired[ticketId,itemId,zone,menuId,override?]`, `item_started[ticketId,itemId,zone,menuId]`, `item_done[ticketId,itemId,zone,menuId,workMs,qty,cost,shortG?]`, `ticket_expedited[ticketId,totalMs,forced]`, `ticket_recalled[ticketId]`, `ticket_voided[ticketId,reason]`, `ticket_rush[ticketId]`, `avail_changed[menuId,ok,reason,ing]`, `sync_done[syncId,menuId,target,latencyMs]`, `batch_in[batchId,ing,cookedG,yieldPct,src]`, `temp_logged[batchId,f,onTime,lateMs]`, `batch_status[batchId,from,to,action]`, `batch_discard[batchId,ing,g,reason,cost]`, `batch_reheat[batchId,f]`, `cooling_started[batchId,ing,g]`, `sanitize_done[onTime,lateMs]`, `restock[ing,g]`, `stock_short[ing,g]`, `undo[label]`, `settings_changed[keys]`, `ui_report[action,report]` (a user action got a non-ok report: this is the "user error" instrumentation).

---

## 7. Engine (`SB.engine`, pure, no DOM, no clock: `now` is always passed in)

`apply(state, type, payload, now) -> { state, report, events, info }`. Returns a **new** state object (structural sharing is fine: copy only what changes) and never mutates the input. On any non-`ok` report the returned `state` is the *same reference* as the input (error aspects change nothing, Pitcall rule). `tick(state, now) -> { state, events }` handles time-driven transitions and returns the same reference when nothing changed.

### 7.1 Actions (`type`: payload)
| type | payload | notes |
|---|---|---|
| `createTicket` | `{customer, channel, items:[{menuId, qty, mods?}], note?, rush?, src?, createdAt?}` | refuses unavailable (86'd) items, empty orders, bad qty. `createdAt` override only for sim/seed. Routes by `menu.zone`, snapshots price/prep, computes pacing (7.2), assigns `num`. |
| `advanceItem` | `{ticketId, itemId}` | `displayed -> cooking` (two-step) or `displayed -> done` (one-step) or `cooking -> done`. Depletes stock on done (7.4), learns prep time (7.8). |
| `completeItem` | `{ticketId, itemId}` | shortcut straight to done from `displayed|cooking`. |
| `fireNow` | `{ticketId, itemId}` | queued -> displayed early; sets `override`. |
| `completeZone` | `{ticketId, zone}` | marks every not-done item of that zone done (station "all done"). |
| `bumpTicket` | `{ticketId, force?}` | needs all items done unless `force` (then `forced:true`). Sets `expeditedAt`. |
| `recallTicket` | `{ticketId}` | expedited -> active; `recalls++`; keeps item times. Stock is **not** restored. |
| `voidTicket` | `{ticketId, reason}` | reason required (`wrong order`, `customer left`, `dropped`, `other` or free text <= 40). Voided tickets are excluded from speed metrics but counted. |
| `setRush` | `{ticketId, on}` | turning rush on fires all queued items now (`offsetSec=0`, `override` not set). |
| `toggle86` | `{menuId, on}` | manual 86. |
| `restock` | `{ing, g}` | non-TCS: adds to stock. TCS: creates a `src:'cook'` batch via `addBatch` semantics with default temp. Use `addBatch` for the full flow. |
| `addBatch` | `{ing, rawG?, cookedG?, endpointC?, holdH?, tempF, label?}` | for thermal ingredients, `cookedG` is computed from `thermalYield`; else from static yield; or `cookedG` given directly. First temperature reading required (`tempF`). Stamps `enteredAt = now`. |
| `logTemp` | `{batchId, tempF}` | range 32..300. Updates `outSince`, may change status. Records on-time vs late. |
| `reheatBatch` | `{batchId, tempF}` | needs `tempF >= reheatF` and `reheats === 0` and still inside the grace window; clears `outSince`, `reheats++`. |
| `startCooling` | `{batchId, g?}` | P2. Moves remaining grams to a `kind:'cooling'` batch (not servable). |
| `discardBatch` | `{batchId, reason}` | wasteG = remainingG; remainingG = 0; `discardedAt`. |
| `sanitizeDone` | `{}` | resets the 4-hour timer, records on-time/late. |
| `updateSettings` | `{patch}` | validated against bounds (`config.safetyBounds`, thresholds); refuses out-of-range with the offending key. |
| `updateMenuItem` / `updateIngredient` | `{id, patch}` | whitelisted fields only (price, prepSec, prepConfirmed, bom, thresholdG, parG, yield, yieldConfirmed, costPerKg, name, archived). |
| `resetLive` | `{keepSettings?}` | clears live tickets/events/batches and restores starter stock. |
| `undo` | `{}` | reverts the most recent undoable action if inside `undoMs` (7.9). |

### 7.2 Routing and pacing (research: D_max, O(i), t_now >= t_fire + O(i))
* Each ticket line becomes one `Item` routed to `menu.zone`. Expo is a *view*, not a destination.
* `estimate(menuId) = learned[menuId].est ?? menu.prepSec`; `prepSec_line = estimate x min(qtyCap, 1 + qtyFactor x (qty - 1))`, floored at `floorSec`.
* `D_max = max(prepSec_line)`; `offsetSec = D_max - prepSec_line`; `fireAt = createdAt + offsetSec x 1000`. If `rush` or `!settings.pacing.enabled` -> all offsets 0 and `dmaxSec = 0`.
* `tick` moves `queued -> displayed` when `now >= fireAt` and sets `firedAt = fireAt` (exact planned time, not the tick time, so metrics are exact at any clock speed). "Fire now" sets `firedAt = now`, `override:true`.
* `pacingPlan(items, createdAt, settings, learned)` is exported so the order sheet can **preview** the plan ("Brisket fires now, slaw fires in 4:30").

### 7.3 All-day aggregator (research: `generateAllDaySummary`)
`allDay(state, zone?) -> [{ menuId, name, zone, required, queued, displayed, cooking, done, zoneBreakdown }]` over `active` tickets, excluding done items from `required`; sorted by `required` desc then name. `zone` filters to one station. `required` = sum of qty of not-done items.

### 7.4 Stock and depletion (research: `dS_m = sum_{k=1..N} w_m / Y_m`)
* On item **done**: for each BOM line, `need = bom.qty x item.qty`. TCS ingredients draw **first-in-first-out** from servable batches (`canServe`, oldest `enteredAt` first). Non-TCS draw from `state.stock`. Record `item.depleted` and `item.cost` (grams x cost per gram; thermal/static yield already priced into `costPerCookedKg`).
* If not enough servable stock exists the kitchen physically made the food anyway: deduct what exists, set the rest as `short` on the depletion record, log `stock_short`, and **never let stock go negative** (I1).
* Undo of a done restores exactly what `depleted` says, to the same batches (if a batch was discarded meanwhile, the grams are dropped and the undo reports `ok` with `info.partial=true`).

### 7.5 Availability, 86 and simulated channel sync (research: auto-86 inside 60 s)
* `availability(state, menuId) -> {ok, reason, ing}`: `manual` (toggled), else `safety` (a TCS BOM ingredient has no servable batch), else `stock` (any BOM ingredient with `servable - qty*1 <= 0` or `servable <= thresholdG`). Precedence manual > safety > stock.
* After every `apply`/`tick` the engine recomputes `state.avail`; each change appends `avail_changed` and creates a `syncs` record with a due time per target in `config.syncTargets` (random 2..40 s, deterministic from `hash(syncId)` so tests are repeatable). `tick` completes due targets and appends `sync_done` with `latencyMs`. All of this is a **simulation**; the UI says "Simulated, no live POS connected".
* `createTicket` refuses any line whose `avail.ok === false` with report `itemUnavailable` (+ `info.reason`). Tickets already in flight keep going.

### 7.6 Safety gates (research: `evaluateComplianceGate`; FDA Food Code 3-501.14/.16, 3-403.11, 4-602.11)
`gate(batch, now, safety) -> { canServe, action, reason, severity('ok'|'info'|'warn'|'bad'), status, nextDeadlineAt? }`

Hot (`kind:'hot'`):
1. `now - enteredAt > maxHoldH` -> `DISCARD_LOCKOUT` (`expired`).
2. `outSince` set (reading < `hotHoldF`): if `reheats >= 1` -> `DISCARD_LOCKOUT` (`temp`, single reheat only); else if `now - outSince > belowHotGraceH` -> `DISCARD_LOCKOUT` (`temp`); else `REHEAT_IMMEDIATE`, `canServe:false`.
3. `now - lastTempAt > tempCheckEveryMin` -> `CHECK_TEMP` (`canServe:true`, severity warn; > 2x interval -> still servable but severity bad).
4. else `NONE`.

Cold (`kind:'cold'`): 1 same expiry; 2. `outSince` set (reading > `coldHoldF`): `now - outSince > aboveColdGraceH` -> discard (`temp`), else `CHILL_NOW`, `canServe:false`; 3. temp check due; 4. `NONE`.

Cooling (`kind:'cooling'`, P2; never servable): needs a reading <= `cooling.stage1ToF` by `coolStartAt + stage1H`, else `REHEAT_IMMEDIATE` (reheat to `reheatF` and restart cooling); needs <= `cooling.finalF` by `coolStartAt + totalH`, else `DISCARD_LOCKOUT` (`cooling`).

This **deliberately differs** from the report's sample code in one place: the report measures "below 135F for more than 2 h" from the time food was pulled from heat; we measure from the first out-of-range *reading* (`outSince`), otherwise a batch that dipped for a minute at hour 3 would be wrongly discarded while one that has been cold for 2 hours but is still inside its 4-hour hold would be wrongly passed. Record this in `docs/findings.md`.

`tick` re-evaluates every batch; on a status change it appends `batch_status`; on `DISCARD_LOCKOUT` it discards the batch automatically (`wasteG`, `batch_discard`), which may flip `avail` to `safety` and so 86 items. Sanitise: `state.sanitize.dueAt = lastAt + sanitizeEveryH`; overdue is a warning surfaced in the header, never a block.

Every UI string about safety limits ends with `SB.config.safetyLine`.

### 7.7 Thermal yield (research: Texas A&M regression)
`thermalYield({endpointC, holdH, rawG, costPerKgRaw}) -> {hotPct, chilledPct, cookedG, trueCostPerCookedKg}` with `endpointC` clamped to [75, 90], `holdH` to [0, 3], `hot = 72.9 - 0.85 x (T - 75) - 2.1 x hold`, `chilled = max(45, hot - 2.1)`. Brisket (`thermal:true`) uses `hotPct` for a batch going straight into hot hold. Other ingredients use `ingredient.yield` (static, flagged unconfirmed). `trueCostPerCookedKg = costPerKgRaw / (pct/100)`. Also export `staticYieldComparison` so the back office can show "the static 50% assumption would misprice this batch by X%".

### 7.8 Learning prep times (Pitcall shrinkage idea)
On item done: `sample = (doneAt - (startedAt ?? firedAt)) / 1000 / qtyScale`, capped at `outlierFactor x starterPrepSec`, ignored when the item was a forced/overridden completion or the ticket was voided. `n++`, `ema = n===1 ? sample : 0.8 ema + 0.2 sample`, `est = clamp((n x ema + K x starter)/(n + K), minFactor x starter, maxFactor x starter)`. New tickets use `est`. The back office shows starter vs learned.

### 7.9 Undo (Pitcall: 10-second undo)
Undoable: `advanceItem`, `completeItem`, `completeZone`, `bumpTicket`, `voidTicket`, `toggle86`, `fireNow`, `discardBatch`, `sanitizeDone`. Each pushes `{id,label,at,expiresAt,kind,data}` where `data` carries the *inverse* (before-values and stock deltas), not a snapshot, so undoing A does not clobber an unrelated B. `undo` reverts only the newest entry still inside `undoMs`. If the thing it touches has changed since (e.g. the ticket was bumped after the item undo), report `undoConflict` and change nothing. Events from an undone action are marked `{reverted:true}` (not deleted) so metrics can ignore them.

### 7.10 Other exports
`ticketTiming(ticket, now, settings) -> {elapsedMs, level:'ok'|'warn'|'breach', warnMs, breachMs, pct}`; `ticketProgress(ticket)`; `newState(opts)` (starter batches and stock; `opts.empty` for tests); `checkInvariants(state, now?) -> string[]` (empty = healthy); `validateBackup(obj) -> {ok, state?, error?, repaired:[]}`; `REPORTS` (id -> human message); `serialize/deserialize`.

---

## 8. Store (`SB.store`)

* `init()` loads `smokebox.v1.state` (falls back to `newState`), restores the clock, starts the 1 Hz ticker, installs `BroadcastChannel('smokebox')` (reload on newer `rev`) and `pagehide`/`visibilitychange` flush. Never throws if storage is blocked (`SB.util.storage`).
* `getState()`, `now()`, `dispatch(type, payload, {source:'user'|'sim'}) -> report`. When `source:'user'` and the report is not `ok`, a `ui_report` event is appended (instrumentation).
* `subscribe(fn) -> unsubscribe`: called after state changes, coalesced to one call per animation frame. `subscribeTick(fn)`: called every second with `now` (for timer text only; keep handlers cheap).
* `select` helpers: `activeTickets()`, `ticketsForZone(zone)` (tickets with at least one not-done item in that zone, each reduced to that zone's visible items + a count of on-deck items), `expoTickets()`, `recent(n)` (expedited, newest first), `allDay(zone)`, `availability(menuId)`, `unavailable()`, `batches()`, `counts()` (per station and overdue counts), `dataset({sample:true|false})` -> `{tickets, events, batches, learned, menu, ingredients, settings, range:{from,to}}` combining live state with `SB.sim.sample()` when requested.
* **Clock:** `{base, realBase, speed}`; `now() = base + (Date.now() - realBase) x speed`. `setSpeed(x)` rebases (never jumps). Speed resets to 1 on reload and continues from the last virtual time (time never goes backwards). The UI shows a "Demo x5" chip whenever `speed !== 1`.
* **Persistence:** debounced write (400 ms) of `{v, savedAt, rev, clock, state}`; flush on `pagehide`. Prune per `config.limits`. If a stored payload fails `validateBackup`, keep it under `smokebox.v1.corrupt` and start fresh (never crash on bad storage).
* `exportAll() -> string(JSON)`, `importAll(text) -> report` (via `validateBackup`; refuses oversize exports like Pitcall PO4c), `exportCsv('tickets'|'items'|'events'|'batches')`.
* `reset()`/`resetLive`.
* The sim registers itself with `SB.store.attachSim(sim)` so `dataset({sample:true})` can pull sample history lazily.

---

## 9. Reports (total operations)

Every `apply` returns `report` from this closed set; `SB.engine.REPORTS[report]` is the plain-English message shown in a toast (include the fix: "Pick at least one item before sending.").

`ok, unknownAction, unknownTicket, unknownItem, unknownMenu, unknownBatch, unknownIng, emptyOrder, badQty, tooManyItems, badCustomer, badChannel, noteTooLong, itemUnavailable, ticketNotActive, ticketNotExpedited, notAllDone, alreadyDone, alreadyFired, notQueued, nothingToDo, reasonRequired, badTemp, tempTooLow, notReheatable, notEnoughData, batchNotServable, badWeight, badPatch, outOfBounds, undoExpired, undoNothing, undoConflict, invalidBackup, exportTooLarge, storageBlocked`

---

## 10. Invariants (Z-style; the property tests check these after every step)

* **I1** `stock[ing] >= 0` and every `batch.remainingG >= 0`.
* **I2 ledger:** for each ingredient, `opening + restocks + batch intakes - sum(item.depleted g not reverted) - waste = current servable + non-servable remaining` (within 0.5 g).
* **I3 item time order:** `createdAt <= firedAt <= startedAt <= doneAt` wherever defined, and `firedAt` defined iff `status !== 'queued'`.
* **I4** `ticket.status === 'expedited'` and not `forced` => every item `done`. `expeditedAt >= max(doneAt)`.
* **I5 pacing:** `offsetSec = dmaxSec - prepSec` (or 0 under rush/pacing off), `0 <= offsetSec <= dmaxSec`, `fireAt = createdAt + offsetSec x 1000`.
* **I6** every `item.zone` equals the menu zone at creation; no item is routed to `expo`.
* **I7 availability:** `createTicket` of a line with `avail.ok === false` is refused and state is unchanged.
* **I8 lockout:** a batch with `canServe === false` or `status === 'discard'` never contributes to servable stock and is never drawn from.
* **I9** `state.events` is non-decreasing in `t`; the store clock is non-decreasing.
* **I10** ticket `num` is unique within a `serviceDate`; ticket and item ids are unique.
* **I11** voided tickets have a reason; `recalls >= 0`; recalled tickets are `active`.
* **I12 totality:** `apply` with arbitrary junk (unknown ids, NaN, negative, huge, wrong types) returns a report from the closed set, never throws, and on non-ok returns the *same state reference*.
* **I13 undo:** `undo(apply(s, a))` restores every field the action changed (ignoring `events`, `undo`, `rev`) when nothing else happened in between.
* **I14** `learned.est` stays inside `[minFactor, maxFactor] x starter`.
* **I15** `avail` equals `availability()` recomputed from scratch after every apply/tick.

---

## 11. Sample history and demo traffic (`SB.sim`, wave 2)

* `SB.sim.sample()` -> deterministic (seed `20261017`) dataset of **14 service days ending yesterday**, ~11:00-21:00, weekday and lunch/dinner shaped, channel mix (dine-in 38%, takeout 30%, drive-thru 20%, delivery 12%), Friday/Saturday busier, one storm-slow day and one surge day. It is produced by driving the **real engine** through a virtual clock with a simulated crew (log-normal item times around "true" prep times that differ from the starter estimates for some items, e.g. mac and cheese really takes ~6:30, fried pickles ~4:30), occasional forced bumps, voids, recalls, 86s, batch intakes with temperature logs (a few missed checks, a few discards), sanitise logs. Days 1-5 run with pacing **off**, days 6-14 with pacing **on**, so the comparison charts have both sides; the Data page says so. Sample tickets have `src:'sample'`.
* Memoised; generation must take < 1.5 s in Chromium for 14 days (~170 tickets/day).
* `SB.sim.live` demo controller: `start({rate:'slow'|'normal'|'rush'})`, `stop()`, `burst(n)`, `crew(on)`, `status()`. Orders arrive as a Poisson stream shaped by the hour; the **crew** advances items after realistic durations (via `store.dispatch(..., {source:'sim'})`); expo bumps after a short delay. Everything runs on **virtual time**, so the clock-speed control (x1/x5/x15/x30) speeds the whole kitchen up.
* `SB.sim.seedFirstRun()` creates 5 starter `demo` tickets at ages 40 s, 2 m, 5 m, 9 m, 14 m (so ok/warn/breach all show) the first time the app opens with no stored state.

---

## 12. Metrics (`SB.metrics`, pure; input is a dataset from `SB.store.dataset`)

All functions take `(dataset, opts)` where `opts = {from, to, channel?, zone?, includeVoided?:false}` and return plain objects/arrays (no DOM). They skip, never zero-fill, unknown values.

* **Ticket anatomy (critical-path decomposition).** For each expedited ticket, `critical = item with max doneAt`. `holdMs = critical.firedAt - createdAt` (pacing hold, by design), `responseMs = (critical.startedAt ?? critical.doneAt) - critical.firedAt` when `startedAt` exists else `0` and `workMs = critical.doneAt - firedAt`, `workMs` if started else folded into response, `dwellMs = expeditedAt - critical.doneAt` (expo dwell). They sum exactly to `totalMs = expeditedAt - createdAt`.
* **Plate sync.** `spreadMs = maxDone - minDone`; `lampMs = mean over items of (maxDone - doneAt_i)` (average time finished food waits for the last item: the real quality cost of no pacing).
* **SLA.** `level` from channel thresholds on `totalMs`; `onTimePct = share with total < warn`.
* **Summary:** `count, avg, median, p90, p95, onTimePct, overdue, warn, avgSpread, avgLamp, perHour, itemsPerHour, voids, recalls, forced, overrides`.
* **Pace index (live):** median `totalMs` of the last 10 expedited tickets within 45 min divided by the channel-mix weighted warn threshold. < 0.8 comfortable, 0.8-1 busy, > 1 behind.
* Breakdowns: `byHour` (serviceHour), `byWeekdayHour` heatmap, `byChannel`, `byZone` (item response/work/done counts), `byItem` (sold, revenue, cost, margin, avg work, learned vs starter), `byDay` (trend), `throughput(bucketMin)`, `histogram(values, binSec)`, `queueLoad(bucketMin)` (open items per zone over time, reconstructed from firedAt/doneAt).
* **Pacing A/B:** `pacingCompare` -> spread and lamp time and median total, pacing on vs off (from ticket `pacing` flag).
* **Calibration:** per menu item starter prep, learned prep, observed median work; flag items whose observed/starter ratio is outside 0.8..1.25.
* **Stock/86:** `stockBurn(day, ing)` (grams over time from `item_done` depletion + batch intake), `sellOutClock(days)` (first `avail_changed ok:false reason stock|manual` time per protein per day versus close hour), `syncLatency` (median, max, within-60-s share).
* **Safety:** `compliance` (temp checks on time %, late checks, lockouts, discards by reason with grams and cost, sanitise on-time %), `wasteByDay`, `batchTimeline(day)`.
* **Money:** `revenueByHour`, `avgTicketValue`, `foodCostPct` (item cost / price), `marginByItem`, `yieldComparison` (static assumption vs thermal model vs realised).
* **Line friction (UI guide instrumentation):** undo count and rate, `ui_report` counts by report type (top error reasons), forced bumps, fire-now overrides, recalls, voids.
* **Insights:** `insights(dataset, opts) -> [{id, tone:'good'|'info'|'warn'|'bad', title, body, metric?}]`, rule-based and deterministic, at most 8, each referencing real numbers (examples: "Takeout ran 2m 10s slower than dine-in between 12 and 1 pm", "Mac and cheese takes 6m 31s on your line, 2m 11s over the starter estimate; pacing now plans for it", "Brisket went 86 at 1:42 pm, 7 hours before close: Pitcall would add ~2 briskets", "Pacing cut finished-food waiting from 3m 05s to 0m 48s per plate").

---

## 13. Charts (`SB.charts`, charts owner). Read the `dataviz` skill first and follow it (validate palettes with its script; light and dark both).

Every constructor: `SB.charts.<type>(containerEl, spec) -> { update(spec), destroy() }`. SVG, responsive via `ResizeObserver` (viewBox from measured width, fixed or spec'd height), crisp 1-2 px marks, thin recessive grid, hover/tap tooltip layer (crosshair on line/area), keyboard focusable marks with `aria-label`, `View as table` toggle (`spec.table !== false`), reduced-motion safe, empty state ("No data in this range"), `spec.title` and `spec.sub` rendered as an accessible header by the library.

* `line`: `{series:[{id,name,points:[[x,y],...],area?:bool,dash?:bool,tone?}], x:{type:'time'|'linear'|'cat', format, min?, max?}, y:{min?,max?,format,label?}, bands?:[{x0,x1,label}], bandY?:[{y0,y1,label}], refLines?:[{y|x, label, tone:'warn'|'bad'|'ok'|'muted'}], annotations?:[{x,y,label}], height?}`
* `bar`: `{orient:'v'|'h', categories:[], series:[{id,name,values:[]}], stacked?, labels?:'auto'|'none'|'all', refLines?, format, sort?:'desc'|'asc'|'none', tones?:[]}` (value labels on the ends for few bars; direct labels).
* `hist`: `{values:[], binSize, min?, max?, format, refLines?, series?:[{name,values}] (overlay or small multiples)}`
* `heat`: `{rows:[], cols:[], values:[[]], scale:'seq'|'div', format, legendLabel}` (cells with value tooltips; text in cell only if it fits).
* `scatter`: `{series:[{id,name,points:[[x,y,label?]]}], x:{...}, y:{...}, refLines?}`
* `dumbbell`: `{rows:[{label,a,b,aLabel,bLabel,flag?}], format}` (starter vs learned; gap emphasised).
* `gantt`: `{rows:[{label, segments:[{start,end,tone,label?}], marks?:[{at,label}]}], x:{type:'time'|'sec', format}}` (ticket anatomy; batch timelines).
* `meter`: `{value, max, warn?, breach?, label, format}` (bullet/relative-value bar; stock levels, pace).
* `ring`: `{value, max, label, sub}` (single big pace ring; allowed because it is one headline value, not part-to-whole).
* `spark`: `{values, area?, ref?}` tiny inline.
* `stack`: `{categories, parts:[{id,name,values}]}` horizontal 100%/absolute stacked with 2 px surface gaps (ticket anatomy, status mix).
* `refreshTheme()`: re-read tokens after the office theme toggles.
* Tokens: charts read **only** `--ch-1..--ch-8` (categorical, fixed order), `--ch-seq-1..7`, `--ch-div-n3..n1, --ch-div-0, --ch-div-p1..p3`, `--ch-ok/--ch-warn/--ch-bad`, `--ch-grid`, `--ch-axis`, `--ch-text`, `--ch-text2`, `--ch-surface`, defined by the charts owner in `40-charts.css` for `.office[data-otheme="ember"]` and `.office[data-otheme="paper"]`. Status colours always ship with an icon/word. No pies, no dual axes, no 3D.

---

## 14. Floor UI (the line)

### 14.1 Design language
Paper order tickets on a kitchen rail. Parchment page, white thermal-paper slips with a **torn zigzag bottom edge**, a metal clip at the top, a perforation between header and items, a rotated stamp for RUSH. Barlow Condensed for ticket numbers, timers, headings and stamps; Barlow for everything else; tabular figures for every number that changes. The research palette is the brief (keep it): Parchment `#F5F2EB`, Charcoal `#1E2224`, Zinc `#656E72`, Brisket Amber `#B85C38`, Sage `#5F7466`, Overdue `#9B2C2C`, Card `#FFFFFF`, Sub `#EFECE6`; small amber/sage text uses `--amber-ink #A05031` / `--sage-ink #576B5E`. **Day** (default, anti-glare) and **Night** (charcoal) looks, toggle in header menu, persisted; Night colours must also be contrast-checked. Large text option (+20%).
Station identity is **icon + 3-letter code + hue** (PIT/HOT/FRY/CLD/EXP), never hue alone. Time state is **word + icon + colour**: OK (no badge), WARN `clock`, OVERDUE `alert` with pulsing border (pulse disabled under reduced motion).
Motion budget: a new ticket "prints" into the rail (one short slide/unfold, plus an optional chime); item completion ticks with a small press; the ignition transition is the one big moment. No scroll-triggered or hover-everything animation.

### 14.2 Layout (landscape tablet 1280x800 is the primary target; scales down to a phone and up to a wall monitor)
```
+--------------------------------------------------------------------------------------------------+
| [flame] Smokebox      ALL 7 | PIT 3 | HOT 2 | FRY 1 | CLD 2 | EXPO 4        Sanitize 1:12  Hold 2!  86 board 1 |
|                                                          [Demo x5]  [Recall 6]  [Hold]  [New ticket] [menu]|
+--------------------------------------------------------------------------------------------------+
|  ticket slip   ticket slip   ticket slip   ticket slip       <- auto-fill grid, oldest first, rush first
|  #104 Table 4  #105 Pickup   #106 Drive 3  ...
|  ...                                                                                              |
+--------------------------------------------------------------------------------------------------+
| ALL-DAY  Brisket 1/2 x6 | Mac x4 | Slaw x3 | Fried pickles x2 | ...  (tap an entry to highlight)    |
+--------------------------------------------------------------------------------------------------+
```
* **Header:** brand mark (secret gesture target, section 15.1), station tabs with live counts and an overdue dot, status chips (sanitise countdown, hold-cabinet attention count, 86 count, demo clock), actions. The channel/sync health chip lives in the 86 board.
* **Station views** (`#/s/pit` etc., pinnable per tablet): tickets that have at least one not-done item for that station; each slip shows only that station's items (displayed + cooking prominent, on-deck items dim with a `fires in 2:10` countdown and a **Fire now** button). Header of the slip: big number, customer, channel icon+word, age timer with level, progress bar. Tap an item row = advance (start -> done, or done for one-step items). A per-slip **All done here** button completes the station's items. When a station finishes its items the slip leaves that station and stays on Expo.
* **Expo view:** whole tickets; every item with a zone chip and status (holding, firing, cooking, done); the slip is "ready to bump" when all done: the **Bump** button becomes the primary sage button; bumping early asks "2 items not done. Bump anyway?" (confirm).
* **All view:** whole tickets with every item actionable and Bump available (single-screen kitchens).
* **Ordering of slips:** rush first, then oldest. Overdue slips get the pulsing border and move no position (do not reshuffle under a cook's thumb); sorting happens only when slips are added/removed.
* **Notes/allergies** render in a bordered amber note strip with an alert icon, always above the items. Modifiers render as bold chips under the item name.
* **All-day dock:** one line of chips (name x count), sorted desc, bar-per-chip showing done/required, scrollable, collapsible; on a station view shows that station's totals first. Tapping a chip highlights every matching item on the board.
* **Toasts and undo:** a bottom-centre toast with **Undo** and a draining 10-second bar after bump/done/void/86/discard. Reports render as toasts with `SB.engine.REPORTS` text.
* **Empty state:** "No tickets right now." with **New ticket** and **Start demo** buttons.
* **Keyboard (command alternative):** `N` new ticket, `R` recall, `H` hold cabinet, `8` 86 board, `D` demo, `1..6` stations, `Esc` close sheet, `Z` undo. Shown in the Help sheet.
* **Sound:** optional chime on new ticket (WebAudio, generated, off by default, toggle in menu).

### 14.3 Sheets (modal panels; full-screen on phones, right-hand panel on tablets; focus-trapped, `Esc` closes, `role="dialog"`)
1. **New ticket (order entry), P0.** Left: category tabs + big item tiles (name, price, 86 state: "86 sold out" / "86 safety hold" / "86 manual", disabled with reason); search-as-you-type filter; **Quick combos**. Right: order list with qty steppers (+/-, 44px), per-line modifier chips (from `config.modifiers` + free text), customer (chips for quick names + text), channel segmented control, note, **Rush** toggle, a live **plan preview** (each item's fire time under pacing: "Brisket 1/2 fires now, Slaw in 4:30. Ready together at about 6:00"), subtotal, and **Send to kitchen** (big, primary). "Repeat last order". Validation inline (empty order, too long name). On send: slip prints in, sheet closes, toast "Ticket #106 sent to 3 stations".
2. **Hold cabinet (batches), P0.** Cards per batch: product, kind, remaining g as a meter, time in hold with a ring to the max, last temp + due-in countdown, status badge with action text (Check temp, Reheat now, Chill now, Discard), buttons **Log temp** (big numeric stepper in 1-degree and 5-degree steps), **Reheat** (log >= 165 F), **Discard** (reason). **New batch** form: product, raw weight g, endpoint C (default 85) + hold h (default 2) for thermal products, shows *expected yield %, expected cooked g, true cooked cost per kg versus the static 50% assumption*, first temperature. Safety line shown. P2: **Start cooling** with a two-stage progress bar.
3. **86 board and stock, P0.** All menu items with availability state, ingredient meters (grams remaining vs threshold, par), manual 86 toggle (confirm to un-86 a safety hold: not allowed while the batch is locked), **Restock** for non-TCS, simulated channel sync strip: four chips (Counter POS, Online ordering, Drive-thru board, Delivery apps) showing "synced 14 s after 86" or "syncing...", labelled **Simulated: no live POS connected**.
4. **Recall, P0.** Recently bumped (newest first) with total time and level, **Recall** button; second tab **Voided** (reason). Search by ticket number.
5. **Demo, P0.** Auto orders (Off, Slow, Normal, Lunch rush), Auto crew on/off, Clock speed x1/x5/x15/x30, **Add 12-ticket rush**, **Reset live data** (confirm), sample history on/off with counts.
6. **Help and about, P1.** Gestures, keyboard shortcuts, what each colour/word means, the safety line, "separate devices do not sync yet", a tiny line "Managers: tap the flame five times."
7. **Specs, P1.** The palette with **computed** contrast ratios (`SB.util.contrast`), what changed from the original file, and honest notes (not tested in real sunlight).
8. **Void ticket / Bump anyway / Discard batch / Reset** confirmations: one reusable confirm dialog with the consequence spelled out.

### 14.4 Settings reachable from the floor menu
Theme (Day/Night), text size, sound, pinned station, clock speed shortcut, link to Help/Specs/Demo. Business settings (thresholds, menu, BOM) live in the back office only.

---

## 15. Back office (the hidden world)

### 15.1 Entry and exit
* Secret gesture: **5 taps on the flame mark within 2.5 s** (taps 3 and 4 flicker the flame slightly; no other hint). Also `Ctrl/Cmd+Shift+O` and `#/office[/section]`. If a PIN is set, a keypad asks first (wrong PIN shakes; 5 wrong tries = 30 s lock). The PIN is hashed with SHA-256 (WebCrypto, fallback to a simple hash), and the Data page says it keeps line cooks out, not attackers.
* **Ignition transition (~900 ms):** the board dims, an ember ring expands from the flame (CSS `clip-path: circle()` reveal of the office layer), a few smoke wisps drift, the office fades its first content in. Reduced motion: 150 ms cross-fade. Exit: **Back to the line** button, `Esc`, or browser Back; reverse wipe.
* Office is a separate full-screen layer inside the same page; the floor keeps running underneath (timers, sim).

### 15.2 Look
Dark "Ember" world (default) versus the bright anti-glare floor: deep charcoal ground, warm bone text, ember-orange accent, sage and crimson for good/bad, thin lines, generous space; `data-otheme="paper"` is a light alternative (toggle in the header). Left rail navigation (icons + words) collapsing to a bottom bar on phones. **Sticky filter bar:** range (Today, Yesterday, Last 7 days, Last 14 days, Custom), channel, data source (Live only / Live + sample), and a one-line **data banner**: "14 sample days plus 23 live tickets. Sample data is generated by the simulator." Each page: a short plain-language headline answer at the top (generated from the data), then charts, each with a one-sentence "what to look for" caption. Every chart can **View as table**. Every KPI tile shows value, unit, comparison against the previous equal period (arrow + word, not colour alone) and a sparkline.

### 15.3 Sections (each a hash route `#/office/<id>`)
1. **Pace** (default). Tiles: median ticket time, p90, on-time %, tickets per hour, plate sync (avg spread), 86 events. The **pace ring** (live "Pace index vs target" for the last 10 tickets). Hero chart: ticket time by hour of service, today versus the 14-day band (median and p10-p90 band). Throughput strip (tickets per 15 min) aligned under it. **Insights** list (rule-based). Pacing A/B card (finished-food waiting time, on vs off).
2. **Tickets.** Histogram of ticket times with warn/breach lines, overlay by channel. **Where the time goes**: stacked anatomy (pacing hold, station response, work, expo dwell) by channel and by hour. Weekday x hour heatmap of median ticket time. Slowest tickets table (click = **ticket anatomy gantt**: each item's fire/start/done bar against the ticket clock). On-time % trend by day.
3. **Stations.** Open-item load per station over the service day (stacked area/lines), response time (fired to first touch) and work time by station, overdue tickets by station, **calibration dumbbells** (starter vs learned vs observed per item, flag drifted items), **line friction** card (undo rate, top error reasons, forced bumps, fire-now overrides, recalls, voids) with the UI-guide note that this is how the interface is evaluated.
4. **Menu and money.** Top items (sold, revenue), revenue by hour, average ticket value, food cost % and margin by item, **yield**: static 50% assumption vs thermal model vs realised batches for brisket and the true cooked cost, an "if you had priced with the static yield you would have been off by X" line.
5. **Safety.** Compliance score (temp checks on time %, sanitise on time %), batch timeline gantt for a chosen day (green ok, amber check, orange reheat, red discard), discards by reason (grams and money), lockouts that 86'd items (and how long), the safety line. Settings shortcut to bounds.
6. **Stock and 86.** Burn-down per protein for a chosen day with threshold line, **sell-out clock** (time each protein went 86 each day vs closing time; a dot strip), what 86 cost (tickets refused/unavailable lines if recorded), simulated channel sync latency (median, max, within 60 s), restock/par suggestion text. A note that Pitcall uses the sell-out time to decide tomorrow's cook count.
7. **Data and settings.** Menu and BOM editor (price, prep estimate with "confirm" flag, zone, BOM lines, soft archive), ingredients (par, threshold, yield with confirmed flag, cost), thresholds per channel, pacing on/off + parameters, safety parameters within bounds, office PIN, theme, sample history on/off, **export** (JSON backup, CSV for tickets/items/events/batches), **import** (validated; refuses with the reason), reset live data (confirm), "what the sample data is" explainer.

### 15.4 Chart inventory (target ~25; every one reads from `SB.metrics`)
Pace: ticket-time-by-hour band line, throughput bars, pace ring, KPI sparklines, pacing A/B bars. Tickets: histogram, anatomy stack by channel, anatomy stack by hour, weekday x hour heatmap, on-time trend line, ticket gantt. Stations: load area, response/work bars, overdue bars, calibration dumbbells, friction bars. Money: top items bars, revenue by hour, margin lollipop/bars, yield comparison bars, cost trend line. Safety: batch gantt, discards stacked bars, compliance meters. Stock: burn-down lines, sell-out clock strip, sync latency bars.

---

## 16. Design tokens (shell owner defines; names are the contract)

Floor (`:root[data-theme="day"|"night"]`): `--bg --paper --sub --ink --ink2 --ink3 --line --line-soft --amber --amber-ink --sage --sage-ink --crimson --focus --shadow --stamp`, zone hues `--z-pit --z-sides --z-fry --z-cold --z-expo`, state tints `--tint-warn --tint-bad --tint-ok`. Type: `--font-body: Barlow, system-ui, sans-serif; --font-display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif`. Scale (px): 13 / 15 / 17 / 20 / 24 / 32 / 44 / 64; ticket number 34, timer 30, item text 19. Radii: 4 (chips), 8 (buttons), 2 (slip corners; slips are not soft rounded cards). Spacing 4-pt scale. `.text-large` multiplies font sizes by 1.2.
Office (`.office[data-otheme="ember"|"paper"]`): `--o-bg --o-surface --o-surface2 --o-ink --o-ink2 --o-ink3 --o-line --o-accent --o-good --o-warn --o-bad --o-focus`. Chart tokens are the charts owner's (`--ch-*`).

---

## 17. Router and views

`#/` floor all; `#/s/<zone>` station; `#/office` and `#/office/<section>`; unknown -> `#/`. `view(hash)` is total; `hash(view)` round-trips. Station choice persists. Opening/closing overlays follows Pitcall F21 (closing with its own button steps back when it was opened from a view; no history growth).

---

## 18. File ownership and definition of done

| Owner | Files | Done when |
|---|---|---|
| Engine | `20-engine.js`, `30-store.js`, `test/engine*.test.mjs`, `docs/smokebox.z.md`, `docs/findings.md` | All of section 7, 8, 9, 10 implemented; fuzz test (>= 200 sequences x 60 steps) checks I1-I15 after every step; mutation-checked tests for I2, I5, I7, I8, I13; `node tools/test.mjs` green |
| Charts | `50-charts.js`, `40-charts.css`, `tools/charts-gallery.mjs` (builds `dist/charts-gallery.html`) | Every chart type renders in both themes with realistic data in a gallery, screenshots reviewed, palette validated with the dataviz script, tooltips/table-view/empty-state work, no console errors |
| Shell | `index.template.html`, `00-tokens.css`, `10-base.css`, `05-icons.js`, `60-shell.js`, `99-boot.js` | Tokens, base components (button, chip, segmented, stepper, sheet, toast with undo, confirm, menu, tooltip), >= 45 icons, router, themes, secret gesture + ignition, boot order, graceful boot error screen |
| Metrics | `40-metrics.js`, `test/metrics.test.mjs` | Every function in section 12 implemented and tested on hand-built fixtures with known answers |
| Sim (wave 2) | `45-sim.js`, `test/sim.test.mjs` | section 11 |
| Floor board | `70-floor-board.js`, `20-floor.css` | section 14.1, 14.2 |
| Floor sheets | `71-floor-order.js`, `72-floor-sheets.js`, `21-floor-sheets.css` | section 14.3 |
| Office A | `80-office-core.js`, `81-office-pace.js`, `30-office.css` | section 15 frame, pages 1-3 |
| Office B | `82-office-money.js`, `83-office-safety.js`, `84-office-data.js`, `31-office-money.css` | pages 4-7 |
| QA (wave 3) | `test/e2e/*.mjs`, `docs/qa-report.md` | independent click-through at 5 viewports, console clean, findings logged |

**Everyone:** screenshot your work at 1280x800 and at 390x844, look at the pictures, fix what is ugly or overlapping before reporting. Report in <= 25 lines: what you built, files, how to run, what is incomplete, any contract deviations. Append defects you find and fix to `docs/findings.md` as table rows (`# | what went wrong | fix | test`).

---

## 19. UI module contracts (so parallel agents plug together)

```
SB.icons.svg(name, {size=20, stroke=2}) -> SVGElement        SB.icons.html(name, opts) -> string
  required icon names (>= 70): flame pot fry snow bag plate car phone plus minus x check check-circle clock alert alert-circle
  history undo redo settings sliders thermometer shield shield-check package chart-line chart-bar gauge list grid search trash edit
  download upload refresh play pause fast-forward sun moon volume volume-off lock unlock info help keyboard home eye arrow-up
  arrow-down arrow-right chevron-left chevron-right chevron-up chevron-down bell users receipt scale timer flag ban zap layers menu
  more copy filter calendar dollar trending-up trending-down door sparkle smoke target pulse stack book

SB.ui.sheet({title, side:'right'|'center'|'full', width, onClose, labelledBy}) -> {el, body, header, footer, close()}
SB.ui.confirm({title, body, confirmLabel, cancelLabel, tone:'danger'|'normal'}) -> Promise<boolean>
SB.ui.toast(message, {tone:'info'|'ok'|'warn'|'bad', undo?:()=>void, ms?:number})     // undo toast drains over config.undoMs
SB.ui.menu(anchorEl, [{label, icon, onClick, checked?, danger?, disabled?}])
SB.ui.tooltip(el, text)      SB.ui.announce(text)   // polite aria-live
SB.ui.stepper({value,min,max,step,onChange,unit,label}) -> HTMLElement   // 44px buttons, never emits 1e+30
SB.ui.segmented({options:[{id,label,icon?}], value, onChange, label}) -> HTMLElement
SB.ui.chip({label, icon?, tone?}) -> HTMLElement    SB.ui.badge(level) -> HTMLElement   // level 'ok'|'warn'|'breach' with word+icon
SB.sheets.register(name, openFn(opts))   SB.sheets.open(name, opts)   SB.sheets.closeAll()
  sheet names: order hold board86 recall demo help specs menu
SB.router.view() -> {kind:'floor', zone:'all'|'pit'|'sides'|'fry'|'cold'|'expo'} | {kind:'office', section:'pace'|...}
SB.router.go(view, {replace?})   SB.router.hashFor(view)   SB.router.viewFor(hash)   SB.router.onChange(fn)
SB.theme.get()/set('day'|'night')   SB.theme.office()/setOffice('ember'|'paper')   SB.theme.textSize()/setTextSize('normal'|'large')
SB.shell.mount(rootEl)   SB.shell.ignite()   SB.shell.extinguish()   SB.shell.inOffice()
SB.floor.mount(el)   SB.floor.unmount()   SB.floor.setZone(zone)   SB.floor.highlight(menuId|null)
SB.office.mount(el, section)   SB.office.navigate(section)   SB.office.unmount()
SB.office.registerPage(id, {title, icon, order, render(container, ctx) -> {update?(), destroy?()}})
  ctx = { filters: {range:{from,to,label}, channel:'all'|id, source:'all'|'live'}, dataset() -> SB.store dataset for the filters,
          metrics: SB.metrics, onFilterChange(fn) -> off, navigate(section), openSheet(name) }
  page ids and order: pace tickets stations money safety stock data
```
Boot (`99-boot.js`): DOM ready -> `SB.store.init()` -> `if (first run && SB.sim) SB.sim.seedFirstRun()` -> `SB.shell.mount(#app)` -> router applies the hash. A page that throws while rendering must show an inline error card with the module name, never a blank screen (the build wraps each file in try/catch and records `window.__sbLoadErrors`).

---

## 20. As-built addendum (wave 1 landed). Where this section and an earlier one disagree, THIS SECTION WINS, and the code wins over both.

The engine, store, metrics, charts and shell exist and are tested (261 tests green at the time of writing). Read the code for exact shapes; the notes below are the things that differ from, or were added to, sections 5 to 13.

**Engine (`SB.engine`, `src/js/20-engine.js`).** Public names: `apply tick newState availability computeAvail servable allDay gate thermalYield staticYieldComparison pacingPlan planFor ticketTiming ticketProgress checkInvariants validateBackup serialize deserialize allEvents prune channelThresholds defaultSettings describe views findTicket REPORTS REPORT_IDS ACTIONS UNDOABLE DISCARD_REASONS helpers`. `E.ACTIONS` is a table of every action with its payload (use it, do not guess). `E.describe(report, info, settings)` gives the human message with live numbers; prefer it to `REPORTS[id]`.
* Extra action `uiReport {action, report}` records a refused user action for the friction metrics (the store calls it for you in `dispatchEx`).
* `createTicket` also takes `allowPast` (sim only, up to 48 h back). The 14-day sample must NOT use this: drive a private state with `SB.engine.apply(state, type, payload, now)` on a virtual clock, one `now` per step, never touching `SB.store`.
* **The event log is windowed.** `state.events` holds the recent 1024 to 2047 events; older ones live in immutable archive chunks. Always read events through `SB.engine.allEvents(state)` (or `SB.store.select.events()` / `dataset().events`). Never read `state.events` for history.
* `views.ticketsForZone(state, zone)` returns tickets reduced to one station: `items` (displayed and cooking), `onDeckItems` (queued), `onDeck` (count), `doneHere`, `allItems`, `zone`. `views.batches(state, now, {all?})` returns batches each with `gate`. `views.counts(state, now)` returns `{all, expo, ready, overdue, warn, zones{}, overdueByZone{}, hold, out86, sanitizeDueAt, sanitizeOverdue}` for header badges.
* **Gate timing deviates from the research report on purpose** (finding F-E1): the 2-hour "below 135 F" clock runs from the first out-of-range reading (`outSince`), not from when the food left heat. The Safety help text and the Specs panel must say so in plain words.
* Learned prep times: the sim crew must use the **starter** prep times times a hidden per-item factor, never `item.prepSec` or the learned plan (finding F-E7: it creates a feedback loop).

**Store (`SB.store`).** `init destroy status getState now tick dispatch dispatchEx lastResult subscribe subscribeTick flushNotify setSpeed speed clock flush exportAll importAll exportCsv reset resetLive attachSim dataset select KEY CORRUPT_KEY`.
* `dispatch(type, payload)` returns the engine report object; `dispatchEx(type, payload, {source:'sim'|'ui'})` also records refusals (`ui_report`) for real user actions only; sim traffic is never counted as friction.
* `select.*`: `activeTickets ticketsForZone expoTickets recent voided allDay availability unavailable batches counts timing events menu ingredients settings dataset`. All memoised per state object.
* `dataset({sample:true})` merges live data with `SB.sim.sample()` (memoised; a throwing sample is caught and `hasSample:false`). Shape: `{tickets, events, batches, learned, menu, ingredients, settings, range{from,to}, counts{live,sample}, hasSample}`.
* Persistence key `smokebox.v1.state`; theme and text size use `smokebox.v1.theme` and `smokebox.v1.textsize` (read before first paint by the template).

**Metrics (`SB.metrics`, `src/js/40-metrics.js`, documented in `docs/metrics.md`).** Read that file for the exact function list and return shapes; it is the contract for Office pages.

**Charts (`SB.charts`, `src/js/50-charts.js`).** `SB.charts.{line,bar,hist,heat,scatter,dumbbell,gantt,meter,ring,spark,stack}(el, spec)` returns `{update(spec), destroy(), setTable(bool), el, type}`. `update` REPLACES the spec. Common spec keys: `title sub table legend height empty ariaLabel texture onSelect onLegend`. Formats are named strings (`num int pct pct100 money dur durS clock g temp hour time date compact`) or a function. Colour: `series.tone` > `series.slot` (1 to 8) > entity id (`dine_in takeout drive_thru third_party pit sides fry cold expo hold response work dwell`) > index. Tones: `ok warn serious bad muted accent check reheat discard`. Put chart cards on `background: var(--ch-surface)` (the `.ch-card` class does it); hero numbers use `.ch-big-h`. The shell already calls `SB.charts.refreshTheme()` on a theme switch. `node tools/charts-gallery.mjs` builds `dist/charts-gallery.html` to see every chart. Direct end labels need a card at least 420 px wide; below that only the legend shows (by design).

**Shell.** `docs/design-notes.md` is the design contract (tokens, components, motion, gesture). Read it before writing CSS.
