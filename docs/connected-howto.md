# Trying the connected build next to the real Smokebox (beta)

**Not run on a real server.** `beta.sh` and `beta-remove.sh` were tested only against a scratch folder with stand-ins for systemd, Caddy and
useradd (`test/beta-scripts.test.mjs`) and a small reverse-proxy stand-in (`test/beta-proxy.e2e.mjs`). Nothing here proves systemd, a real Caddy
reload, certificate issuing, the firewall or a real tablet. Read the script once before you run it, and run it first at a quiet time.

## What it is for
The connected build lets two or more tablets take orders through one hub, and extra screens only watch. It is experimental. The beta runs
next to the real Smokebox as a second, separate instance, so the real kitchen is never at risk.

## Install (as root, on the server that already ran go.sh)
    curl -fsSL https://raw.githubusercontent.com/FredBearFin/SmokeBoxKDS/connected/beta.sh -o beta.sh && bash beta.sh
(or `bash beta.sh beta.example.com` with your own domain; its DNS A record must already point at this server.) With the usual
`<ip>.sslip.io` name it needs no argument: the beta is at `beta.<ip-with-dashes>.sslip.io`.

It prints two addresses, once: the writing-tablet address (`/?hub&code=...`) and the watching-screen address (`/?follow&code=...`). Open the
first on each tablet and the second on a TV or phone. You sign in with the same login as the real site. The codes are in `/etc/smokebox-beta.env`
(root only); running `beta.sh` again keeps them.

## What it does, in order
1. Stops unless the real Smokebox is installed; changes nothing of it.
2. Picks the beta's host name (a second name, not a path on the real site; see "Why a second name").
3. Downloads the `connected` branch and checks it like the nightly updater: size, gzip, no unsafe paths, no links, files present, the server file parses, the connected code is in it.
4. Installs it to `/opt/smokebox-beta`, creates the user `smokebox-beta`, data in `/var/lib/smokebox-beta` (mode 700, separate from the real data).
5. Writes the random codes (read-only screens and writing tablets) to `/etc/smokebox-beta.env` (mode 600).
6. Installs the service `smokebox-beta` on `127.0.0.1:8788`, hardened like the real one (no new privileges, strict file system, no capabilities, private tmp and devices, umask 077), and waits until it answers. If it does not, it stops the beta and exits; the real site was never touched.
7. Writes `/etc/caddy/beta.caddy` (same headers, 2 MB limit, same login, `flush_interval -1` for live streams), saves `/etc/caddy/Caddyfile.before-beta`, adds ONE line `import /etc/caddy/beta.caddy` to the Caddyfile, runs `caddy validate`, and only then reloads Caddy (a reload, not a restart). If validation fails it puts the old Caddyfile back and removes the block.
8. Installs a nightly update at 04:50 (`smokebox-beta-update.timer`) that runs the real updater with the beta's own folder, branch, port and service, with the same checks and rollback. Run now: `systemctl start smokebox-beta-update`.

## Remove it
    bash beta-remove.sh            # everything, including the beta's data
    bash beta-remove.sh --keep-data
It stops and deletes the beta service, timer, files, user, codes and the Caddy block and import line, then reloads Caddy. It can be run twice.

## Why a second name and not a path like /beta/
The page asks the hub for `/follow`, `/action` and the live stream from the root of its address. Under a path prefix a screen opened with a bare
`?hub` asks the real site's root instead and does not connect (shown in `test/beta-proxy.e2e.mjs`: bare `?hub` under `/beta/` stays off). It works
only if every screen's address names the prefix (`?hub=https://host/beta&code=...`). A second host name needs none of that and does not edit the
real site's block. If the hub should one day work under a prefix with a bare `?hub`, the client would build addresses from the page's own folder
instead of the root; that is a change for the hub's owner, not needed here.

## Risks and limits
- Not run on a real server (above). Caddy's own parse of the added block is the first real test; the script undoes it if Caddy refuses.
- One `import` line is added to the real Caddyfile. A copy is kept; `beta-remove.sh` removes the line. A damaged Caddyfile would affect the real site at its next reload.
- Behind Caddy the hub sees every request from 127.0.0.1, so its wrong-code lockout counts all screens together: ten wrong codes from anyone who got past the login lock the code for a minute for everyone.
- The codes sit in the address of the tablets (needed to open the page). Do not share screenshots of the address bar.
- A second Node process uses memory on the same small server; the beta's data is separate and is not backed up by anything.
- The connected build is experimental: do not run the real kitchen on it. The nightly beta update follows the branch `connected` as it is that night.
