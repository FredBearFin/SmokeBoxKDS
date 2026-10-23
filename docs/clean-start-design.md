# Clean start: design for an empty app and an isolated demo

Status: DESIGN ONLY (round 1, branch `night/a5-r1`). No engine, store or config code was changed. Author: A5 (foundation silo). Baseline: `kds/deploy` at b8e569e, unit suite 499 passing.

Everything marked RAN below was run against the engine loaded the way `test/_load.mjs` loads it (Node, no browser). Everything marked READ is from reading the source and was not executed. Nothing here was checked on a real tablet or in a real kitchen.

## 0. The short version

1. The engine can already run with `menu = []` and `ingredients = []`. A blank state passes every invariant, ticks, takes an order for a dish added with `addMenuItem`, cooks it, bumps it, takes payment and closes the day. A dish with no ingredients works end to end today (RAN, section 2).
2. What breaks is not the engine core but the edges: `validateBackup` silently puts all 21 barbecue dishes and 15 barbecue ingredients back into a blank save (so a blank kitchen turns into barbecue on the first reload), `store.reset()` and `newState()` default to the barbecue menu, there is no `addIngredient` action, a dish with no ingredients is recorded as costing $0.00 (so food cost shows 0 percent and margin 100 percent), and the demo shares storage keys and the tab channel with real data (so it cannot be isolated today).
3. The design: keep the barbecue data exactly where it is (it becomes the demo catalog and legacy saves keep loading unchanged), make a first run on the real side start from `newState({ blank: true })`, run the demo in a separate storage namespace chosen per browser tab, and put the cook-ahead machinery behind one settings switch that is OFF for a new kitchen and ABSENT (meaning on) for every existing save.

## 1. Inventory of barbecue assumptions

"If empty" means: what happens when the menu and ingredients are empty and nothing else changes. Status RAN or READ. Line numbers are on `kds/deploy` b8e569e.

### 1.1 Config (`src/js/10-config.js`)

| Line | Assumes | If empty / consequence |
|---|---|---|
| 24-32 `C.zones`, 34 `C.workZones` | Four stations with barbecue names: Pit, Hot sides, Fry, Cold and drinks (ids `pit`, `sides`, `fry`, `cold`). | Ids are baked into tickets, routing, the shell router (`60-shell.js:19`) and the board tabs. The names are the only barbecue part. Names can be changed with `C.applyCustom` (stored per browser under `smokebox.v1.names`) but never removed. |
| 43-48 `C.channels` | Dine-in, Takeout, Drive-thru, Delivery app with warn/breach seconds (9/13, 8/12, 6/9, 8/12 minutes). | Generic, not barbecue. The seconds are starter estimates. Keep, ask in setup. |
| 52-57 `C.syncTargets` | Four simulated 86 feeds (Counter POS, Online ordering, Drive-thru board, Delivery apps). | Engine creates a sync record for every availability change (`20-engine.js:829, 864`). Harmless when empty, but a real owner would see a "Channel sync" log for feeds that do not exist. Hide in the real namespace. |
| 72-90 `C.ingredients` | 15 barbecue ingredients with par, 86 level, cost, yield, hold limits, cook and rest hours. | Used as the default for `newState` (`20-engine.js:2786`), restored by `validateBackup` (`3203`), looked up by metrics (`40-metrics.js:154`), the sim (`45-sim.js:235, 802, 806`) and `ladderMin`. |
| 93-99 `C.categories` | meat, sandwich, side, fried, cold. | `MENU_PATCH.cat` is a frozen copy of these ids made when the engine file loads (`20-engine.js:2285`), so a category added in the session is rejected until reload. Barbecue-derived saves use these ids and must keep resolving. |
| 109-137 `C.menu` | 21 barbecue dishes with prices, prep seconds, ingredient quantities. | Default for `newState` (`2785`), restored by `validateBackup` (`3225`), layered under the dataset by metrics (`40-metrics.js:148`), used by the sim (`45-sim.js:115-279`), the walkthrough (`74-floor-tour.js:26`), the setup wizard (`77-floor-setup.js:72` "starter dishes"). |
| 139-146 `C.combos` | Two-meat plate, Sandwich meal, Family pack. | The order screen draws these as buttons from config, not from the saved menu (`71-floor-order.js:292`). With a custom menu they would show barbecue combos with prices of 0. Must be hidden outside the demo. |
| 148-151 `C.modifiers` | "Lean cut", "Moist cut", "Extra bark" and similar. | Shown as chips on every order line (`71-floor-order.js:731`). Barbecue wording for a non-barbecue owner. |
| 153 `C.quickNames` | Walk-up, Pickup, Table 1 to 6. | Generic. Keep. |
| 160-169 `C.pacing` | Meal pacing on (`enabled: true`). | With one-dish tickets nothing happens; with mixed tickets items wait ("starts in 2:30") on the strength of starter prep times. A new owner has not entered honest prep times yet. Default OFF for a new kitchen. |
| 178 `C.service` | Open 11, close 21, tax 0. | Generic starter estimates. Ask in setup. |
| 190-206 `C.safety` | Hot hold 135 F, check every 120 min, sanitize every 4 h, hold limit 12 h. | Only matters when cook-ahead is on. The sanitize timer is "due at once" in every new state (`20-engine.js:2816`), so a blank kitchen with the module off would show an overdue sanitize chip unless the module hides it. |
| 208-209 `C.alerts`, `C.ladderMin` | Warning ladder with `byIng` brisket and ribs. | Keyed by ingredient id; harmless for ids that do not exist. |
| 213 `C.starterAgeMin` | Demo starting batch ages by barbecue id. | Used only when `stagger` is true (`20-engine.js:2802`). Demo only. |
| 243 `C.yieldModel` | Brisket cooked-yield formula. | Used only for ingredients marked `thermal`. Only `brisket` is. Cook-ahead only. |

### 1.2 Engine (`src/js/20-engine.js`)

| Line | Assumes | If empty / consequence |
|---|---|---|
| 321 `defaultSettings` | Channels from config; no feature switches exist. | There is no module flag today. `defaultSettings()` must stay byte-identical for the demo, so the flag must be absent-means-on. |
| 380 `pacingPlan` | `menu \|\| C.menu` | `planFor` passes `state.menu`; an empty array is truthy, so it is safe. Only a caller that omits the argument (tests) reads the config menu. |
| 602-646 `servableOf`, `availability` | Stock per ingredient through the dish's `bom`. | A dish with an empty `bom` has no loops to run and is available unless manually 86'd (RAN). |
| 650 `computeAvail` | One entry per menu item. | `{}` for an empty menu (RAN). |
| 980 `depleteInto` | Reads `mi.bom`; skips unknown ingredients. | Empty bom: nothing taken, `cost: 0`, no `stock_short` (RAN). |
| 1116-1119 `completeItem` | Records `w.cost = d.cost`. | For an empty bom this records cost 0, which metrics reads as a real cost of $0.00. See 2.5. |
| 1395 `closeDay` | Orders, tickets, batches. | Works on a blank state (RAN). The `leftovers` choice is meaningless without batches. |
| 1714 `restock` | Ingredient must already exist. | `unknownIng` for anything not in `state.ingredients`. |
| (none) | There is no `addIngredient` action. | The only ingredients that can ever exist are the 15 in config. An owner cannot add one today, so no custom dish can track stock today (READ: `grep "^  A\." 20-engine.js`). |
| 2284-2285 `MENU_PATCH` | `zone` enum is the live `C.workZones` array; `cat` enum is a frozen copy of `C.categories` ids. | See 1.1 categories. |
| 2352-2376 `addMenuItem` | Needs name, zone, cat, price, prepSec, track. Id guard avoids `C.menuById` ids. Creates `bom: []`. | Works on a blank state (RAN). The guard against config ids is still wanted so a custom dish can never collide with a demo id. |
| 2382 `resetLive` | `keepSettings` false builds `newState` with the config menu. | In the real namespace "reset and drop settings" would bring the barbecue menu back. |
| 2785-2786 `newState` | Default `menu` and `ingredients` come from config. | The barbecue menu is the default for anyone who does not pass `menu`. |
| 2795 `newState` | Plain (non-TCS) ingredients start at `parG` stock even on a "no starter" start. | Barbecue plain stock appears at first run. This is the "plain stock still barbecue" the owner noted. |
| 2802 `newState` | `starterAgeMin` stagger. | Demo only. |
| 2935, 3019, 3443 | Zone ids validated against `C.workZones`. | Fine for the four existing ids. |
| 3190-3203 `validateBackup` (ingredients) | Known ids take their safety fields from config; every config ingredient missing from the save is added back. | An empty ingredient list comes back as 15 barbecue ingredients (RAN, "restored ingredient ..."). |
| 3210-3225 `validateBackup` (menu) | Same for menu: missing config dishes are added back. | An empty menu comes back as 21 barbecue dishes (RAN). A saved blank kitchen with one custom dish comes back with 22. |
| 3501 `describe` | Names the dish from config if known. | Falls back to "That item". Fine. |

### 1.3 Store (`src/js/30-store.js`)

| Line | Assumes | If empty / consequence |
|---|---|---|
| 16-21 | Fixed keys `smokebox.v1.state`, `.corrupt`, `.sid`, `.outbox`. | No namespace. A demo cannot be isolated by choosing different keys unless the store is handed a different storage object (it accepts one in `init`, line 427; RAN: a prefixed storage object worked for `state` and `sid`). |
| 290 | Default tab channel name `'smokebox'`. | Every tab of the origin talks on one channel. A demo tab would broadcast "saved" messages and `adoptState` packets (lines 223-231, 371-390) to real tabs. |
| 464 | First run: `newState({ starter: opts.starter === true, stagger: ... })` with config menu and ingredients. | A first run is empty in tickets, batches and history but not in menu, ingredients, prices or plain stock. |
| 556-585 `exportAll`, `importAll` | The backup envelope carries state and the per-browser names, no mode. | A demo backup and a real backup are indistinguishable. |
| 673-682 `reset` | `newState({ starter: false })` | Resets to the barbecue menu. No unit test calls `store.reset()`. |
| 685 `resetLive` | Passes through to the engine. | See engine row. |
| 751-790 `sampleData`, `dataset` | Adds the 14-day simulator history in front of the live data when the sample is on. | Real namespace must never merge it. The on/off flag lives in its own key (`smokebox.v1.sample`, `45-sim.js:24`). |
| 77 `setSpeed` | Allows up to 1000x for any state. | The clock is persisted with the state. A faster-than-real clock in the real namespace would write future timestamps into real data (`atLeast`). Real mode should refuse speeds above 1. |

### 1.4 Simulator, shell, floor, office, metrics

| File:line | Assumes | If empty |
|---|---|---|
| `45-sim.js:115-279, 396, 802-806, 235` | The whole generator drives the engine with `newState({ empty: true })` and the config menu (line 334) and reads `C.menuById`, `C.comboById.plate`, `C.ingredientById.brisket`. | Independent of the saved state, so it keeps working as long as the config stays. It must only ever be attached in the demo namespace. |
| `45-sim.js:1130-1170` `FIRST_RUN`, `restartDemo` | Seeds ten demo tickets with barbecue ids, then `resetLive({ starter: true, stagger: true })`. | This is the demo's own start. It becomes the demo-namespace first run. |
| `60-shell.js:1242` `demoLoaded` | "Demo" means speed above 1, sim running or any ticket with `src === 'demo'`. | The demo is a condition of the one shared state, not a place. Replaced by a mode. |
| `70-floor-board.js:567, 1587-1604, 1664` | Demo chip, Demo tool button, welcome card. | Move into demo mode; the welcome card text changes for a blank kitchen. |
| `70-floor-board.js:1745-1781` | Empty board shows "Busy-night demo" and calls `SB.sim.restartDemo()` in the same state. | Becomes "Try the demo" which switches namespace instead. |
| `71-floor-order.js:278-313, 292, 349, 731` | Categories, combos, quick names, modifiers all from config. | With an empty menu the sheet shows no tiles; combos and barbecue modifier chips would still show. |
| `72-floor-sheets.js:891, 1355-1371, 1560-1700` | Hold cabinet lists TCS ingredients; 86 board lists menu by category; the Demo sheet runs the crew, burst and clock speed. | READ: empty lists. Not run in a browser. |
| `74-floor-tour.js:26, 78-141, 304` | The walkthrough orders `hushpuppies`, `brisket_sand`, `tea`. | Fails ("could not be added") for any other menu. Demo only. |
| `77-floor-setup.js:72, 54-66` | Wizard step 4 archives the config dishes the save still contains. | Wizard exists (tax, hours, PIN, archive starters, opening batches). Its step 4 disappears for a blank start. |
| `84-office-data.js:268-345, 354-389, 548` | Menu editor: add a dish, edit its recipe lines. Note says "No ingredients, so stock is not tracked for this item." | The add-dish path exists. The ingredient dropdown lists only existing ingredients (no way to add one). |
| `86-office-glance.js:39-75` | "When brisket runs out" is a hard-coded card (`inp.brisket`, id `'brisket'`). | Shows "No brisket is ready to serve right now" for a kitchen that sells none. Must be generic or hidden. |
| `82-office-money.js:732`, `85-office-stock.js:110` | Fall back to `'brisket'` for the what-if and default pick. | Cook-ahead pages. Hidden when the module is off. |
| `40-metrics.js:148, 154` | Dataset menu and ingredients are layered on top of the config lists "so owner edits win". | A deleted or never-existing id falls back to the barbecue name. Only matters for ids that collide; the id guard prevents this. Still, the real namespace should not read the config catalog at all. |
| `40-metrics.js:924` | Sell-out clock tracks hot-held ingredients used by `meat` and `sandwich` categories. | Empty set for a custom menu. Fine. |
| `40-metrics.js:174, 648-662, 1235-1243` | A recorded `cost` of 0 counts as a cost. | See 2.5: dishes with no ingredients show 0 percent food cost. |

Metrics sweep (RAN): every one of the 48 exported functions of `SB.metrics` ran on a blank dataset and on a dataset with one paid no-ingredient order without throwing.

### 1.5 Browser storage keys (30 literal keys found by `grep`, READ)

Per-device preferences (same in both modes): `theme`, `otheme`, `textsize`, `density`, `hints`, `zone`, `role`, `sound`, `volume`, `speech`, `voicelevel`, `callouts`, `far`, `wall`, `dock` (15).

Data that belongs to one kitchen and must be separate per mode: `state`, `sid`, `outbox`, `corrupt`, `names`, `sample`, `welcome`, `setup.wizard`, `setup.offered`, `lastbackup`, `dlog`, `alertlog`, `lastbatch`, `initials`, `pinlock` (15). `pinlock` counts wrong PIN tries; the PIN hash itself is inside the state settings.

## 2. Experiments (RAN)

All run with `node` against `loadSB(['00-util','10-config','20-engine','30-store','40-metrics'])`. Scripts were kept in the scratchpad, not committed. To reproduce, run:

```js
import { loadSB } from './test/_load.mjs';
const SB = await loadSB(['00-util','10-config','20-engine','30-store','40-metrics']);
const E = SB.engine, T = Date.UTC(2026,5,1,15,0,0);
let s = E.newState({ now: T, menu: [], ingredients: [] });          // the blank state
s = E.apply(s, 'addMenuItem', { name:'Burger', zone:'pit', cat:'meat', price:9.5, prepSec:300, track:'two' }, T).state;
```

### 2.1 Can the engine run with menu = [] and ingredients = []?

Yes. `newState({ now, menu: [], ingredients: [] })`:

| Check | Result |
|---|---|
| `checkInvariants` | `[]` (healthy) |
| menu / ingredients / batches / stock keys | 0 / 0 / 0 / 0 |
| `avail` | `{}` |
| `tick` an hour later | returns the same state reference (nothing due) |
| JSON size | 1,320 characters (the barbecue starter state is 15,312) |

Note for tests: `newState({ empty: true })` already exists and means "zero stock", not "no menu". It still carries the barbecue menu and ingredients (used by `test/deadlines.test.mjs`, `_office-b-data.mjs`, `45-sim.js:334`). The new option must have a different name (this document uses `blank`).

### 2.2 What does `validateBackup` say about an empty menu?

It accepts it (`ok: true`) and then undoes it:

| Input | Result |
|---|---|
| serialize(blank state) then `validateBackup` | `ok: true`, menu length 21, ingredients length 15, 36 entries in `repaired` ("restored ingredient brisket", ...) |
| blank state plus one custom dish "Pie", saved, `store.init` reload | menu length 22 (Pie plus 21 barbecue dishes), 15 ingredients, 36 repairs, `checkInvariants` still `[]` |

So today a real owner who started empty would see the full barbecue menu come back on the first reload, and the repair toast at start-up would say Smokebox repaired 36 details. The same happens on every cross-tab load (`loadStored`), every import and every backup export (`exportAll` re-validates its own output).

### 2.3 What must a dish minimally have?

`addMenuItem` on a blank state (RAN, each field removed or altered in turn):

| Field | Rule | Result when wrong |
|---|---|---|
| name | text, 1 to 60 characters, unique (case-insensitive) | `badPatch` / `outOfBounds` |
| zone | one of `C.workZones` (not `expo`) | `badPatch menu.new.zone` |
| cat | one of `C.categories` ids | `badPatch menu.new.cat` (also for an unknown id like `mains`) |
| price | number 0 to 1000 | missing: `badPatch`; 0: `ok`; -1: `outOfBounds` |
| prepSec | number 5 to 3600 | missing: `badPatch`; 4: `outOfBounds` |
| track | `'one'` or `'two'` | missing: `badPatch` |
| short | optional, defaults to the first 24 characters of the name | |
| bom | not accepted; always starts `[]` | |

Minimum for a good first-run form (A2): name and price. The engine needs the other four, so the form must supply defaults: station (first work station), category (first category, or "Other"), prep time (a default such as 300 s, marked `prepConfirmed: true` today because the owner "typed it", which is not strictly true when defaulted), and track (`one`). Recommendation: `addMenuItem` accepts missing `zone`, `cat`, `prepSec`, `track` and fills defaults, with `prepConfirmed: false` when it did the defaulting (so the app keeps learning the real time). The existing strict behavior stays for any caller that passes values.

### 2.4 A dish with an empty bill of materials, end to end

Burger with `bom: []` on the blank state (RAN):

| Step | Result |
|---|---|
| order (`createTicket`) | `ok`, ticket t_1, order o_1 created |
| the item appears on its station | `displayed` after the plan time (a 300 s prep with one line has offset 0, so it shows at once) |
| cook (`advanceItem`) then done (`completeItem`) | `ok`; item `depleted: []`; only an `item_done` event; no `stock_short` |
| bump (`bumpTicket`) | `ok` |
| pay (`payOrder`, cash) | `ok`, total 19 for two at 9.50 |
| availability | `{ ok: true, reason: null, ing: null }`; never goes out by itself |
| 86 (`toggle86` on) | `ok`; `avail.burger = { ok: false, reason: 'manual' }`; ordering it then returns `itemUnavailable`; toggling off restores it |
| `closeDay` | `ok` with orders, total, tip, discarded |
| invariants after the whole flow | `[]` |
| metrics | no function threw (all 48) |

One real defect found: the recorded item cost is `0`, not "unknown".

### 2.5 The $0.00 cost problem

`completeItem` (line 1119) records `w.cost = d.cost` and `depleteInto` returns `cost: 0` when the bom is empty. The metrics layer treats any number as a recorded cost (`40-metrics.js:183`, `num(cost) ? cost : null`). Measured (RAN), one paid $10 burger:

```
foodCostPct  -> costPct 0, cost 0, revenue 10, coverage 1
byItem       -> cost 0, margin 10, marginPct 1 (100 percent), costCoverage 1
```

This breaks the repo's own rule "a missing cost is not recorded, never 0" (header of `82-office-money.js`). Fix (round 2): when a dish has no recipe lines that resolve to an ingredient with a known cost, `completeItem` leaves `cost` unset (and the `item_done` event omits it). Metrics already read a non-number as null, so coverage becomes 0 and the cost cards say "not recorded". Barbecue state is unaffected because every demo ingredient has a cost. A custom ingredient with no cost entered gets the same treatment (unit cost unknown, not 0).

### 2.6 Is stock tracked per ingredient or per dish?

Per ingredient. A dish owns a recipe (`bom`: list of `{ ing, qty }`), and finishing the dish takes `qty x portions` from each ingredient (plain stock count in `state.stock`, or FIFO from batches for TCS food). Availability is "can one portion still be made from every ingredient" plus the ingredient's 86 level (`thresholdG`). There is no per-dish stock counter. A dish is "tracked" only through its recipe.

Consequence for the design: a simple "I have 12 portions left" per dish is best built as a hidden one-line ingredient owned by the dish (unit `ea`, `bom: [{ ing: <dishIngId>, qty: 1 }]`). That reuses depletion, 86, the books (ledger I2) and the existing restock action with no new engine concept. It needs `addIngredient` (does not exist today).

### 2.7 Can a dish be added with `addMenuItem` and no ingredients today?

Yes (RAN). The office Menu page also says so in its own note ("No ingredients, so stock is not tracked for this item", `84-office-data.js:320`) and after adding: "To track stock for it, add its ingredients in its row below" (`:548`). But there is no way to create an ingredient, so that sentence is only true for the 15 barbecue ones.

### 2.8 Other facts measured

| Fact | Result |
|---|---|
| `store.init()` first run, default | menu 21, ingredients 15, batches 0, `firstRun: true`, and nothing is written to storage until something happens |
| prefixed storage object passed to `store.init({ storage })` | state and sid went to `demo:smokebox.v1.state` / `demo:smokebox.v1.sid`; nothing else touched |
| `validateBackup(serialize(barbecue demo state))` | `ok`, 0 repairs, but not byte-equal to the input: key order and the batch gate fields are re-derived. Do not use validate round trips as the byte-for-byte test; compare `newState` output against a hash taken before the change (section 3.8) |
| unit suite on b8e569e | 499 pass, 0 fail, 18 s |

## 3. The design

### 3.1 What "empty" means (a)

One new engine option: `newState({ now, blank: true, settings? })`. A real first run calls it. Nothing else changes: with no `blank`, `newState` behaves exactly as today (the 499 tests and the demo depend on that).

Fields of a blank state:

| Field | Value | Note |
|---|---|---|
| `v`, `rev`, `seq` | 1, 0, zero counters | as today |
| `menu` | `[]` | |
| `ingredients` | `[]` | |
| `tickets`, `orders`, `batches`, `syncs`, `planned`, `events`, `eventArchive`, `safetyKeep`, `undo` | `[]` | |
| `stock`, `manual86`, `avail`, `alertSnoozes`, `learned`, `ledger` | `{}` | |
| `sanitize` | `{ dueAt: now }` | unchanged; hidden by the module switch |
| `catalog` | `'own'` | NEW marker, present only on a blank-start save. Absent on every existing save and on the demo. This is what tells `validateBackup` not to re-seed from config. |
| `settings` | `defaultSettings()` plus `modules: { cookAhead: false }` and `pacing.enabled: false` | `defaultSettings()` itself must not change (its hash is part of the demo's byte-for-byte guarantee). The blank settings are built by a second function and passed in. |

Settings left at their defaults on purpose and asked about in setup (A2): tax rate 0, open and close hours 11 to 21, channel warn/breach seconds, units (F/kg).

Names and lists that are not part of `state`: stations and categories keep their ids. For the real namespace a blank start applies neutral display names once, through the existing rename mechanism, before the first draw: pit "Main line", sides "Sides", fry "Fry", cold "Cold and drinks"; meat "Mains", sandwich "Sandwiches", side "Sides", fried "Fried", cold "Cold and drinks". (Open question for Freddy, see section 6.) Combos are not shown outside the demo. Modifier chips outside the demo are a neutral set: No onions, Sauce on the side, Extra sauce, Gluten-free, Allergy see note. Quick names stay.

The real first run writes nothing to storage until the owner does something (as today). The first save is the first time the `catalog: 'own'` marker reaches disk.

### 3.2 Dishes without ingredients; stock tracking opt-in (b)

Already true: a dish with `bom: []` can be ordered, cooked, bumped, paid, 86'd by hand and closed out. Changes:

1. `computeAvail` / `availability`: no change. A no-recipe dish is available unless manually 86'd. The UI wording for such a dish on the 86 board is "86'd by hand" (never "out of stock").
2. `depleteInto`: no change in what it takes. Change in what it reports: cost is unknown (2.5), not 0.
3. Invariants: no new ones. I2 (books balance) is vacuous for a dish with no recipe. Add one structural check: every `bom` line names an existing ingredient (already enforced by `validateBackup` repair and `patchEntity`, not yet by `checkInvariants`; add it as a checker line so a bug cannot leave a dangling recipe).
4. Tracking is opt-in per dish, by giving it a recipe. Two levels for the owner, both reusing existing mechanics:
   - Level 1, count portions: the dish gets a hidden `ea` ingredient named after it ("Portions of Burger"); a recipe of 1 per portion; "Add 12 portions" is `restock`. 86 happens at the ingredient's 86 level (default 0 or 1). This is what most small owners mean by "I have 12 left".
   - Level 2, real ingredients: the owner adds ingredients (flour, buns, beef in grams or pieces) and recipe lines. Same engine path as the barbecue plain-stock ingredients.
5. New engine action `addIngredient` (round 3): `{ name, unit: 'g'|'ea', costPerKg? | costEach?, parG?, thresholdG? }`. Id minted from the name the same way `addMenuItem` does, avoiding every config id. It creates `stock[id] = 0`, `ledger[id]` with zeros, and `tcs: false` unless the cook-ahead module is on and the caller passes `tcs: true` plus `hold`. `tcs`, `unit` and `hold` are immutable after creation (the existing `validateBackup` rule keeps TCS food from being edited into an unchecked one; for custom ingredients that rule must read the saved value, not the config).
6. `ING_PATCH` already allows cost, par, threshold, name. Add `archived` (the UI already filters `!i.archived` in `72-floor-sheets.js:891, 1371`), so an owner can retire an ingredient without breaking old recipes.
7. A recipe is allowed to be changed while tickets are open: the change takes effect on future completions. Already the behavior of `patchEntity`.

### 3.3 The optional cook-ahead module (c)

One switch: `settings.modules.cookAhead` (boolean). The rule is `moduleOn = !(settings.modules && settings.modules.cookAhead === false)`. So:

- absent (every existing save, the demo, and `defaultSettings()`): ON, behavior exactly as today;
- `false` (a blank-start kitchen): OFF, until the owner turns it on in Menu and settings.

The setting is changed through `updateSettings` (needs a `SET_SCHEMA` entry; round 2 spike: confirm `mergeSchema` accepts a key that is absent from `cur`). Turning it on or off is non-destructive: nothing is deleted, hidden things come back.

"Cook-ahead" covers: batches in the hold cabinet (add, pull, discard, planned batches), temperature checks and the Hold badge, quality and safety expiry, cooling, reheat, keep-serving, sanitize timer, the warning ladder and the attention strip entries that come from batches, sell-out clock, yield what-if.

What hides when it is OFF:

| Surface | Hidden when off |
|---|---|
| Board header (`70-floor-board.js:567-619`) | Hold cabinet button and count, sanitize chip |
| Attention strip / deadline feed (`25-deadlines.js`, dock in `70-floor-board.js`) | batch expiry, temperature check, cooling, sanitize, sell-out entries; late tickets stay |
| Sounds and spoken call-outs | the batch ladder calls; ticket calls stay |
| Sheets (`72-floor-sheets.js`) | Hold cabinet sheet, New batch, Pull, Discard log, Stock "in the cabinet" list; 86 board keeps the dish list |
| Menu key shortcuts and the Menu list | the Hold items |
| Office (`83-office-safety.js`, `85-office-stock.js` cabinet parts, `82-office-money.js` yield what-if, `86-office-glance.js` brisket card) | Safety page, Sell-out clock, Yield what-if, brisket card (replace with a generic "Out right now" card) |
| Settings (`84-office-data.js`) | hold limits, temperature interval, ladder editor, thermal yield |
| Walkthrough and setup wizard | the opening-batches step |

What does NOT depend on it: tickets, orders, payment, close day, pacing, 86 by hand, plain-stock ingredients and their 86 level, analytics for sales and pace.

Engine consequences: none for correctness. With no batches the tick loop does nothing for the cabinet. The engine should refuse `addBatch`, `planBatch` and the like with a plain report when the module is off (new report id, round 3), so a stale tab or a script cannot create a batch the UI cannot show. The engine keeps accepting existing batches (turning the module off with batches in the cabinet is allowed; the cabinet UI stays visible while any batch holds food, so nothing is silently hidden, and the owner is told why).

### 3.4 Demo isolation (d)

Principle: the demo is a place, not a condition. It has its own storage keys, its own tab channel, its own clock, its own sample history. Entering it writes nothing to the real keys. Leaving it destroys nothing.

#### Mode

`mode` is `'real'` (default) or `'demo'`. It is decided once per page load, before any module reads storage:

1. `sessionStorage['smokebox.mode']` equals `'demo'`, or the page URL has `?demo` (so a salesperson can bookmark a demo address and the home-screen app of a real kitchen never accidentally opens it);
2. otherwise `'real'`.

Why sessionStorage and not localStorage: it is per tab and dies with the tab (or the installed app's window). A demo can never become the thing a tablet wakes up in the next morning. If the real kitchen's tablet is restarted mid-demo, it comes back as the real kitchen, and the demo namespace waits for "Resume the demo". A duplicated tab inherits the mode, which is acceptable (both tabs are demo and both talk on the demo channel).

#### Namespaces

- Real: the existing keys, unchanged. Existing users need no migration and no data is moved.
- Demo: the same keys with the prefix `smokebox.demo.` in place of `smokebox.` for the 15 data keys listed in 1.5. The 15 device-preference keys stay shared (a cook's chosen text size should not change when the demo opens).
- Implementation point: one function in `00-util.js` builds `U.storage` with a `keyFor(key)` mapper that reads the mode, and a single allow-list of shared device keys. New keys default to isolated (the safe direction). A guard test enumerates every `'smokebox.` literal in `src/js` and fails if one is not classified.
- The tab channel name is `smokebox` for real and `smokebox-demo` for demo. `channelTransport(name)` already takes a name; `openTransport` must pass it.
- Config names (`smokebox.v1.names`) are read when `10-config.js` loads, before the store. They are one of the 15 data keys, so the mapper must already know the mode by then; that is why the mode is decided in the first file that runs (`00-util.js`).
- Server or hub transports (`docs/connected-plan.md`) refuse to open in demo mode.

#### What the demo contains

The barbecue catalog stays in `10-config.js` unchanged, as the demo catalog. In demo mode the first run is exactly today's `init({ starter: true })` plus `Sim.seedFirstRun`, i.e. today's `Sim.restartDemo` result, and every demo tool works as now (crew, burst, clock speed, sample history toggle, walkthrough, combos, brisket modifier chips). Demo state has no `catalog` marker and no `modules` key, so the cook-ahead machinery is on, as the demo shows today.

#### How a user enters and leaves

- Enter: the empty board and the Menu both offer "Try the demo". The click flushes the real store (`flush()`), sets `sessionStorage['smokebox.mode'] = 'demo'` and reloads the page. Nothing is written to a real key after the flush.
- In the demo: a permanent colored bar across every screen and every office page says "DEMO. Pretend orders, pretend food, nothing here is saved to your kitchen." It has one button, "Back to my kitchen". The window title and the tab icon change too, so a tab strip shows which tab is which.
- Leave: "Back to my kitchen" clears the session flag and reloads. The demo namespace is kept so "Resume the demo" returns to where it was.
- Restart the demo: removes only the demo-prefixed keys, reloads, seeds again. Never touches a real key.
- Real data is never offered "Reset live data" from inside the demo (it would only reset the demo anyway); the button wording in demo is "Restart the demo".

#### Backups and tabs in the demo

- Backups: the envelope gets `mode: 'demo'` when written from the demo. Real mode `importAll` refuses an envelope with `mode: 'demo'` ("This is a demo backup, not your kitchen's"); demo `importAll` refuses a real envelope. Envelopes without the field (every backup that exists today) are real. The backup reminder (`lastbackup`) is not shown in the demo and the demo's backup does not satisfy the real kitchen's reminder (separate key).
- Tabs: two tabs of the same mode sync as today. A demo tab and a real tab share nothing: different storage keys, different channel, different clocks. The `rebaseIfStale` / `loadStored` path reads the demo keys in the demo tab.
- Clock: `setSpeed` above 1 is refused in real mode (report with a plain message). In the demo the existing speeds work.
- Sample history: `Sim.setSampleEnabled` and `store.dataset({ sample: true })` are honored only in demo mode. In real mode the dataset ignores the sample even if the stored flag is true.
- Metrics: the real namespace never layers the config catalog under the dataset (`40-metrics.js:148, 154`). The dataset carries `catalog: 'own' | 'demo'` and only `demo` and legacy get the layering.

### 3.5 Migration (e)

Existing real saves (they all contain the barbecue menu, possibly edited, with archived dishes and renamed stations) keep every byte:

- No key moves. The real namespace is the current one.
- No state field is added or rewritten on load. `catalog` and `modules` are absent on these saves and absent means barbecue-derived and cook-ahead on.
- `validateBackup` keeps today's merge-and-restore logic for any state without `catalog: 'own'`. Only a state carrying the marker skips the two restore loops and the config-merge of known ids (3203, 3225, and the `base` lookups at 3190 and 3210).
- Backups made before the change import into the new build exactly as they do now. Backups made after the change by a legacy-shaped kitchen are identical in shape. Backups made by a blank-start kitchen carry `catalog: 'own'`; imported into an older build they would gain the barbecue dishes back (a downgrade hazard, R8 in 3.7).
- A legacy owner who wants to throw the sample dishes away uses the existing wizard step 4 (archive). A cleaner "Start over with an empty menu" is a destructive action on `store` (not `reset()`, whose meaning stays): it exports a backup first, then replaces the state with `newState({ blank: true })`, keeping the PIN, tax and hours.
- `store.reset()` and `resetLive({ keepSettings: false })` in the real namespace return to the blank state once the real first run is blank; in legacy contexts (tests that call `init()` with no mode) they behave as today.

`store.init` takes a new `mode` option. `boot` passes the page's mode. `init()` called with no `mode` (every unit test) keeps today's behavior exactly. This is how the 499 tests stay untouched while the product changes.

### 3.6 Menu import, an optional later feature (f)

Only after the blank start and the add-dish form are solid. Input is a small CSV or JSON file the owner writes or exports from a spreadsheet. The importer adds dishes through `addMenuItem` (and ingredients through `addIngredient`), one transaction, all or nothing. Rules:

- File size at most 256 KB; at most 150 dishes in total with the existing menu (`MENU_MAX`); at most 60 ingredients; one recipe has at most 12 lines (existing limit).
- Required columns: name, price. Optional: station, category, prep seconds, track, short name, recipe as `ingredient:quantity` pairs.
- Names: trimmed, 1 to 60 characters, no control characters, unique case-insensitive within the file and against the existing menu; duplicates are reported, not merged.
- Price: dollars with an optional `$`, 0 to 1000, at most two decimals. A comma decimal is accepted only if unambiguous. Blank is refused (never defaults to 0).
- Station and category: matched by name or id (case-insensitive) against the existing lists; an unknown station is refused; an unknown category goes to "Other".
- Prep seconds: 5 to 3600; blank uses the default and marks the time unconfirmed.
- Ingredient quantities: grams or pieces, greater than 0, at most 100,000; units are the ingredient's unit.
- Cells that begin with `=`, `+`, `-`, `@` or tab are kept as text (the store already guards CSV export the same way, `30-store.js` `cell`).
- Ids are never taken from the file; they are always minted by the engine so a file cannot collide with a demo id or a prototype key (`safeKey`).
- A preview step shows what will be added and every refused row with the reason; nothing is added until the owner confirms. Undo is a single "remove what this import added" for the next 10 minutes (archive, since dishes cannot be deleted).
- The importer never reads files outside the picker and never fetches anything.

### 3.7 Risks (g, first half)

| # | Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|---|
| R1 | `validateBackup` re-seeds a blank save (proven, 2.2). | certain until fixed | a new owner's menu is buried under 21 barbecue dishes after one reload | `catalog: 'own'` marker; skip restore for it; test that a blank save round-trips with zero repairs |
| R2 | A change to `newState` or `defaultSettings` shifts the demo's bytes. | medium | demo differs, tests drift | new option only, new function for blank settings; golden hashes (section 3.8) checked in CI and in every step |
| R3 | Storage mapping misses a key (new feature adds a key later). | medium | demo writes into a real key | mapper isolates by default; guard test classifies every `smokebox.` literal |
| R4 | Demo shares the tab channel. | certain today | demo state reaches real tabs through `adoptState` | channel name per mode; hub refuses demo |
| R5 | A real tablet ends up in demo (or back) at the wrong moment. | low | someone enters real orders into the demo | per-tab session flag; permanent demo bar; real mode is the default; the demo banner cannot be dismissed |
| R6 | Cook-ahead switch hides a batch that still holds food. | low | missed expiry | the cabinet stays visible while any batch holds food; turning it off with food in the cabinet shows a one-line reason |
| R7 | `cat` enum frozen at load rejects a category added live. | medium | A2's "add a category" fails until reload | make the enum a live lookup (like `workZones`) in round 3 |
| R8 | Downgrade: an older build opens a blank-start save and restores 21 barbecue dishes. | only on rollback | owner sees barbecue dishes appear (nothing is lost) | stage the release; keep the old build's restore behavior read-only; rollback plan (3.9) |
| R9 | Unit tests and e2e suites that cold-boot the app and order barbecue dishes. | high for e2e | failures when first run is blank | `init()` without `mode` unchanged for unit tests; e2e scripts enter the demo (`?demo`) or seed a state (A6) |
| R10 | Modifier chips, combos and the tour are config-driven and show barbecue content outside the demo. | certain until fixed | the "nothing barbecue loaded" promise is broken in small ways | mode-aware lists in the order sheet; tour only in demo |
| R11 | `0` cost recorded for dishes without a recipe or cost (2.5). | certain until fixed | wrong food cost and margin figures | round 2 engine fix; metrics already read a non-number as unrecorded |
| R12 | Glance card, what-if and default picks hard-code `brisket`. | certain | wrong or empty cards for other kitchens | generic out-of-stock card; cook-ahead pages hide |
| R13 | `sessionStorage` blocked or cleared by a private window. | low | mode reads as real; demo flag lost | real is the safe default; demo re-entry works; a blocked sessionStorage disables the demo entry with a message rather than guessing |
| R14 | Simulated channel feeds keep logging for a blank kitchen. | certain | noise in 86 log and analytics | UI hide first; engine skip behind a second module flag if it proves noisy |

### 3.8 Build order for rounds 2 to 8 (g, second half)

Every step: the existing 499 unit tests pass unchanged, `node tools/build.mjs --quiet` builds, `node tools/comment-audit.mjs` passes, the golden hashes below are unchanged, and no e2e suite is run by agents. Each step is its own commit and can be reverted alone. Steps marked (A5) are engine, store or config work; others are listed so ownership is clear.

Golden hashes, taken in round 1 on b8e569e (first 16 hex of the sha256 of `JSON.stringify(...)` with `now = 1780326000000`): `newState({now})` d1e3dde4245f337c; `newState({now, starter:true, stagger:true})` 1c01446dc2188340; `newState({now, starter:false})` a0611925cf0dd67d; `newState({now, empty:true})` 341a3ab02b13a469; `defaultSettings()` f13053e155e5c4dc.

| Round | Step | Tests it needs |
|---|---|---|
| 2 (A5) | 2a. Add `test/clean-start.golden.test.mjs`: the five hashes above, and `validateBackup(demo state)` repairs `[]`. Land before any engine change. | itself |
| 2 (A5) | 2b. `newState({ blank: true })` and `blankSettings()`: empty lists, `catalog: 'own'`, `modules.cookAhead: false`, `pacing.enabled: false`. | blank state passes `checkInvariants`; no barbecue ids anywhere (walk every key); size under 2 KB; `newState()` hashes unchanged |
| 2 (A5) | 2c. `validateBackup`: with `catalog: 'own'` skip both restore loops and config merge; keep the marker through the repair. | blank round-trips with 0 repairs; blank plus a custom dish round-trips; a legacy empty-menu save still restores (old behavior); fuzz: random blank-shaped states never throw; the existing `engine.fuzz` and `engine.soak` still pass |
| 2 (A5) | 2d. `completeItem`: leave `cost` unset when no recipe line has a known unit cost; same for the event. | no-recipe dish gives metrics `cost null`, `coverage 0`; barbecue item costs unchanged (hash); `foodCostPct` on mixed data counts only costed lines |
| 3 (A5) | 3a. `addIngredient` action plus `ING_PATCH.archived`; new report ids if needed (plain-English text each). | creates stock and ledger entry; invariants hold; id never equals a config id; limit on count; undo not needed; books balance after restock and use |
| 3 (A5) | 3b. `addMenuItem` defaults for missing zone, category, prep time, track; `cat` enum becomes a live lookup. | old strict calls give the same reports; default call yields `prepConfirmed: false`; a category added live is accepted |
| 3 (A5) | 3c. Dish-owned portion ingredient: helper that creates the hidden `ea` ingredient and the one-line recipe in one transaction; `restock` of it. | order, complete, restock, 86 at level, undo of done restores the portion |
| 3 (A5) | 3d. Module flag: `E.moduleOn(state, 'cookAhead')`, `SET_SCHEMA.modules`, refusal of batch actions when off, `checkInvariants` bom-line check. | flag absent means on (all old tests); off refuses `addBatch` with a plain report; on with a legacy save changes nothing |
| 4 (A5) | 4a. Store: `init({ mode })`; real blank first run; `reset()` / `startOver()` blank in real mode; `setSpeed` refused above 1 in real mode; dataset ignores sample in real mode. | `init()` with no mode unchanged (store tests); real first run is blank and writes nothing until an action; reset gives blank; hash of the written envelope for a legacy save is unchanged |
| 4 (A5, with the owner of `00-util`) | 4b. Storage mapper in `U.storage`, mode detection, channel name per mode, envelope `mode` and import refusals. | guard test enumerating every `'smokebox.` literal; a spy storage proves a demo session makes zero writes to real keys and the reverse; two stores in one process with different modes do not see each other; wrong-mode import refused with the right report |
| 5 (A2) | 5a. Setup UI: first-run form (kitchen name optional, tax, hours), add dish (name, price), add a few dishes in a row, optional portions count, optional ingredients, cook-ahead switch. | A2's tests; A5 supplies the actions and the reports |
| 5 (A2/A5) | 5b. "Try the demo" entry and bar, "Back to my kitchen", "Restart the demo"; order sheet hides combos and uses neutral modifiers outside demo; tour demo-only; welcome card text for blank. | UI tests by A2/A6; engine side already covered |
| 6 (A5/A2) | 6a. Cook-ahead hiding in board, sheets, office, deadlines, sounds (one helper `moduleOn` in the UI layer). | each hidden surface has a test that it is absent when off and present when on or absent; legacy save with batches keeps the cabinet visible |
| 6 (A5) | 6b. Metrics: no config layering for `catalog: 'own'`; generic "Out right now" glance card. | metrics tests with `own` datasets; glance model tests |
| 7 (A5/A6) | 7a. Menu import (3.6), behind the working add-dish flow. | validator tests for every rule in 3.6, hostile cells, oversize file, all-or-nothing |
| 7 (A6) | 7b. Review pass: e2e scripts that cold-boot (14 files mention barbecue dishes) updated to enter the demo or seed a state. | A6 chooses which to run, not the agents |
| 8 | 8a. Soak: 12,000-step random fuzz on blank-start states (engine.fuzz variant), backup import/export loops, two-tab sync in each mode. 8b. Comment and doc pass; update `HANDOFF.md` section 1 and `docs/smokebox.z.md` with the new option, marker and flag. | existing fuzz and soak suites plus the new variants |

### 3.9 Rollback plan (h)

- Every step is an independent commit on a branch; any of them reverts alone. The golden-hash test makes a bad revert visible.
- Staged release: ship rounds 2 and 3 (engine and store capabilities, no behavior change for anyone) first. They are inert until `boot` passes `mode`. The behavior change (blank first run, demo namespace) is the single switch in `99-boot.js` that passes `mode`. Rolling that one line back returns the product to today's behavior while keeping all new tests.
- Data safety on rollback: real keys are never renamed or moved, so reverting the build cannot orphan data. The only hazard is a blank-start save opened by an old build (restores 21 barbecue dishes, R8). Until the first real blank-start user exists this is moot; after that, the rollback instruction is: export a backup first, then roll back, then re-import after re-roll-forward. A tiny forward-compatibility patch to the old restore rule (skip the restore when `catalog === 'own'`) can ship first, in round 2, so even an immediate rollback to round 2 build is safe.
- The demo namespace can be deleted at any time without touching real data: it is a prefix.
- If the module switch causes a surprise, forcing `moduleOn` to true everywhere is a one-line change that restores every hidden surface.

## 4. What I did not check

- No browser, no tablet, no real kitchen. All UI statements are from reading source.
- No e2e suite run (rules). Fourteen e2e and ux scripts mention barbecue dishes and will need attention once first run is blank.
- Not run: the order sheet, 86 board, hold sheet and office pages on an empty menu. They were read, not executed.
- Not verified: `mergeSchema` acceptance of a new `modules` key on a state that lacks it (round 2 spike).
- Not verified: iOS Safari behavior of `sessionStorage` when a home-screen app is closed and reopened (the design relies on it dying with the window).
- Not measured: size and speed effects of the mode mapper (expected negligible).
- Not checked: `docs/connected-plan.md` hub transport against the mode switch beyond "refuses demo".
- Not examined: Pitcall, by instruction.

## 5. Needs from others

From A2 (setup UI):
- The first-run form needs only name and price from the owner; the engine will fill station, category, prep time and track (3b). Decide the wording for "portions on hand" (Level 1 in 3.2) and whether it sits on the add-dish form.
- Decide if stations and categories are shown to a new owner at all, or only the defaults with neutral names (open question 1 below). The live category list needs the 3b fix before "add a category" works without a reload.
- A "Try the demo" entry, the permanent demo bar and "Back to my kitchen" (3.4). Hidden surfaces list in 3.3 is the complete list I found; tell me what I missed.
- Every sentence the engine returns (new report ids) will be plain English with the fix, per the repo style; send me wording preferences.

From A6 (test review):
- Review the golden-hash approach and the guard test for storage keys before step 4b.
- Own the e2e adaptation list (14 files) and decide which, if any, to run and when.
- Look for any existing test that calls `newState()` expecting a barbecue menu and passes only because the default is unchanged; those must be listed so nobody "cleans" the default later.

## 6. Open questions for Freddy

1. Neutral names for the four stations and five categories at first run (3.1), or keep the current barbecue-flavored names until the owner renames them? I recommend neutral.
2. Should an existing owner get an obvious "Start over with an empty menu" button, or only the existing "archive the sample dishes" step? I recommend both, with a backup taken first.
3. Should the simulated channel feeds (Counter POS, Online ordering and so on) exist at all for a real kitchen? I recommend hide now, remove later.
4. Pacing default OFF for a new kitchen: confirm.
