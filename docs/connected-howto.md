# Connected: how to run and try it

For Freddy. Plain engineering notes on what exists on `kds/connected` (82d109f) and how to see it work. Everything here was tested in desktop browsers with a simulated network drop. **Nothing has run on a real tablet.** The hub is not started by the app; someone starts it by hand.

## What exists

- **The hub** (`server/server.mjs`): a small Node program that holds one kitchen, applies actions with the same engine as the app, and streams the result to screens. It also serves the app page, a service worker and a manifest.
- **Show only** (the follower): a page opened with `?follow=<hub address>` shows the hub's kitchen and refuses every local write.
- **Use this hub for orders**: a page opened with `?hub=<hub address>`, or joined from Settings, lets a tablet take orders through the hub. A bare `?hub` means the hub that served the page.
- **Settings, Use one kitchen on several tablets**: the sheet for both. Show only: address, code, **Connect**. Use this hub for orders: address, code, a name for the screen, **Check the hub**, the choice (show the hub's kitchen, or send this tablet's kitchen into an empty hub), **Join the hub**, **Leave the hub**.
- **Refused taps** show "Not done:" with the reason and are rolled back on that tablet only.
- **Undo** works only on your own last action while nobody else has acted since; otherwise "Someone else changed the kitchen since, so this cannot be undone from here. Fix it by hand."
- **Last known kitchen:** a page reloaded while the hub is down shows the last copy ("Last known, from" a time) and keeps trying.
- **Opening without the internet:** the hub serves a service worker. After one visit with the hub reachable, a tablet can load the page with the network down. It needs https or localhost. The Tablet checks card **Opens without the internet** tests it. **A new version is ready** (Settings) never reloads by itself. **Reset the offline copy** (Help and about) removes the stored copy.
- **The access code** is sent in a header (`x-smokebox-code`) on every request to the hub, not in the stream address. The page address you open still contains `&code=`.

## Run the hub

```
node tools/build.mjs --quiet
PORT=8787 SMOKEBOX_FOLLOW_CODE=ABC123 SMOKEBOX_STARTER=1 node server/server.mjs
```

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | listen port | 8787 |
| `HOST` | listen address. Leave at 127.0.0.1 unless you know why. The hub has no login of its own. | 127.0.0.1 |
| `SMOKEBOX_FOLLOW_CODE` | access code for screens. 4 to 12 capital letters and digits (the sheet uppercases what a person types and accepts only that shape). Empty means no code. | empty |
| `SMOKEBOX_DATA` | JSON file the hub saves to (and a `.wal` file beside it). Without it the kitchen is in memory and gone when the hub stops. | none |
| `SMOKEBOX_STARTER` | `1` starts with demo stock, anything else starts empty | empty |
| `SMOKEBOX_HTML` | the page the hub serves | `dist/smokebox.html` |
| `SMOKEBOX_TZ` | time zone of the hub process | system |

## Try it on two browser tabs

1. Start the hub as above. In tab A open `http://127.0.0.1:8787/?hub&code=ABC123`. This is a tablet writing through the hub.
2. In tab B open `http://127.0.0.1:8787/?follow&code=ABC123`. This is a Show only screen. It says "Connected" and "This screen only shows the kitchen."
3. In tab A tap New ticket, a dish, Send to kitchen. Tab B shows the ticket within a second or two.
4. Make tab A's Undo fail: in tab A tap Start on a dish, then post another action from a terminal before you tap Undo:
   ```
   curl -s -X POST http://127.0.0.1:8787/action -H 'content-type: application/json' -H 'x-smokebox-code: ABC123' \
     -d '{"type":"createTicket","payload":{"customer":"Zed","channel":"dine_in","items":[{"menuId":"hushpuppies","qty":1}],"note":"","rush":false,"src":"live"},"clientId":"me","opId":"a1","code":"ABC123"}'
   ```
   Tap Undo in tab A: it says "Someone else changed the kitchen since...".
5. Stop the hub. Tab B says "Reconnecting..." and after about 45 seconds "Out of date since". Reload tab A: with the hub down it shows "Last known, from" a time (this needs the service worker, so open tab A once with the hub up first; localhost counts as secure).
6. Start the hub again with the same `SMOKEBOX_DATA` file. Both tabs return to "Connected".

`WALK_ONLY=screens node tools/guide-walk.mjs` does these steps for real.

## What the tests prove

- A follower ends up equal to the hub under random actions, and one that was away catches up by replaying the hub's ordered actions (`hub-follower`, `follower-store`).
- A Show only screen refuses every write and never touches the device's own kitchen (`follower-store`, `follower.e2e`, `follow-ui.e2e`).
- Two tablets taking orders through one hub stay equal; a refused tap rolls back on one tablet only; offline taps queue and flush in order; Undo refuses after someone else acted (`hub-client.e2e`, `hub-join-real.e2e`).
- The access code is checked, the screen cap holds, and hostile requests do not crash the hub or write outside its data file (`hub-security`, `connected-follow`).
- The service worker stores the page, serves it with the hub down, and an update waits for a tap (`hub-offline`, `offline-e2e`, `offline-load.e2e`).

## What they do not prove

- **Real devices.** No real tablet, TV, phone or iPad has run any of this. Safari's handling of a long-lived stream, of service workers, and of stored data being cleared is untested.
- **Real networks.** Wi-Fi dropping, captive portals, sleeping devices, proxies or tunnels that buffer the stream. The beta script's Caddy settings turn buffering off but have not run on a real server.
- **Limits reported by the builders:** a plain http address on a local network cannot load offline (no service worker without https or localhost). iPad Safari may clear stored data after about a week unless Smokebox is added to the home screen.
- **Not checked:** a hub restart that changes its identity, a tablet that reloads with taps waiting, long runs, real clocks.
- **Security in practice.** When a code is set the hub answers any website, so the code is the only gate. Do not put a hub on the open internet without a login in front of it (`docs/audit/server-security-review.md`). Behind Caddy the hub sees one address for everyone, so its wrong-code lockout counts all screens together.

## The beta instance (a second, separate Smokebox)

**Not run on a real server.** `beta.sh` and `beta-remove.sh` were tested only against a scratch folder with stand-ins for systemd, Caddy and useradd (`test/beta-scripts.test.mjs`) and a small reverse-proxy stand-in (`test/beta-proxy.e2e.mjs`). Read the script once before you run it, and run it first at a quiet time.

What it does: on the server that already ran `go.sh`, as root, `bash beta.sh [host name]` installs a second instance of the `connected` branch at `beta.<your site name>` (with an `.sslip.io` name no argument is needed; with your own domain give the name, whose DNS must already point at the server). The real Smokebox is never stopped or changed. It uses a separate user, folder, data folder and port (8788). It prints the two addresses once: the tablet address (`/?hub&code=...`) and the watching-screen address (`/?follow&code=...`). You sign in with the real site's login. The codes are in `/etc/smokebox-beta.env` (root only); running the script again keeps them. A nightly update at 04:50 follows the `connected` branch.

It adds one `import` line to the real Caddyfile (a copy is kept and the script undoes it if Caddy refuses). Remove everything with `bash beta-remove.sh` (or `--keep-data`). It is a second host name on purpose: under a path like `/beta/` a bare `?hub` would ask the real site's root and not connect.

Do not run the real kitchen on the beta. Do not share screenshots of an address bar: the codes are in it.
