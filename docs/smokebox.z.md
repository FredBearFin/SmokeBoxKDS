# Smokebox KDS v2: Z-style specification of the engine

This is the formal companion to SPEC sections 5-10. It follows Wordsworth's style, as used for Pitcall: informal text, then a schema, then what it means. Each operation is made **total** by joining its success schema with error schemas that change nothing. The notation is ASCII:

```
+-- Name --------------------------    schema box: declarations above the bar, predicates below
| decl                                Delta S   = before S and after S'      Xi S = S' = S (and the SAME reference)
+---------------------------------    x?        = optional field ("unknown is not zero": absent, never 0)
| predicate                           #s = size, dom f = keys, ran f = values, <=> iff, => implies, /\ and, \/ or
+---------------------------------    tau       = the evaluation time of a state (the `now` of the apply/tick that made it)
```

The code is `src/js/20-engine.js` (`SB.engine`); the invariant checker `checkInvariants(state, now)` implements the predicates marked I1-I17. Property tests run every predicate after every step of 12,000+ random steps (`test/engine.fuzz.test.mjs`).

---

## 1. Given sets and constants

```
[TicketId, ItemId, MenuId, IngId, BatchId, SyncId, EventId]        opaque identifiers ('t_17', 't_17.2', 'b_3' ...)
Time   == Z  (epoch ms, virtual)      Grams == R, >= 0 ('ea' units for counted ingredients)
Zone   ::= pit | sides | fry | cold                                 (expo is a view, never a destination)
Channel ::= dine_in | takeout | drive_thru | third_party
Report ::= ok | unknownAction | unknownTicket | unknownItem | unknownMenu | unknownBatch | unknownIng | emptyOrder | badQty
         | tooManyItems | badCustomer | badChannel | noteTooLong | itemUnavailable | ticketNotActive | ticketNotExpedited
         | notAllDone | alreadyDone | alreadyFired | notQueued | nothingToDo | reasonRequired | badTemp | tempTooLow
         | notReheatable | notEnoughData | batchNotServable | badWeight | badPatch | outOfBounds | undoExpired | undoNothing
         | undoConflict | invalidBackup | exportTooLarge | storageBlocked
```

Pacing constants come from `state.settings.pacing` (owner-editable within bounds): `floorSec, qtyFactor, qtyCap, learnK, minFactor, maxFactor, outlierFactor`. The safety constants come from `state.settings.safety`, each bounded by `C.safetyBounds` (`hotHoldF >= 135` always).

```
qtyScale(q)          = min(qtyCap, 1 + qtyFactor * (q - 1))
estimate(m)          = learned(m).est   if m in dom learned,  else  menu(m).prepSec
linePrep(m, q)       = round(max(floorSec, estimate(m) * qtyScale(q)))
learnEst(n, ema, s)  = clamp((n * ema + learnK * s) / (n + learnK), minFactor * s, maxFactor * s)
```

## 2. Items and tickets

An item is one ticket line, routed to its menu item's zone at creation and snapshotted (name, price, plan). Timestamps exist only once the event has happened.

```
+-- Item -------------------------------------------------------------------------------------
| id : ItemId; menuId : MenuId; zone : Zone; qty : 1..20; track : {one, two}; price : R
| prepSec, offsetSec : N; fireAt : Time; rushed? : true; override? : true
| status : {queued, displayed, cooking, done}
| firedAt?, startedAt?, doneAt? : Time
| depleted? : seq {ing : IngId; g : Grams; batchId? : BatchId; short? : Grams}; cost? : R
+--------------------------------------------------------------------------------------------
| firedAt defined   <=> status /= queued                                             [I3]
| doneAt defined    <=> status = done                                                [I3]
| startedAt defined  => track = two /\ status in {cooking, done}                     [I3]
| status = cooking   => startedAt defined                                            [I3]
| depleted defined  <=> status = done   (undo removes it again)
+--------------------------------------------------------------------------------------------
```

```
+-- Ticket -----------------------------------------------------------------------------------
| id : TicketId; num : N; serviceDate : Date; channel : Channel; customer : String(1..40)
| createdAt : Time; rush, pacing : Bool; dmaxSec : N; src : {live, demo, sample}
| status : {active, expedited, voided}; recalls : N; forced? : true
| expeditedAt?, voidedAt? : Time; voidReason? : String(1..40)
| items : seq1 Item   (#items <= 30)
+--------------------------------------------------------------------------------------------
| serviceDate = date(createdAt - dayStartHour)                                       (F13)
| forall i : items . createdAt <= i.firedAt <= i.startedAt <= i.doneAt  (where defined)   [I3]
| forall i : items . i.zone in Zone  (never expo)                                    [I6]
| forall i : items .                                                                 [I5]
|     i.offsetSec = (if i.rushed \/ dmaxSec = 0 then 0 else dmaxSec - i.prepSec)
|  /\ 0 <= i.offsetSec <= dmaxSec  /\  i.fireAt = createdAt + 1000 * i.offsetSec
| status = expedited  <=> expeditedAt defined                                         [I4]
| status = expedited /\ not forced  =>  forall i : items . i.status = done           [I4]
| status = expedited  =>  expeditedAt >= max { i.doneAt | i in items }               [I4]
| status = voided     =>  voidReason defined /\ voidedAt defined                     [I11]
+--------------------------------------------------------------------------------------------
```

Planned firing is the research formula: `D_max = max d(i)`, `O(i) = D_max - d(i)`, with item i shown when `now >= createdAt + O(i)`. `dmaxSec = 0` records "not paced" (rush at creation, or pacing off). An item fired by `setRush` keeps a consistent plan: offset 0, `fireAt = createdAt`, `rushed`.

## 3. Batches (hold cabinet)

```
+-- Batch ------------------------------------------------------------------------------------
| id : BatchId; ing : IngId (tcs); kind : {hot, cold, cooling}; enteredAt : Time; maxHoldH? : R
| cookedG : Grams; remainingG : Grams; rawG?, yieldPct?, costPerCookedKg?, endpointC?, holdH? : R
| temps : seq {t : Time; f : 32..300}; lastTempF?, lastTempAt?, outSince? : Time; reheats : N
| coolStartAt?, stage1At?, finalAt? : Time      (cooling only)
| status : {ok, check, reheat, chill, discard}; action : GateAction; canServe : Bool
| discardedAt? : Time; discardReason? : {expired, temp, cooling, manual, quality, other}; wasteG? : Grams
+--------------------------------------------------------------------------------------------
| remainingG >= 0                                                                    [I1]
| status = discard  =>  canServe = false /\ remainingG = 0 /\ wasteG defined         [I8]
| kind = cooling    =>  canServe = false                                             [I8]
| remainingG > 0 \/ kind = cooling  =>  (status, canServe) = gate(self, tau, safety) [I8, at tau]
+--------------------------------------------------------------------------------------------
```

An empty pan (`remainingG = 0`, not cooling) is **frozen**. Nothing can be served from it and nothing is wasted, so its gate is not re-run (F-E4). Undo that puts grams back unfreezes it.

The gate is a total function of a batch, a time and the safety settings. The first matching row wins. `hold = min(maxHoldH, defaultMaxHoldH)`.

```
gate(b, t) for kind hot | cold:
  1  t - enteredAt > hold                                     -> DISCARD_LOCKOUT  'expired'   canServe false
  2  hot,  outSince def, reheats >= 1                         -> DISCARD_LOCKOUT  'temp'      (single reheat only)
     hot,  outSince def, t - outSince > belowHotGraceH        -> DISCARD_LOCKOUT  'temp'
     hot,  outSince def                                       -> REHEAT_IMMEDIATE             canServe false
     cold, outSince def, t - outSince > aboveColdGraceH       -> DISCARD_LOCKOUT  'temp'
     cold, outSince def                                       -> CHILL_NOW                    canServe false
  3  lastTempAt undef  \/  t - lastTempAt > tempCheckEveryMin -> CHECK_TEMP  (warn; bad past 2x)   canServe true
  4  otherwise                                                -> NONE                          canServe true
gate(b, t) for kind cooling (never servable): finalAt def -> NONE ('cooled'); t > coolStart + totalH -> DISCARD 'cooling';
  no stage1 reading by coolStart + stage1H -> REHEAT_IMMEDIATE (DISCARD if already reheated once); else CHILL_NOW.
```

`outSince` is the first out-of-range **reading** that has not been corrected (hot: below `hotHoldF`; cold: above `coldHoldF`). This differs from the research sample code on purpose (F-E1). A hot batch is corrected only by its single reheat to `reheatF`. A `logTemp` at reheat temperature inside the grace window counts as that reheat. A cold batch is corrected by any later in-range reading.

## 4. The state

```
+-- Kitchen ----------------------------------------------------------------------------------
| settings; menu : seq MenuItem; ingredients : seq Ingredient
| tickets : seq Ticket                     (oldest -> newest, sorted by id sequence)
| batches : seq Batch; stock : IngId -|> Grams   (non-TCS only)
| manual86 : MenuId -|> {since}; avail : MenuId -|> {ok, reason, ing, since}
| syncs : seq Sync; learned : MenuId -|> {n, ema, est}; sanitize : {lastAt?, dueAt}
| seq : {ticket, batch, event, sync, undo : N; byDate : Date -|> N}
| events : seq Event; eventArchive : seq seq Event     (allEvents = concat archive ^ events)
| undo : seq UndoEntry (<= 20); ledger : IngId -|> {open, in, prunedUsed, prunedWaste, prunedRemain, dropped}
| rev : N
+--------------------------------------------------------------------------------------------
| forall k : dom stock . stock k >= 0                                                [I1]
| forall g : ingredients .                                                           [I2]
|     open + in - used(g) - prunedUsed - waste(g) - prunedWaste - prunedRemain - dropped
|        = physical(g)            (within 0.5 g)
|   where used(g)  = sum { r.g | t in tickets, i in t.items, r in i.depleted, r.ing = g }
|         waste(g) = sum { b.wasteG | b in batches, b.ing = g }
|         physical(g) = (if g.tcs then sum { b.remainingG | b in batches, b.ing = g } else stock g)
| forall s : batches . I8 (above); servable(g) counts only b.canServe /\ status /= discard /\ kind /= cooling
| allEvents is non-decreasing in t                                                   [I9]
| ticket ids, item ids unique; (serviceDate, num) unique; seq.ticket >= every id seq  [I10]
| forall t : tickets . t.recalls >= 0                                                [I11]
| forall m : dom learned . minFactor * prepSec(m) <= learned(m).est <= maxFactor * prepSec(m)   [I14]
| forall m : menu . avail(m) |> {ok, reason, ing} = availability(self, m)            [I15]
| lastClose = <> \/ (lastClose.day is a YYYY-MM-DD date /\ lastClose.at is a time /\ lastClose.leftovers in {keep, discard})   [I17]
| forall t : tickets, i : t.items . t.status = active /\ i.status = queued => i.fireAt > tau     [I5, at tau]
+--------------------------------------------------------------------------------------------
```

The ledger turns I2 into a real check: two records are kept independently, the depletion records on items and the grams in pans and stock, and they must agree whatever was pruned, discarded or undone. Behavioural invariants (I7, I12, I13) are properties of operations, stated in section 6.

```
availability(s, m) =
  (false, manual, -)   if m in dom manual86
  (false, safety, g)   if some TCS g in bom(m) has servable(g) <= 0 and (locked grams of g > 0, or the newest batch of g
                       was discarded for expired | temp | cooling)
  (false, stock, g)    if some g in bom(m) has servable(g) - qty <= 0 or servable(g) <= thresholdG(g)
  (true, null, null)   otherwise
```

## 5. Initial state

```
+-- InitKitchen -------------------------------------------------------------------------------
| Kitchen'; now? : Time; empty? : Bool
+--------------------------------------------------------------------------------------------
| tickets' = <>; events' = <>; undo' = <>; learned' = {}; manual86' = {}; sanitize' = {dueAt = now?}
| not empty? => one 'starter' batch per TCS ingredient (parG, reading 155 F hot / 38 F cold at now?) /\ stock' = parG
| empty?     => batches' = <> /\ stock' = 0
| ledger'(g).open = physical(g); avail' = availability for every menu item (since = now?)
+--------------------------------------------------------------------------------------------
```

The first sanitise is due at once: it is honestly unknown when surfaces were last done.

## 6. Operations

Every operation is `apply(s, type, payload, now)`. It first catches up the kitchen to `now` (`Tick`), then runs the action. Totality:

```
+-- Refuse(r) ----------------------------------------------------------------------------------
| Xi Kitchen; report! : Report
+--------------------------------------------------------------------------------------------
| report! = r /\ r /= ok /\ s' == s        (the same reference: the catch-up tick is thrown away too)   [I12]
+--------------------------------------------------------------------------------------------
Op == OpOK \/ Refuse(r1) \/ Refuse(r2) \/ ...      the guards of the Refuse cases cover every input not accepted by OpOK
```

An exception inside a handler is caught and returned as `badPatch` with `info.internalError`. The fuzz test asserts that this never happens. Unknown types (including `"__proto__"`, `"constructor"`, `"toString"`) give `unknownAction`; a non-finite `now` gives `badPatch`.

### 6.1 CreateTicket

```
+-- CreateTicketOK -----------------------------------------------------------------------------
| Delta Kitchen; lines? : seq {menuId; qty; mods}; customer?; channel?; note?; rush?; createdAt?; src?
+--------------------------------------------------------------------------------------------
| 1 <= #lines? <= 30;  forall l . l.menuId in dom menu /\ not archived /\ l.qty in 1..20
| forall l : lines? . avail(l.menuId).ok                                              [I7]
| createdAt in [now - 48h, now]  (any past time when allowPast)
| let d = (linePrep(l.menuId, l.qty) | l in lines?); paced = pacing.enabled /\ not rush?
|     D = (if paced then max d else 0)
| tickets' = tickets ^ <t> where t.id = 't_' (seq.ticket + 1), t.num = byDate(serviceDate) + 1 (101 first),
|     item k: zone = menu(l.menuId).zone, prepSec = d k, offsetSec = (if paced then D - d k else 0)
| every item with fireAt <= now is displayed with firedAt = fireAt (exact plan time)
+--------------------------------------------------------------------------------------------
CreateTicket == CreateTicketOK \/ Refuse(emptyOrder | badPatch | tooManyItems | badCustomer | badChannel | noteTooLong
                | outOfBounds | unknownMenu | badQty | itemUnavailable)
```

### 6.2 Item and ticket flow

| op | precondition (else report) | effect |
|---|---|---|
| AdvanceItem | ticket (`unknownTicket`), item (`unknownItem`), ticket active (`ticketNotActive`), not done (`alreadyDone`), not queued (`nothingToDo`, info.why `onDeck`) | displayed+two -> cooking, `startedAt = max(firedAt, now)`; otherwise -> done (see Complete) |
| CompleteItem | as above | displayed/cooking -> done |
| FireNow | ticket, item, active; status queued (`alreadyFired`) | displayed, `firedAt = max(createdAt, now)`, `override` |
| CompleteZone | ticket; zone in Zone (`badPatch`); active; some not-done item in zone (`nothingToDo`) | every such item done; queued ones count as `override` |
| BumpTicket | ticket; active; all done unless `force` (`notAllDone`, info.remaining) | expedited, `expeditedAt = max(now, createdAt, all item stamps)`, `forced` iff items left |
| RecallTicket | ticket; expedited (`ticketNotExpedited`) | active, `recalls + 1`, `expeditedAt` removed; due queued items fire now (F-E3) |
| VoidTicket | ticket; reason 1..40 (`reasonRequired`, `noteTooLong`); active | voided, `voidedAt`, `voidReason` |
| SetRush | ticket; `on` boolean (`badPatch`); active; changes something (`nothingToDo`) | on: queued items -> displayed now, offset 0, `fireAt = createdAt`, `rushed` |

**Complete (shared by every path to done):** `doneAt = max(startedAt ?? firedAt, now)`. Depletion: for each BOM line, `need = qty_bom * item.qty`. TCS ingredients draw first-in-first-out from servable batches (oldest `enteredAt` first, never a locked one: I8). Others draw from `stock`. What cannot be drawn is recorded as `short` and logged (`stock_short`); nothing goes negative (I1). Learning: unless `override` or (two-step with no `startedAt`), `sample = min((doneAt - (startedAt ?? firedAt)) / 1000 / qtyScale, outlierFactor * starter)`, `n' = n + 1`, `ema' = (n = 0 ? sample : 0.8 ema + 0.2 sample)`, `est' = learnEst(n', ema', starter)` (I14).

### 6.2b Orders and closing the day

| op | precondition (else report) | effect |
|---|---|---|
| CloseDay `{ leftovers?: keep or discard }` | `leftovers` is keep (default) or discard (`badLeftovers`); **no order is open** (`ordersStillOpen`, info `count`, `orderIds`, `customers`): each one must be paid or voided first | appends one `day_closed` event for the service day of `now`, sets `lastClose = { day, at, leftovers }`. With discard, every batch still holding food is discarded as reason `other` (a plain, non-safety discard) and the grams land in waste, so I2 holds. Not undoable. |

`day_closed` carries, for the paid orders whose `paidAt` falls in that service day: `orders`, `subtotal`, `discount`, `tax`, `total`, `tip`, and `byMethod` (`cash`, `card`, `other`, each with `count`, `subtotal`, `discount`, `tax`, `total`, `tip`, in dollars to the cent). It also carries `voidedOrders`, `tickets` and `voidedTickets` for that day, `leftovers`, `discarded` (batches), `discardedG`, and `again` (true when that day was closed before). Closing the same day twice is allowed on purpose: late sales after the first close are caught by the second, which covers the whole day. `resetLive` clears `lastClose`. Saves written before this action have no `lastClose`; `validateBackup` accepts that and drops a malformed one (`repaired` says `lastClose dropped`).

### 6.3 Stock, availability and the hold cabinet

| op | precondition (else report) | effect |
|---|---|---|
| Toggle86 | menu item (`unknownMenu`); `on` boolean; changes something (`nothingToDo`) | `manual86` set/removed |
| Restock | ingredient (`unknownIng`); `0 < g <= 1e6` (`badWeight`) | non-TCS: `stock + g`; TCS: a new batch with **no** reading (status `check`, servable) |
| AddBatch | TCS ingredient; `tempF in 32..300` (`badTemp`); a weight (`badWeight`) | thermal: `cookedG = round(rawG * hot% / 100)`; else `rawG * yield` or `cookedG` as given; first reading sets `outSince` when out of range |
| LogTemp | batch (`unknownBatch`); not discarded (`batchNotServable`); `tempF in 32..300` | reading appended; `outSince` updated (sec. 3); gate re-run, discard if locked out |
| ReheatBatch | batch; not discarded; not cold (`notReheatable`); `tempF >= reheatF` (`tempTooLow`); `reheats = 0` (`notReheatable`); out of range (`nothingToDo`); inside grace (`notReheatable`) | `outSince` cleared, `reheats = 1` (cooling: restart cooling) |
| StartCooling (P2) | batch; hot; has grams (`nothingToDo`); `0 < g <= remainingG + 0.5` (`badWeight`) | grams move to a new `cooling` batch (never servable) |
| DiscardBatch | batch; reason in the list (`reasonRequired`); not discarded (`batchNotServable`) | `wasteG = remainingG`, `remainingG = 0`, status discard |
| SanitizeDone | none | `lastAt = now`, `dueAt = now + sanitizeEveryH`; records on-time or late |

After every action and every tick that touches a batch, stock, `manual86`, the menu or ingredients, `avail` is recomputed (I15). Each change appends `avail_changed`. A change of `ok` creates a simulated sync record whose four channel targets complete `2 + (hash(syncId|target) mod 38001 ms)` later. That is deterministic, never random, and always inside the 60-second target.

### 6.4 Settings and catalogue

`UpdateSettings`, `UpdateMenuItem` and `UpdateIngredient` accept only whitelisted keys (`badPatch` names the offending key) and in-bounds values (`outOfBounds` with `min` and `max`). A patch that changes nothing gives `nothingToDo`. Changing safety settings re-runs every gate. Changing pacing bounds or a starter `prepSec` recomputes `learned.est` (I14). `ResetLive` keeps settings, menu, ingredients and learned unless `keepSettings = false`, keeps the id counters (ids are never reused) and restores the starter stock.

### 6.5 Undo

```
+-- UndoOK -------------------------------------------------------------------------------------
| Delta Kitchen
+--------------------------------------------------------------------------------------------
| undo /= <> /\ now <= last(undo).expiresAt
| the things last(undo) touched still carry the values it wrote (else Refuse(undoConflict))
| s' restores every field the action changed, from INVERSE data (before-values, depletion records), not a snapshot,
|   so an unrelated change made in between is kept                                   [I13]
| events of the undone action are kept, marked reverted; an 'undo' event is appended
+--------------------------------------------------------------------------------------------
Undo == UndoOK \/ Refuse(undoNothing) \/ Refuse(undoExpired) \/ Refuse(undoConflict)
```

I13, as tested: `strip(undo(apply(s, a, now), now)) = strip(tick(s, now))` for every undoable `a` (advanceItem, completeItem, completeZone, bumpTicket, voidTicket, toggle86, fireNow, discardBatch, sanitizeDone). Here `strip` drops `events`, `eventArchive`, `undo`, `rev`, the `seq.event/sync/undo` counters and `syncs` (the simulated channel feed really did see the 86 and then the un-86). `avail.since` is restored. If a batch the undone depletion drew from has since been discarded or pruned, those grams are booked in `ledger.dropped` (I2 holds) and the report is `ok` with `info.partial`.

### 6.6 Tick

```
+-- Tick ---------------------------------------------------------------------------------------
| Delta Kitchen; now? : Time
+--------------------------------------------------------------------------------------------
| forall active t, queued i . i.fireAt <= now?  =>  i' displayed /\ i'.firedAt = i.fireAt     (exact, at any clock speed)
| forall sync targets . dueAt <= now? => doneAt = dueAt  (sync_done, latencyMs = dueAt - t)
| forall non-empty batches b . now? > statusDeadline(b) => b' = gate(b, now?) applied; DISCARD_LOCKOUT discards
| nothing due  =>  s' == s  (same reference; O(1) via a memoised next deadline)
+--------------------------------------------------------------------------------------------
```

`tick` never changes `rev`, because only actions are announced to other tabs. Sanitise overdue is a warning, never a block, so `tick` does not touch it.

## 7. Backups

`validateBackup(x)` is total. It returns `{ok: true, state, repaired}` or `{ok: false, error}` and changes nothing. It repairs fields one at a time: settings out of bounds fall back to defaults, negative stock becomes 0, unsafe ids are dropped, a ticket whose own invariants fail is dropped, and a ledger that no longer balances is re-opened at the current physical stock. Anything left inconsistent is refused. `serialize` then `validateBackup` is the identity up to the undo stack (tested).

## 8. Store obligations (SB.store)

The clock `now = base + (real - realBase) * speed` is clamped so that it never decreases (I9). `setSpeed` rebases without a jump, and a reload continues from the saved virtual time at x1. The only exception is `reset`/`resetLive`: they bring a demo-sped clock back to real time, which is safe because the new state holds no stamps. Persistence is debounced at 400 ms and flushed on `pagehide`/hidden when there are unsaved changes. A pristine first run is not written until something happens, so storage that was just cleared is not brought back. A payload that fails `validateBackup` is kept under `smokebox.v1.corrupt` and the app starts fresh. If storage refuses on quota, the store halves the persisted history (through `prune`, so I2 holds) rather than losing the save. A refused user action appends `ui_report` (except `nothingToDo`).

**Transport and outbox.** The store talks to other tabs, other devices and a future server through a pluggable transport (`open(deliver)`, `post(msg)`, optional `push(entries)`, `close()`); the full contract is the "TRANSPORT INTERFACE" comment block in `30-store.js`. The default is a same-browser `BroadcastChannel`. Every dispatched action gets an `opId` (outside the engine; the engine stays pure). When a transport can `push`, each successful person-made action is queued in a persisted outbox (`smokebox.v1.outbox`) until the server acknowledges its `opId`; a server must treat a repeated `opId` as already done. An action arriving from elsewhere (`type: 'action'`) is applied once per `opId` and never re-queued.  A hub can send `type: 'state'` with the authoritative state and the `opIds` it includes; the store adopts it and replays its still-unconfirmed actions on top.

**Units.** `settings.ui.tempUnit` (`F` or `C`) and `settings.ui.weightUnit` (`kg` or `lb`) only change how numbers are shown. The engine and the saves keep degrees Fahrenheit (cook endpoints stay in Celsius, as before) and grams. The store keeps `SB.util.units` in step with the settings; screens use `U.tempText`, `U.tempTextC`, `U.tempShown`, `U.tempStored`, `U.weightText`, `U.weightShown`, `U.weightStored` and `U.unitLabel`. Old saves without the fields get `F` and `kg`.
