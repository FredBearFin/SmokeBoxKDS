# Connected (second screen): how to run and try it

For Freddy. Plain engineering notes on what exists on `kds/connected` (af5d394) and how to see it work. Nothing here has run on a real device. The hub is not started by the app; someone starts it by hand.

## What exists (after merging the stage 2 branches)

- **The hub** (`server/server.mjs`): a small Node program that holds one kitchen in memory, applies actions with the same engine as the app, and streams the result to screens.
- **The follower**: a read-only screen. A page opened with `?follow=<hub address>` shows the hub's kitchen and refuses every local write. It keeps nothing in the device's saved kitchen.
- **Settings, Use one kitchen on several tablets**: the sheet with two ways. **Show only** opens the follower view (**Back to my own kitchen** leaves it). **Use this hub for orders on this tablet** (address, code, a name for the screen, **Check the hub**, then **Join the hub**) lets the tablet take orders through the hub. **Leave the hub** goes back to the tablet's own kitchen.
- **Tablets writing through the hub** (stage 2) is on this branch after merging `night/a5-c3`, `night/a1-c3` and `night/a2-c3`. It is a test feature, tried only in desktop browsers with a simulated network drop.

## Run the hub

```
node tools/build.mjs --quiet
PORT=8787 SMOKEBOX_FOLLOW_CODE=ABC123 SMOKEBOX_STARTER=1 node server/server.mjs
```

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | listen port | 8787 |
| `HOST` | listen address. Leave at 127.0.0.1 unless you know why. The hub has no login of its own. | 127.0.0.1 |
| `SMOKEBOX_FOLLOW_CODE` | access code a follower must send. Use 4 to 12 capital letters and digits: the sheet uppercases what a person types and only accepts that shape. Empty means no code. | empty |
| `SMOKEBOX_DATA` | JSON file the hub saves to (and a `.wal` file beside it). Without it the kitchen lives in memory and is gone when the hub stops. | none |
| `SMOKEBOX_STARTER` | `1` starts with demo stock, anything else starts empty | empty |
| `SMOKEBOX_HTML` | the page the hub serves | `dist/smokebox.html` |
| `SMOKEBOX_TZ` | time zone of the hub process | system |

## See it on two browser tabs

1. Start the hub as above and open `http://127.0.0.1:8787/` in tab A. This is the normal app served by the hub. It does not write to the hub.
2. In tab B open `http://127.0.0.1:8787/?follow=http%3A%2F%2F127.0.0.1%3A8787&code=ABC123`. Or in tab B tap Settings, Use one kitchen on several tablets, Show only, type the address and code, and tap Connect.
3. Tab B shows "Connected" and "This screen only shows the kitchen." Taps on its tickets do nothing.
4. Make something happen. Either post an action, or join the hub from tab A (Settings, Use one kitchen on several tablets, Use this hub for orders on this tablet, Check the hub, choose to show the hub's kitchen, Join the hub) and take an order there; tab B then follows it. To post an action:
   ```
   curl -s -X POST http://127.0.0.1:8787/action -H 'content-type: application/json' \
     -d '{"type":"createTicket","payload":{"customer":"Maria","channel":"dine_in","items":[{"menuId":"hushpuppies","qty":1}],"note":"","rush":false,"src":"live"},"clientId":"me","opId":"a1"}'
   ```
   (`hushpuppies` exists because of `SMOKEBOX_STARTER=1`.) The ticket appears in tab B within a second or two.
5. Stop the hub. Tab B says "Reconnecting...", then after about 45 seconds "Out of date since" a time, with a red banner. Start the hub again with the same `SMOKEBOX_DATA` file and tab B returns to "Connected".

`tools/guide-walk.mjs` does steps 2 to 5 for real (`WALK_ONLY=screens node tools/guide-walk.mjs`).

## What the tests prove

- A follower ends up equal to the hub under random actions, and a follower that was away catches up by replaying the hub's ordered actions (`hub-follower`, `follower-store`).
- The follower refuses every write, never writes the device's own kitchen keys, and reports its state honestly (`follower-store`, `follower.e2e`, `follow-ui.e2e`).
- It resumes after an outage or a hub restart, and falls back to a fresh snapshot when the history is gone (`hub-follow`, `connected-hub`, `connected-follow`).
- The access code is checked, the screen cap holds, and hostile requests do not crash the hub or write outside its data file (`hub-security`, `connected-follow`).
- A resent action is answered once (`hub-follow`).

## What they do not prove

- **Real devices.** No real tablet, TV, phone or iPad has shown a follower. Safari's handling of a long-lived stream is untested.
- **Real networks.** Wi-Fi dropping, a captive portal, a sleeping device, a proxy or tunnel that buffers the stream (Caddy and the Cloudflare tunnel were not tried with it).
- **Two writers on real hardware.** Two tablets taking orders through one hub was tested in desktop browsers with a simulated network drop (`hub-client.e2e`, `hub-join-real.e2e`), not on real tablets or a real network. A hub restart that changes its identity and a tablet that reloads with taps waiting were not checked.
- **Long runs.** Days of uptime, memory over a long service, a crowded day.
- **Clocks on real devices.** The follower follows the hub's clock by an offset; real devices with wrong clocks were not tried.
- **Security in practice.** The access code travels in the address (`?code=` on the stream request), so it can appear in browser history and server logs. When a code is set the hub answers any website (`access-control-allow-origin: *`), so the code is the only gate. Do not put a hub on the open internet without the login in front of it described in `docs/audit/server-security-review.md`.
