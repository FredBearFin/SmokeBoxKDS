# Smokebox hub (PROTOTYPE)

A small Node process that keeps one shared kitchen state so several screens can show the same board. It is a **prototype for the connected plan** (`docs/connected-plan.md`). It is not part of the Solo offer, it does not change `dist/smokebox.html`, and the browser client transport is not wired yet (it is Agent 2's branch `a2/transport`). Zero npm dependencies; Node 22.

## Run it
```
node tools/build.mjs --quiet                       # writes dist/smokebox.html
SMOKEBOX_TZ=America/New_York SMOKEBOX_DATA=./hub-state.json node server/server.mjs
```
Then open `http://127.0.0.1:8787/`. The page served today is the normal single-file app; it does not talk to the hub until the transport lands.

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | listen port | 8787 |
| `HOST` | listen address (use `0.0.0.0` for the local network) | 127.0.0.1 |
| `SMOKEBOX_TZ` | process time zone (the service day rolls over at 4 am local time) | system |
| `SMOKEBOX_DATA` | JSON file for saving; checked with the engine's `validateBackup` on start | none (memory only) |
| `SMOKEBOX_HTML` | page to serve | `dist/smokebox.html` |
| `SMOKEBOX_STARTER` | `1` starts with demo stock; default is an empty kitchen like a real first run | empty |

## Protocol
- `GET /events`: Server-Sent Events. First an `snapshot` event, then a `state` event after every change, plus an `hb` heartbeat every 15 s. Every `state`/`snapshot` body is `{ state, serverNow, seq }`; `state` events also carry `by` (the sender's `clientId`), `opId` and `type`. `serverNow` lets a client correct its clock.
- `POST /action` with `{ type, payload, clientId, opId }`. The hub runs `engine.apply(state, type, payload, Date.now())` and answers `{ report, info, seq }`. A repeated `opId` is answered with the first reply plus `duplicate: true` and is not applied again (the last 5000 are remembered, in memory only). A refused action changes nothing.
- A 1 s tick runs `engine.tick`; it broadcasts only when something became due.
- Saving is debounced (0.5 s), written through a temp file and a rename.

## Known limits (prototype)
- No login, no TLS: use only on a trusted network.
- Whole state is sent on every change (fine for a small kitchen, not for a big one).
- The opId memory resets on restart.
- Tested only in Node with fake clients (`test/hub.test.mjs`). Not tested with browsers, real Wi-Fi, or a real kitchen.
