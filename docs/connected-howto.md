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
- **Security in practice.** When a code is set the hub answers any website, so the code is the only gate. Do not put a hub on the open internet without a login in front of it (`docs/audit/server-security-review.md`). Behind Caddy the hub sees one address for everyone unless `SMOKEBOX_TRUST_PROXY=1` is set (then it reads the screen's address from the last `X-Forwarded-For` entry, which Caddy adds, and only from the local proxy). `beta.sh` and new installs by `server/setup-server.sh` set it; an older main install needs it added once (see below). Tested through a proxy stand-in only.

## The beta instance (a second, separate Smokebox)

**Not run on a real server.** `beta.sh` and `beta-remove.sh` were tested only against a scratch folder with stand-ins for systemd, Caddy and useradd (`test/beta-scripts.test.mjs`) and a small reverse-proxy stand-in (`test/beta-proxy.e2e.mjs`). Read the script once before you run it, and run it first at a quiet time.

What it does: on the server that already ran `go.sh`, as root, `bash beta.sh [host name]` installs a second instance of the `connected` branch at `beta.<your site name>` (with an `.sslip.io` name no argument is needed; with your own domain give the name, whose DNS must already point at the server). The real Smokebox is never stopped or changed. It uses a separate user, folder, data folder and port (8788). It prints the two addresses once: the tablet address (`/?hub&code=...`) and the watching-screen address (`/?follow&code=...`). You sign in with the real site's login. The codes are in `/etc/smokebox-beta.env` (root only); running the script again keeps them. A nightly update at 04:50 follows the `connected` branch.

It adds one `import` line to the real Caddyfile (a copy is kept and the script undoes it if Caddy refuses). Remove everything with `bash beta-remove.sh` (or `--keep-data`). It is a second host name on purpose: under a path like `/beta/` a bare `?hub` would ask the real site's root and not connect.

Do not run the real kitchen on the beta. Do not share screenshots of an address bar: the codes are in it.

**Main server installed before this setting:** `server/setup-server.sh` now puts `Environment=SMOKEBOX_TRUST_PROXY=1` in the main unit, but the nightly update does not rewrite the unit. On an existing server run once, as root: `mkdir -p /etc/systemd/system/smokebox.service.d && printf '[Service]\nEnvironment=SMOKEBOX_TRUST_PROXY=1\n' > /etc/systemd/system/smokebox.service.d/proxy.conf && systemctl daemon-reload && systemctl restart smokebox`. Only do this while Caddy is in front of the hub on 127.0.0.1; if the hub is ever reachable directly, a screen on the same computer could choose its own address. The deploy build's hub ignores the setting until it contains the connected code. Not run on a real server.

**Under a path prefix:** a bare `?hub` or `?follow` now uses the page's own folder (night/a5-c6), so a prefix such as `/beta/` also works; `beta.sh` still uses a second host name because it needs no edit of the real site's block. Proved with the proxy stand-in only (`test/beta-proxy.e2e.mjs`).

## Risks and limits
- Not run on a real server (above). Caddy's own parse of the added block is the first real test; the script undoes it if Caddy refuses.
- One `import` line is added to the real Caddyfile. A copy is kept; `beta-remove.sh` removes the line. A damaged Caddyfile would affect the real site at its next reload.
- Behind Caddy the hub sees every request from 127.0.0.1, so its wrong-code lockout counts all screens together: ten wrong codes from anyone who got past the login lock the code for a minute for everyone.
- The codes sit in the address of the tablets (needed to open the page). Do not share screenshots of the address bar.
- A second Node process uses memory on the same small server; the beta's data is separate and is not backed up by anything.
- The connected build is experimental: do not run the real kitchen on it. The nightly beta update follows the branch `connected` as it is that night.

## Server update safety (time, signing, pinning) and first-boot checks
**Not run on a real server.** These steps were tested with fake services (`test/updater.test.mjs`), not with a real systemd, Caddy or GitHub.

**Update time.** The nightly update runs at 4:30 in the zone you gave `go.sh` (the timer line now ends with the zone name). A server installed earlier runs it at 4:30 in the SERVER's zone, which is UTC on a fresh server (that is 11:30 PM or 12:30 AM in New York, during service). To fix an existing server, as root: `sed -i 's/^OnCalendar=.*/OnCalendar=*-*-* 04:30:00 America\/New_York/' /etc/systemd/system/smokebox-update.timer && systemctl daemon-reload && systemctl restart smokebox-update.timer`, then check with `systemctl list-timers smokebox-update.timer` (the NEXT column) and `systemd-analyze calendar '*-*-* 04:30:00 America/New_York'`. The beta timer (04:50) has the same fix in `beta.sh`.

**Signed updates (optional, off by default).** Today the updater trusts whatever the `deploy` branch holds, so whoever can write that branch controls the server as root. The updater logs a WARNING line each night about this. To turn on checking:
1. On YOUR computer (never on the server, never on GitHub): `openssl genpkey -algorithm ed25519 -out update-key.pem && openssl pkey -in update-key.pem -pubout -out update-pubkey.pem` (OpenSSL 3, as on Ubuntu 22.04 or later).
2. Before each push to `deploy`, in the folder to be committed: `bash tools/sign-deploy.sh /path/to/update-key.pem`. It writes `deploy.manifest` (a sha256 line per file) and `deploy.manifest.sig` into the tree. They are inside the build, not a separate file next to a tarball, because GitHub's tarball bytes are not stable but the files are.
3. On the server, as root: `mkdir -p /etc/smokebox && cp update-pubkey.pem /etc/smokebox/update-pubkey`. From then on the updater refuses a build that is unsigned, signed with another key, has a changed file, or has a file that is not on the list, and keeps the running version. To stop checking, delete that file.
Lose the private key and you must remove the public key on the server by hand before the next update can pass.

**Pinning.** `SMOKEBOX_UPDATE_REF=v1.4.0` (a tag) or a full 40-character commit id makes the updater download that exact version instead of the moving branch. Put it in the update service: `systemctl edit smokebox-update` and add `[Service]` and `Environment=SMOKEBOX_UPDATE_REF=v1.4.0`. Combine with signing for the strongest setting. The updater also refuses archives containing devices, pipes or links (as root they would be extracted).

**Check the service hardening after installing (the settings in `setup-server.sh` were never run on a real systemd).** As root, after `go.sh`:
- `systemctl status smokebox caddy smokebox-update.timer` (all active)
- `systemd-analyze security smokebox` (shows an exposure score and each setting; a score of about 2 to 4 "OK" or "MEDIUM" is expected for this unit; look at lines marked with a red or yellow dot that are NOT among: network access, address families)
- `journalctl -u smokebox -n 50 --no-pager` (no "Failed to set up", "Permission denied" or "namespace" lines)
- `ls -ld /var/lib/smokebox && ls -l /var/lib/smokebox` (owned by `smokebox`, mode 700 / 600) and `ps -o user,cmd -C node` (runs as `smokebox`)
- `curl -s http://127.0.0.1:8787/health` (should say `"ok":true`) and open the site from a tablet.
If the service will not start after install, the most likely cause is a hardening line the server's systemd does not accept: run `journalctl -u smokebox -b --no-pager | tail -30`, comment out the named line in `/etc/systemd/system/smokebox.service`, `systemctl daemon-reload && systemctl restart smokebox`, and tell the developers which line it was.

## Optional hardening: slow down password guessing (`harden.sh`)
**Not run on a real server.** Tested only against stand-ins (`test/harden-scripts.test.mjs`): the file edits, the validate-then-reload order, the roll-back, the undo and the log pattern are checked; fail2ban itself, a real Caddy log and real bans are not.

**Why.** The sign-in page (Caddy `basic_auth`) has no limit on wrong passwords, and every wrong password costs the small server a bcrypt check. Someone who finds the address can keep the server busy.

**What `bash harden.sh` does (as root, safe to run twice):** turns on Caddy's JSON access log (`/var/log/caddy/access.log`, 10 MB, 3 kept) through a snippet imported into each site block (the main site and the beta); installs fail2ban with a jail `caddy-401` that blocks an address for 1 hour after 8 wrong passwords in 10 minutes (ports 80 and 443; the server itself, 127.0.0.1, is never banned); and turns on automatic SECURITY upgrades without automatic reboot. It runs `caddy validate` before reloading and puts everything back if Caddy refuses. It does NOT add a firewall rate limit (`ufw limit` is made for ssh and would also cut off a kitchen of many tablets behind one Wi-Fi address). `bash harden-remove.sh` undoes it (the packages stay installed).

**Three commands to check it after running it:**
1. `fail2ban-client status caddy-401` (the jail is listed; "Currently banned" starts at 0)
2. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`
3. `journalctl -u fail2ban -u caddy -n 40 --no-pager` (no errors about the filter or the log file)
Then test it: from another computer type 8 wrong passwords at the sign-in page; that computer should be blocked for an hour. Unblock with `fail2ban-client set caddy-401 unbanip ADDRESS`.

**Caution:** a kitchen where all tablets share one public address (one router) shares one limit: eight wrong passwords from any of them block them all for an hour. Type the password carefully or raise `maxretry` in `/etc/fail2ban/jail.d/caddy-401.local`.

## The tunnel (`tunnel.sh`) and its risks
`tunnel.sh` adds a second address, `https://<random-words>.trycloudflare.com`, that reaches the same server through Cloudflare, for networks that block the server's own address. Plainly:
- The address is public. Anyone who learns it (a screenshot, a message, a log) reaches the sign-in page. It changes when the tunnel restarts, but it is not a secret to rely on.
- The password prompt is the only gate, and the password you type travels through Cloudflare in a form Cloudflare can read.
- Traffic through the tunnel reaches Caddy from 127.0.0.1, so the fail2ban jail above cannot ban the real caller (it sees only the local connector). Guessing through the tunnel is therefore not slowed down. Use a long password (a phrase), and switch the tunnel off when you do not need it: `systemctl disable --now smokebox-tunnel`.
- The connector (`cloudflared`) is installed from Cloudflare's "latest" release page with only a size check; it is not pinned or signed here.

## Hub protections added after the second review
**Not run on a real server** (tests use fake services and in-process hubs).
- **Permissions per action.** Every engine action has a class in `ACTION_CLASS` (`server/server.mjs`): `any` (service work, every screen) or `owner` (settings, menu, money corrections, closing the day, resetting the kitchen). A paired non-owner screen is refused (`notOwner`, 403) for owner actions. A hub with no pairing at all (a trusted network) works as before. A test fails if a new engine action has no class.
- **`/events`** (the old whole-kitchen stream) now needs the same token or access code as `/follow`, and the same version check.
- **Host check.** The hub refuses (421) a request whose `Host` is some other dotted name, which closes DNS rebinding on a hub reachable without a login. Accepted: names in `SMOKEBOX_ALLOWED_HOSTS` (comma separated), `localhost`, IP addresses, names without a dot and `.local`, `.lan`, `.home.arpa`. Behind Caddy with `SMOKEBOX_TRUST_PROXY=1` any Host is accepted unless `SMOKEBOX_ALLOWED_HOSTS` is set, because Caddy serves only its own names.
- **Torn record line.** At start the hub cuts off a last line of the record that was not finished (it was never acknowledged), so the next action cannot be glued to it.
- **One hub per data folder.** A lock file `<data file>.lock` holds the process id; a second hub on the same folder refuses to start with a clear message. A lock left by a dead process is taken over.
- **Pairing limits.** Each address is still held to 5 wrong codes; the hub-wide limit that burns every open code is now 300 wrong guesses in 10 minutes (it was 30, so a stranger could keep pairing blocked). The right admin key is never refused because of wrong keys tried by others; the owner's own command line has a lockout bucket of its own.
- **Caddy's log** (`harden.sh`) no longer records the token and code headers or `?code=` in an address.
- **Updater.** A health answer that carries `dataProblem` makes the update roll back (the saved data was set aside by the new build); `SMOKEBOX_REQUIRE_SIGNED=1` makes a missing public key an error instead of a warning.
- **`tunnel.sh`** installs the Cloudflare package only if its sha256 matches the one you pass (`bash tunnel.sh <sha256>`, copied from the release page); run without it, it shows the sha256 of what it downloaded and stops. `SMOKEBOX_CLOUDFLARED_VERSION=...` pins a version.
