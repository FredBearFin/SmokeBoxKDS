# Connected mode (two tablets, one kitchen): staged design, not built

Round 16. Design only. Nothing here is built, promised or priced. It builds on `docs/connected-plan.md` (options and kill criteria) and the pieces that exist today: the hub prototype in `server/server.mjs`, the transport interface and outbox in `src/js/30-store.js`, and the pure engine. Effort is in working days for one engineer who knows the code, including testing, and assumes nothing slips. It excludes time with real tablets and real owners, which is calendar time the engineer does not control.

## 1. What a single-tablet pilot can say about this

Say to owners, plainly: "Smokebox runs on one tablet beside your POS, with no internet needed. Two tablets sharing one kitchen is designed on paper and is not available. If you want it, tell us how many screens you would use, whether the kitchen has internet, and whether a spare laptop could stay on during service." Do not say "coming soon", do not give a date or a price, and do not describe it as working. The pilot should collect, per owner: how many screens they would want (pit, counter, office phone), whether the kitchen has working internet at the pit, who provides the router, and whether they would pay more for it. Those answers are the kill criteria in `connected-plan.md` step 1 and 5. A single-tablet pilot cannot test sync, so it must not claim anything about it, including that "it will work the same".

## 2. What exists today (read from the code)

- **Engine:** `apply(state, type, payload, now)` is pure and deterministic, so the same actions in the same order give the same state on every screen. This is the strongest asset.
- **Store:** every action a person makes gets an `opId` (`tabId:counter`). Successful person actions go into a saved outbox (`smokebox.v1.outbox`) when the transport has `push`. The transport can deliver `ack`, `action`, and `state` messages. A `state` message makes the store adopt the hub's state and replay its own unconfirmed outbox on top. Round 15 made Start over drop the erased kitchen's queued actions.
- **Hub (`server/server.mjs`, 228 lines):** holds the state, applies each posted action with the hub clock, dedupes by `opId`, keeps a bounded recent-action log, streams changes over server-sent events (`GET /events?since=N`, snapshot if the log does not reach back), takes `POST /action`, ticks once a second, saves to a file. It limits body size and screens, and (after A6's round 13 fixes) checks content type and origin. There is no login in the hub itself; the deployed server puts Caddy with one shared password in front.
- **Tests:** `test/hub-sync.test.mjs` runs a real hub and two clients in Node: convergence, offline replay, duplicate opId, and Start over with queued actions.
- **Known gaps** (from the plan and the code): no pairing, no per-screen identity, no TLS inside the building, no version check on connect, recent log is in memory only, no visible "Connected" state, and the page served by the hub is the only place the browser will allow a plain-http hub address without trouble (see section 7).

## 3. Staged plan

Each stage ends with a go or stop decision. Do not start a stage before the previous one passes.

| Stage | What | Estimate | Stop if |
|---|---|---|---|
| 0 | Pilot of Solo finishes; owners say whether they want a second screen | calendar time, not engineering | nobody asks, or the gate fails |
| 1 | Make sync honest in Node: all actions go through the hub, clients always adopt the hub's state, ticket numbers match, refusals are explained, clock rules (below) | 6 to 8 days | two simulated clients cannot agree after a 10 minute outage with 200 queued actions |
| 2 | "Connected" in the product: the badge, the screen name, what each screen shows when the link drops, reconnect catch-up that the cook can see | 5 to 7 days | a cook loses a ticket or a pull in any test |
| 3 | Pairing and access: join code, a name per screen, rejecting unknown screens, version check | 4 to 6 days | an owner cannot pair two tablets unaided in 10 minutes |
| 4 | Hub packaging for the owner's own computer (option C): one file to run, start on boot, keeps running, update rule | 5 to 8 days | installs fail on more than one in three real machines |
| 5 | Real tablets, real network, one real service with an observer | 3 to 5 days of preparation plus the service and its follow-up | any lost or duplicated ticket, or a minute the board was unusable |

Total before the first real service: roughly 20 to 30 working days of engineering, then at least one observed service, then fixes. A realistic calendar estimate for a first owner-usable version is two months, not two weeks. If the order is "hosted" (option A) the server work (accounts, backups, monitoring, privacy) is a separate and larger project and is not covered here.

## 4. Conflict rules for an action log

The model is one ordered log. The hub applies actions in arrival order using its clock; every screen ends with the hub's state. That removes most merging, but the cook must still understand outcomes.

- **Same ticket, two screens.** Both bump: the second is refused by the engine (already done) and the screen shows the ticket as done, not an error. Both advance an item: the second is `alreadyDone` or `alreadyFired`; the screen refreshes silently. Void against bump: whichever arrives first wins; the other is refused with the engine's existing reason, and the screen says in words what happened ("This order was already paid at the counter").
- **Pulls.** Both screens pull the same batch: both apply, in order, and the second may be short (`short` in the event). Weight is never lost; the cabinet total may go lower than either cook expected. The screen shows the new total after each pull.
- **Stock and 86.** Last write wins for a toggle; counts add. A restock and a pull are commutative.
- **Safety actions** (log a temperature, reheat, discard, take out, put back): applied in arrival order, each with the person's initials. Two readings are both kept. A discard racing a pull: the later one is refused with `batchNotServable` and says so.
- **Settings.** Changes are applied in order; a screen with a settings sheet open sees a banner when another screen changes the same field. Settings that belong to a device (theme, text size, station on this tablet) are never synced.
- **Undo.** Undo is per person's last action and expires in seconds. In Connected mode undo is a normal action: it applies only if the screen's last undoable action is still the hub's last undoable action; otherwise it says "someone else changed this". This needs work in the engine (the undo stack is global state today) and is a real design decision, see risks.
- **Refused queued actions on reconnect.** A queued action the hub refuses is dropped and shown to the cook once ("1 of your offline actions was not applied: ..."). Never silently.
- **Clocks.** The hub clock is the truth. A queued action carries the time it was done; the hub trusts it only between the last applied action and the hub's own clock (this is already the rule in `server.mjs`). A screen whose clock is wrong by minutes must correct its display to `serverNow`. Needs a test with clocks wrong in both directions.
- **Food-safety clocks** (out-of-fridge time, cooling marks, reheat windows) are computed from the stored times in the state, so they agree on every screen. Warnings must still sound on a screen that has lost the hub: each screen keeps its own copy and runs the same deadline module.

## 5. What "Connected" shows

- A small badge in the top bar: Connected (green, with the screen name), Reconnecting (amber, "working on its own, N actions waiting"), Not connected (grey, Solo behavior).
- When actions are waiting, a count and the time of the oldest. After reconnect, a one-line result ("Caught up: 12 actions sent, 1 not applied").
- Never a blocking spinner and never a refused tap because of the link.
- On the Data page: the screen's name, hub address, last contact, how many actions are queued, and a button to leave Connected mode and go back to Solo (keeps its own copy).
- Wording says what is true: it must not claim backup. The hub's copy is one more copy on one computer, not a safe place.

## 6. Pairing and security (after A6's hub fixes)

- **Pairing:** the hub shows a short code (6 letters, one hour, one use) on its own screen or in its console; a tablet enters it once and receives a long random screen token it stores. Every request carries the token. Unknown tokens are refused. The owner can see the paired screens and remove one.
- **Where the hub runs:** a computer on the same local network, reached by its address. The hub serves the page itself, so the page and the hub share an origin and the existing origin and content-type checks keep working.
- **TLS:** a plain-http address on a private network works for a page the hub serves, but the browser treats such a page as not secure, which blocks some features (installable app, service worker, wake lock on some browsers). Options: accept http on the building's network with the pairing token, or issue a local certificate. This must be tried on the real tablets before choosing; do not assume.
- **Not allowed:** exposing the hub to the internet without TLS and a real login. The tunnel setup in `server/` is for remote viewing only and has its own review in `docs/audit/server-security-review.md`.
- **Rate limit and lockout** on pairing attempts; the token never appears in a URL that is logged.
- **Data:** the hub holds customer names on orders. The privacy note in `docs/privacy-and-retention.md` must be updated before anyone pairs a second screen.

## 7. What would have to be tested with real tablets

None of this has been done. All of it is needed before any owner is told it works.

1. The kitchen's actual Wi-Fi: signal at the pit and the counter, a 10 minute dropout log, and what the tablet does when it joins another network or loses power.
2. iPad Safari and Android Chrome (the likely tablets): can a page served over http from a local address stay open for a full shift, keep the screen awake, and keep sound alerts working when the tablet sleeps or the browser is in the background?
3. Whether the browser blocks a request to a local address from the page (private network access rules differ by browser and version) and whether the hub address survives a router restart (fixed address or name).
4. A real outage: unplug the router for 15 minutes during a busy hour; every screen must keep taking orders and sounding warnings, and catch up with no lost or duplicated ticket.
5. Two cooks hitting the same ticket and the same pan within a second.
6. A tablet reboot, a browser restart, a hub restart and a hub computer sleep during service; the screens re-sync from the log or a snapshot.
7. The owner's computer actually staying on; auto-update behavior of that computer in the middle of service.
8. Clocks set wrong on a tablet (minutes and a whole hour), including daylight saving night.
9. Memory and speed on the old hardware owners actually have, with a full day of history.
10. A setup done by an owner with no help, timed.

## 8. Risks and honest unknowns

- **Undo and Start over in a shared kitchen** change what other screens see; the rules in section 4 are proposals, not tested.
- **Size of the state** sent as a snapshot grows with history. Reconnect after a long outage downloads the whole state; storage budget work in `docs/audit/storage-budget.md` applies.
- **A hub is one more thing that can fail.** If it is down the screens run Solo, which is why the first rule is that no screen may depend on it to take an order or sound a warning.
- **Support cost.** Every installation of the hub on an unknown computer is a support call. The estimate in stage 4 is the least certain.
- **Not covered:** hosted accounts, card readers, delivery app links, and multiple locations.
