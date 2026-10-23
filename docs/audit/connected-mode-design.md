# Connected mode (several screens, one kitchen): hub-authoritative design, not built

Round 17 revision. Design only. Nothing here is built, promised or priced. It replaces the round 16 text, which assumed screens are equal writers that sometimes diverge. The new starting point, from Freddy: **connected is the normal case** (most kitchens have working Wi-Fi, and he already runs a hosted server and may use a laptop as the hub); **offline is the emergency case**. So the hub decides, and the screens follow.

Effort is in working days for one engineer who knows the code, including tests, excluding calendar time with real tablets and owners. It builds on `docs/connected-plan.md` (options A hosted, B box, C owner's computer, and kill criteria) and on A6's hub hardening (`docs/audit/server-security-review.md`).

## 1. The model in one paragraph

One hub holds the kitchen. Every action from every screen is sent to the hub, which applies them one at a time in arrival order with its own clock, using the same pure engine, and sends the result to all screens. A screen shows the hub's state. To feel instant it may show its own tap at once (the engine is deterministic, so it can predict what the hub will do), but the hub's state always wins and silently replaces the prediction. If the link drops, the screen says so loudly, keeps working from its own copy for a short outage, and queues its taps. When the link returns, the hub applies the queued taps in order and **answers each one** (applied, or refused with a plain reason such as "this ticket was already bumped on another screen"); the screen shows the cook that list. Nothing merges two local states: the hub's state is adopted, then the queued taps are re-applied on top, one by one, and each either works or is refused.

## 2. What this model drops, and what it adds

**Drops** (compared with the multi-writer design in round 16):

- Merging two diverged local histories, and any rule for which side wins field by field.
- Per-device ticket numbering and the repair after an offline replay (the hub numbers; screens adopt).
- A clock-reconciliation protocol between peers (only the hub clock matters; a queued tap's own time is clamped, which the hub already does).
- Settings conflict banners between screens (changes are serialized at the hub).
- Any need for screens to agree without the hub.

**New work or newly critical** (honest list):

1. **Ordering.** Easy (one process applies one action at a time) but the screen must handle its prediction being replaced mid-tap, and a tap answered after the screen already showed something else.
2. **The hub is a single point of failure.** If it is down the whole kitchen is in the emergency mode. Everything about the hub (starting on boot, restarting after a crash, not losing the last actions, backups) moves from "nice" to "required".
3. **Restart recovery.** Today the hub saves the state in a file 500 ms after a change, and keeps its answer log (`replies`, last 5,000 opIds) and action log (`ops`) only in memory. After a restart a screen that resends an action the hub had already applied would apply it twice, and an action acknowledged in the last half second could be lost. Needs a write-ahead record of applied opIds and a rule that the hub answers "applied" only after the record is on disk.
4. **Answers to the cook.** Today the hub's reply (report and info) exists, but the transport treats every HTTP 200 as "confirmed" and drops the reason. The store must carry each reply back so the screen can show "Not applied: ..." using the engine's existing plain-language report texts.
5. **Auth and pairing.** One shared password at the proxy (hosted) is not enough for screens that can act; each screen needs its own token.
6. **Version compatibility.** The hub runs one engine version and serves one page. A tablet that kept an older page (cached, or saved to the home screen) must be refused with a plain message, not applied with different rules. Needs a version stamp on every request and a refusal path.
7. **State size on the wire.** Measured in this round (`test/hub-follower.test.mjs`): the hub sends the **whole state** on every change. After 120 tickets the state is about 188,000 characters and a follower received about 12.3 million characters in 121 messages. Fine on a quiet local network for one service, wasteful for a hosted hub over mobile data, and it grows with history. The hub already attaches the single action (`op`) to each message and keeps an ordered log with `?since=N` catch-up; screens should receive only the action and re-run it (section 8, spike).
8. **A visible emergency mode** that cooks understand and cannot miss.

## 3. What exists today (read from the code, and what each gives)

- **Pure engine:** `apply(state, type, payload, now)` is deterministic. This is what makes "predict, then adopt the hub's state" and "replay the log to catch up" work. Spiked and shown to give identical states (section 8).
- **Hub, `server/server.mjs` (228 lines):** one state; `runAction` applies actions in order with the hub clock; dedupes by `opId`; clamps a queued action's own time between the last applied action and the hub clock; returns `{ report, info, seq }` for every action; keeps an ordered action log `ops` with `seq`; `GET /events` streams server-sent events (`snapshot`, `state`, `catchup` for `?since=N`, heartbeat `hb`); a once-a-second tick that pushes only when something changed; atomic state file; body, screen-count and log-size limits; content-type and same-origin checks on `POST /action`; a thrown action is a 500 that changes nothing.
- **Store and transport, `src/js/30-store.js`:** every person action gets an `opId`; successful actions are queued in a saved outbox (`smokebox.v1.outbox`) when the transport can push; messages `ack`, `action`, `state` come back; a `state` message makes the store adopt it and replay its own unconfirmed outbox on top (`replayOnto`); retry backoff 2 s up to 60 s; the outbox survives a reload; Start over drops the erased kitchen's queued actions and keeps the erase itself (round 15).
- **Tests:** `test/hub-sync.test.mjs` (real hub, two clients: convergence, offline replay, duplicate opId, Start over with queued actions); `test/hub-follower.test.mjs` (the spike).
- **Hosting:** Freddy's Hetzner server runs the hub behind Caddy with HTTPS and a shared password, with the nightly updater (reviewed in the security review).
- **Known gaps:** no pairing, no per-screen identity, replies not shown to the cook, whole-state pushes, answers and log only in memory, no version check, no visible connection state, plain `http` on a laptop hub (see section 7).

## 4. Staged plan with estimates

Each stage ends with a go or stop decision. A stage does not start before the previous one passed.

| Stage | What | Days | Stop if |
|---|---|---|---|
| 0 | Solo pilot finishes; owners say whether they want a second screen (calendar time) | none | nobody asks, or the gate fails |
| 1 | **Read-only follower** (the smallest slice, section 5): a second page that mirrors the hub's board with no controls | 6 to 8 | an owner is not interested in seeing it |
| 2 | **Hub writes for tablets:** taps go to the hub; screens show the hub's state; prediction and replacement; send only the action and re-run it with a snapshot fallback on any gap; the hub's answer shown to the cook | 7 to 9 | the board ever feels slower than Solo on a real tablet |
| 3 | **Emergency mode:** loud banner, queue, reconnect replay with the per-tap answers list, "the others have moved on" wording, a limit on how long a screen predicts alone | 4 to 6 | a tap is lost or applied twice in any outage test |
| 4 | **Hub reliability:** write-ahead record of applied opIds and acknowledge-after-save, restart test, auto-start and auto-restart (systemd on the hosted server; a launcher for a laptop), state backups, graceful stop | 5 to 7 | a restart loses or duplicates an action |
| 5 | **Pairing and version:** pairing code, a token and a name per screen, remove a screen, version stamp and plain refusal | 4 to 6 | an owner cannot pair two tablets unaided in 10 minutes |
| 6 | **Laptop hub packaging** (option C): one file to run, start on login, firewall note, power and sleep settings. Skip for hosted-only | 0 (hosted) to 6 | installs fail on more than one in three real machines |
| 7 | **Real tablets, real network, one observed service** (preparation, not the service itself) | 4 to 6 | any lost or duplicated ticket, or a minute the board was unusable |

**Total engineering before an owner relies on it:** about **30 to 43 working days** with a laptop hub, about **30 to 37** hosted only, then at least one observed service and its fixes. Realistic calendar time to a first owner-usable version: two to three months. The round 16 estimate (20 to 30 days) was too low: it left out stage 4 and the answers list, which this model makes mandatory. The savings from dropping merge rules are real (roughly 3 to 4 days off the old stage 1) but smaller than the new work.

**What an owner could be shown earlier:** after stage 1 (about 6 to 8 days), a second screen that follows. After stage 2 (about 14 to 17 days cumulative), two tablets that both take taps while the link is up, in a lab, not yet safe for service because stages 3 and 4 are missing.

## 5. The smallest first slice: a read-only follower

A second screen (a TV above the pass, an owner's phone, a manager's laptop) opens the hub's address and shows the board and the expo view, and the cabinet if cook-ahead is on, live. It has **no controls**, so there is **no conflict handling at all**: it cannot disagree with the hub because it never writes. It needs only what the hub already does: connect to `/events`, show the state it is given. Worth showing an owner because it is useful alone (a second set of eyes with no setup risk), it exercises pairing-free transport, reconnect and the connection badge, and it tells us whether owners want more.

What it needs: a "follow" mode in the app shell that loads the state from the hub instead of local storage and never saves it (so it can never write over a real kitchen on that device); the board and expo screens with write controls hidden or disabled; a connection badge (Following, Reconnecting, Not connected, last update time); a way to leave follow mode; and the hub address entered once. The spike already shows the mirror and the catch-up are exact (section 8). The one new decision is whether the follower may sound alerts (default off: only the cooking screen sounds, to avoid double alarms).

## 6. What happens to single-device mode

It stays as it is and is the default. With no hub address configured the store uses its own tab channel and local storage exactly as today; no network call is made; the tests that cover Solo (golden hashes, old-save fixtures, safety net, Start over) do not change. Connecting is an opt-in step in settings. Joining a hub is a deliberate choice with two options and no automatic merge: **use the hub's kitchen** (this device's local copy is kept as a backup file first, then replaced) or **send this device's kitchen to an empty hub**. Leaving Connected mode returns the device to Solo with its last copy of the hub's state. A device in follow mode never writes local storage. Demo mode never connects.

## 7. Security and network (after A6's hub fixes)

- **Pairing:** the hub shows a short code (6 letters, one hour, one use); a tablet enters it once and receives a long random token stored on the device; every request carries the token; the owner can list and remove screens; wrong codes are rate limited. A read-only follower can have a read-only token.
- **Where the hub runs:** hosted (Freddy's server, HTTPS, current Caddy password plus per-screen tokens) or a laptop on the building's network. The hub serves the page itself so page and hub share an origin and the existing origin and content-type checks keep working.
- **TLS on a laptop hub:** a plain `http` address works on a private network but the browser treats the page as not secure, which can disable the installable app, service workers and wake lock. Options: accept http with the token on the building's network, or a local certificate. Try on the real tablets before choosing.
- **Not allowed:** the hub open to the internet without TLS and a real login.
- **Data:** orders carry customer names. `docs/privacy-and-retention.md` must be updated before a second screen is paired, and a hosted hub makes the owner's data live on our server, which is a promise that needs wording.

## 8. The spike, `test/hub-follower.test.mjs` (test only, not wired into the app)

Three tests against the real `server/server.mjs`, no change to the hub or the app:

1. A follower that only reads server-sent events always equals the hub's state after a series of actions from another client, receives a full snapshot once and a `state` message per applied action, and receives nothing for a refused action.
2. A follower that was away reconnects with `?since=N`, receives one `catchup` message of the missed actions, replays them through the same pure engine (`E.apply(state, op.actionType, op.payload, op.now)`) and ends in **exactly the hub's state** (compared as JSON); no snapshot is needed. A change number the log cannot cover returns a full snapshot.
3. The size of the push: 188 KB of state and 12.3 MB received over 121 messages after 120 tickets.

What it proves: the follower idea needs no hub change; ordered replay is exact, which is the basis for sending only the action; whole-state pushes will not scale to a hosted hub and a busy day. What it does not prove: tick effects between actions were not in play (the test hub's tick was off), the browser side (a page, not a Node script), a real network, or any write path.

## 9. What would still have to be tested with real tablets

1. The kitchen's actual Wi-Fi at the pit and the counter, a 10 minute dropout log, and what the tablet does when it changes network or loses power.
2. iPad Safari and Android Chrome: a page served over http from a local address, kept open a full shift, awake, with sound alerts, in the background.
3. Whether the browser blocks requests to the hub's local address from the page (differs by browser and version) and whether the address survives a router restart.
4. A real outage: unplug the router for 15 minutes in a busy hour; every screen must keep taking orders and sounding warnings, then catch up with no lost or duplicated ticket and a readable list of refused taps.
5. Two cooks hitting the same ticket and the same pan within a second.
6. A tablet reboot, a hub restart, and a laptop sleeping mid-service.
7. Clocks set wrong on a tablet, and the daylight saving night.
8. Old hardware speed and memory with a full day of history.
9. A setup done by an owner without help, timed.
10. The hub on the owner's laptop actually staying on and not updating itself mid-service.

## 10. What a Solo pilot may say to owners about this

"Smokebox runs on one tablet beside your POS and works without internet. A second screen that follows the board, and two tablets sharing one kitchen, are designed and not available; no date and no price." Collect, per owner: how many screens they would want and what for (TV, phone, second cook), whether the kitchen has working Wi-Fi at the pit, whether a spare laptop could stay on during service or they would use a hosted address, and whether they would pay more. Do not describe any of it as working, and do not say it "will work the same as Solo".

## 11. Risks and unknowns

- **A single hub failure stops the whole kitchen's shared view.** Emergency mode must be good enough that a cook can carry on alone for a service; this is the stage most likely to take longer than estimated.
- **Undo across screens:** undo is the last action of the kitchen's undo stack today. With several writers it must mean "undo my last tap if nobody has acted on it since". That is an engine change not yet designed in detail.
- **Prediction vs. authority** can flicker if the screen shows something the hub then changes. Keep predictions to taps the cook just made and replace silently; test with a slow link.
- **Hosting promises:** if the hub is ours, uptime, backups and privacy become obligations.
- **Not covered:** card readers, delivery app links, multiple locations, hosted accounts and billing.
