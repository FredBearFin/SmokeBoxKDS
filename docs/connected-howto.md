# Connected: how to run and try it

For Freddy. Plain engineering notes on what exists on `kds/connected` (82d109f) and how to see it work. Everything here was tested in desktop browsers with a simulated network drop. **Nothing has run on a real tablet.** The hub is not started by the app; someone starts it by hand.

## Words used here and in the Guide

- **Main computer (the hub):** the program on one computer that keeps the shared kitchen and sends it to every screen. These notes say "main computer" and keep "hub" for the command line and file names.
- **Kitchen:** the shared kitchen the main computer keeps (board, tickets, menu). A tablet's own saved kitchen is separate and stays untouched.
- **Screen:** anything that shows the kitchen. **Tablet:** a screen that takes orders. **Show only screen:** a screen that cannot change anything. **Owner screen:** a tablet paired with the owner setting. **Removed screen:** a screen the owner took off the list.
- **Pairing code:** six letters and digits that let one new screen join. It works once, for 10 minutes.

## What exists

- **The main computer** (`server/server.mjs`): a small Node program that holds one kitchen, applies actions with the same engine as the app, and streams the result to screens. It also serves the app page, a service worker and a manifest.
- **Show only** (the follower): a page opened with `?follow=<hub address>` shows the main computer's kitchen and refuses every local write.
- **Use the main computer for orders**: a page opened with `?hub=<hub address>`, or joined from Settings, lets a tablet take orders through the main computer. A bare `?hub` means the main computer that served the page.
- **Settings, Use one kitchen on several tablets**: the sheet for both. Show only: address, code, **Connect**. Use the main computer for orders: address, code, a name for the screen, **Check the main computer**, the choice (show the main computer's kitchen, or send this tablet's kitchen into an empty hub), **Join this kitchen**, **Leave the shared kitchen**.
- **Refused taps** show "Not done:" with the reason and are rolled back on that tablet only.
- **Undo** works only on your own last action while nobody else has acted since; otherwise "Someone else changed the kitchen since, so this cannot be undone from here. Fix it by hand."
- **Last known kitchen:** a page reloaded while the main computer is down shows the last copy ("Last known, from" a time) and keeps trying.
- **Opening without the internet:** the main computer serves a service worker. After one visit with the main computer reachable, a tablet can load the page with the network down. It needs https or localhost. The Tablet checks card **Opens without the internet** tests it. **A new version is ready** (Settings) never reloads by itself. **Reset the offline copy** (Help and about) removes the stored copy.
- **The access code** is sent in a header (`x-smokebox-code`) on every request to the main computer, not in the stream address. The page address you open still contains `&code=`.

## Run the main computer

```
node tools/build.mjs --quiet
PORT=8787 SMOKEBOX_FOLLOW_CODE=ABC123 SMOKEBOX_STARTER=1 node server/server.mjs
```

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | listen port | 8787 |
| `HOST` | listen address. Leave at 127.0.0.1 unless you know why. The main computer has no login of its own. | 127.0.0.1 |
| `SMOKEBOX_FOLLOW_CODE` | access code for screens that only show. 4 to 12 capital letters and digits (the sheet uppercases what a person types and accepts only that shape). Empty means no code. | empty |
| `SMOKEBOX_WRITE_CODE` | access code for tablets that take orders. When set, a show-only code can read but not write; the write code can do both. | empty |
| `SMOKEBOX_REQUIRE_TOKENS` | `1` makes every screen pair first (see Pairing). The access codes are then not accepted. Without it, today's behavior stays and a token is optional (but a removed or unknown token is refused). | off |
| `SMOKEBOX_MIN_CLIENT` | a number. A screen running an older page, or saying nothing, is refused with "different versions". | 0 (accept any) |
| `SMOKEBOX_ADMIN_KEY` | the owner's key for the admin commands. By default the main computer makes one and saves it next to the data file (`<data file>.admin`, owner-only). | made for you |
| `SMOKEBOX_TRUST_PROXY` | not in this build yet (A5 is adding it). Check `server/server.mjs` before relying on it. | |
| `SMOKEBOX_DATA` | JSON file the main computer saves to (and a `.wal` file beside it). Without it the kitchen is in memory and gone when the main computer stops. | none |
| `SMOKEBOX_STARTER` | `1` starts with demo stock, anything else starts empty | empty |
| `SMOKEBOX_HTML` | the page the main computer serves | `dist/smokebox.html` |
| `SMOKEBOX_TZ` | time zone of the main computer process | system |

## Pairing screens (owner commands)

With `SMOKEBOX_REQUIRE_TOKENS=1` no screen can read or write until it is paired. The owner runs these on the main computer:

```
node server/server.mjs admin pair [--owner] [--port N] [--data FILE]
node server/server.mjs admin list [--port N] [--data FILE]
node server/server.mjs admin revoke ID [--port N] [--data FILE]
```

`--port` is the main computer's port (default 8787). `--data` is the main computer's data file, so the command can find the admin key; without it set `SMOKEBOX_ADMIN_KEY`. Without either you get "No admin key found."

Run against a local hub for this document (`PORT=8794 SMOKEBOX_DATA=/tmp/x/hub.json SMOKEBOX_REQUIRE_TOKENS=1`), the commands answered:

```
$ node server/server.mjs admin pair --port 8794 --data /tmp/x/hub.json
Pairing code: 9YCTD4
Enter it on the new screen within 10 minutes. It works once.
$ node server/server.mjs admin pair --owner --port 8794 --data /tmp/x/hub.json
Pairing code: VQRWDP  (owner screen)
$ node server/server.mjs admin list --port 8794 --data /tmp/x/hub.json
988b305d35  Pass                         last seen 2026-10-23T16:43:01.430Z
Tokens are required.
$ node server/server.mjs admin revoke 988b305d35 --port 8794 --data /tmp/x/hub.json
Removed 988b305d35 (Pass). It is cut off now.
$ node server/server.mjs admin revoke nosuch --port 8794 --data /tmp/x/hub.json
Refused: no such screen
```

- A **pairing code** is six letters and digits (no I, O, 0 or 1). It works once, for 10 minutes. The screen sends the code and a name and gets its own token, saved on that device. The main computer keeps only a hash of the token (`<data file>.screens`).
- An **owner screen** (made with `--owner`) can also make codes for other screens (never owners), list and remove screens, and send its kitchen to an empty main computer. Other screens cannot.
- **To remove a screen:** `admin list`, then `admin revoke ID`. Its connection is cut at once and it is refused from then on. A removed screen keeps its queued taps; pairing it again with a new code sends them.
- **Wrong codes:** five wrong pairing codes lock that address for ten minutes, even for the right code. More than thirty wrong codes from anywhere cancel every open code and pause pairing for ten minutes. Behind a reverse proxy all screens look like one address, so the second limit is the one that protects you. A cancelled code only costs you one new code.
- The token travels in a header (`x-smokebox-token`). On plain http on a local network anyone on it can read it. The admin key is a file: whoever can read it can pair and remove screens.

What each error means. The names and the 403 and 426 answers were checked with `curl` against a local hub. The sentences are the ones A5 is moving to "main computer" (`night/a5-c6`); the hub in this build still says "hub" in them, with the same meaning:

| Error | Plain words | What to do |
|---|---|---|
| `unpaired` | "This screen is not paired with the main computer. Ask the owner for a pairing code." | Run `admin pair`, enter the code on the screen. |
| `revoked` | "This screen was removed from the kitchen. Ask the owner to pair it again." | Pair it again with a new code. |
| `wrongVersion` | "This screen and the main computer run different versions. Reload the page from the main computer." | Reload the page from the main computer. Check `SMOKEBOX_MIN_CLIENT`. |
| `badPairCode` | "That pairing code is wrong or has expired. Ask the owner for a new one." | Make a new code. Codes work once and last 10 minutes. |
| `tooManyTries` | "Too many wrong tries. Wait a few minutes, or ask the owner for a new code." | Wait ten minutes, or make a new code. |

On the tablet, the join form shows **Pairing code** and **Pair this tablet** when the main computer asks for pairing. The code works once and lasts 10 minutes. After a screen is removed it shows **Leave and pair again**. The Guide page "Several screens (test feature)" describes this. The walk proves it against a local main computer.

## Try it on two browser tabs

1. Start the main computer as above. In tab A open `http://127.0.0.1:8787/?hub&code=ABC123`. This is a tablet writing through the main computer.
2. In tab B open `http://127.0.0.1:8787/?follow&code=ABC123`. This is a Show only screen. It says "Connected" and "This screen only shows the kitchen."
3. In tab A tap New ticket, a dish, Send to kitchen. Tab B shows the ticket within a second or two.
4. Make tab A's Undo fail: in tab A tap Start on a dish, then post another action from a terminal before you tap Undo:
   ```
   curl -s -X POST http://127.0.0.1:8787/action -H 'content-type: application/json' -H 'x-smokebox-code: ABC123' \
     -d '{"type":"createTicket","payload":{"customer":"Zed","channel":"dine_in","items":[{"menuId":"hushpuppies","qty":1}],"note":"","rush":false,"src":"live"},"clientId":"me","opId":"a1","code":"ABC123"}'
   ```
   Tap Undo in tab A: it says "Someone else changed the kitchen since...".
5. Stop the main computer. Tab B says "Reconnecting..." and after about 45 seconds "Out of date since". Reload tab A: with the main computer down it shows "Last known, from" a time (this needs the service worker, so open tab A once with the main computer up first; localhost counts as secure).
6. Start the main computer again with the same `SMOKEBOX_DATA` file. Both tabs return to "Connected".

`WALK_ONLY=screens node tools/guide-walk.mjs` does these steps for real.

## What the tests prove

- A follower ends up equal to the main computer under random actions, and one that was away catches up by replaying the main computer's ordered actions (`hub-follower`, `follower-store`).
- A Show only screen refuses every write and never touches the device's own kitchen (`follower-store`, `follower.e2e`, `follow-ui.e2e`).
- Two tablets taking orders through one hub stay equal; a refused tap rolls back on one tablet only; offline taps queue and flush in order; Undo refuses after someone else acted (`hub-client.e2e`, `hub-join-real.e2e`).
- The access code is checked, the screen cap holds, and hostile requests do not crash the main computer or write outside its data file (`hub-security`, `connected-follow`).
- The service worker stores the page, serves it with the main computer down, and an update waits for a tap (`hub-offline`, `offline-e2e`, `offline-load.e2e`).

## What they do not prove

- **Real devices.** No real tablet, TV, phone or iPad has run any of this. Safari's handling of a long-lived stream, of service workers, and of stored data being cleared is untested.
- **Real networks.** Wi-Fi dropping, captive portals, sleeping devices, proxies or tunnels that buffer the stream. The beta script's Caddy settings turn buffering off but have not run on a real server.
- **Limits reported by the builders:** a plain http address on a local network cannot load offline (no service worker without https or localhost). iPad Safari may clear stored data after about a week unless Smokebox is added to the home screen.
- **Not checked:** a main computer restart that changes its identity, a tablet that reloads with taps waiting, long runs, real clocks.
- **Security in practice.** When a code is set the main computer answers any website, so the code is the only gate. Do not put a main computer on the open internet without a login in front of it (`docs/audit/server-security-review.md`). Behind Caddy the main computer sees one address for everyone, so its wrong-code lockout counts all screens together.

## The beta instance (a second, separate Smokebox)

**Not run on a real server.** `beta.sh` and `beta-remove.sh` were tested only against a scratch folder with stand-ins for systemd, Caddy and useradd (`test/beta-scripts.test.mjs`) and a small reverse-proxy stand-in (`test/beta-proxy.e2e.mjs`). Read the script once before you run it, and run it first at a quiet time.

What it does: on the server that already ran `go.sh`, as root, `bash beta.sh [host name]` installs a second instance of the `connected` branch at `beta.<your site name>` (with an `.sslip.io` name no argument is needed; with your own domain give the name, whose DNS must already point at the server). The real Smokebox is never stopped or changed. It uses a separate user, folder, data folder and port (8788). It prints the two addresses once: the tablet address (`/?hub&code=...`) and the watching-screen address (`/?follow&code=...`). You sign in with the real site's login. The codes are in `/etc/smokebox-beta.env` (root only); running the script again keeps them. A nightly update at 04:50 follows the `connected` branch.

It adds one `import` line to the real Caddyfile (a copy is kept and the script undoes it if Caddy refuses). Remove everything with `bash beta-remove.sh` (or `--keep-data`). It is a second host name on purpose: under a path like `/beta/` a bare `?hub` would ask the real site's root and not connect.

Do not run the real kitchen on the beta. Do not share screenshots of an address bar: the codes are in it.
