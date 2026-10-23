# Server and updater security review (round 13)

Scope read: `server/server.mjs`, `server/setup-server.sh`, `go.sh`, `tunnel.sh`, `server/README.md`. Nothing on the live server was touched. Everything below was checked by reading the code and by tests against a local copy (`test/hub-security.test.mjs`, `test/updater.test.mjs`). Not checked: the live server itself, Caddy's real behavior, systemd on a real machine (this sandbox has none), GitHub's side of the deploy branch.

## How the pieces fit

Browser, then Caddy (HTTPS and one shared username and password), then the Node hub on 127.0.0.1:8787. The hub itself has no login. The nightly updater (root, 4:30 am) downloads the public `deploy` branch from GitHub and swaps it into `/opt/smokebox`. The optional tunnel adds a Cloudflare address in front of the same Caddy.

## Findings, ranked

### High

1. **A malicious or mistaken push to the public deploy branch becomes code on the server within a day.** The updater downloaded `deploy.tar.gz` over HTTPS and swapped it in with no integrity check beyond TLS to GitHub. Anyone who can push to `deploy` (a stolen GitHub token, a compromised collaborator, a wrong merge) controls (a) the Node process, which runs as the `smokebox` user with the kitchen's data file, and (b) the HTML page served to every cook, which can read and send everything the page can see. There is also no rollback. *Fix done:* the updater now checks size, gzip, unsafe paths and links, required files, that `server.mjs` parses, and rolls back if the new build does not answer (all tested). *Fix still needed (needs Freddy's key):* make the updater accept only a **signed commit**. Sketch: keep an SSH signing public key in `/etc/smokebox/allowed_signers`, clone the branch with `git`, run `git -c gpg.ssh.allowedSignersFile=/etc/smokebox/allowed_signers verify-commit HEAD`, and refuse otherwise. Cheaper alternative: publish a one-line `deploy.sha256` as a GitHub release asset that only Freddy can create, and compare it. Either way a stolen branch push alone is no longer enough.

2. **Cross-site request forgery against the hub.** `POST /action` ignored the content type and the Origin header. A web page the signed-in person visits could send a "simple" cross-site POST (text/plain body), and the browser attaches the cached Caddy login, so an attacker page could create or change tickets, even run destructive actions. *Fixed in `server.mjs`:* the body must be `application/json` (a cross-site page cannot send that without a permission check the hub never grants) and a request naming another origin gets 403. Tested.

### Medium

3. **Unbounded memory per request and per screen.** One authenticated client could send a 1 MB action 5,000 times (the recent-actions log keeps every payload, about 5 GB), or open unlimited event streams, each of which receives the whole state on every change. *Fixed:* 256 KB body limit with an immediate 413 (also on `Content-Length`), a byte cap (8 MB) on the actions log, at most 100 event streams (503 after that), request and header timeouts (30 s and 15 s). Tested.
4. **One shared password for every device, and no rate limit on it.** Caddy's `basic_auth` has no lockout, and the default name `<ip>.sslip.io` is easy to find. A guessable password is the whole security of the server. *Fixed:* `setup-server.sh` refuses passwords under 8 characters and both scripts accept the password from `SMOKEBOX_PASS` so it is not left in the process list or shell history. *Recommended:* install `fail2ban` with a Caddy log jail (or the `caddy-ratelimit` plugin), and use a long passphrase. Also note the single credential gives every cook's tablet the power to run any action (including reset), so role limits need to come from the connected plan, not this prototype.
5. **Tunnel exposure.** `tunnel.sh` installs the latest cloudflared `.deb` as root with no checksum, ran the connector as root with no sandbox, wrote to a fixed `/tmp` file, and the Cloudflare address is random but public: anyone who learns it reaches the sign-in page, and Cloudflare can read the traffic, including the typed password. *Fixed:* runs as `nobody` with `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`; temp file by `mktemp`; size and package validity checks; the script now says plainly that Cloudflare can read the traffic. *Recommended:* pin a version and its published checksum; prefer a named Cloudflare tunnel with Access in front, or skip the tunnel.
6. **The installer pipes remote scripts into root** (`curl ... | bash -` for NodeSource, an unpinned Caddy apt key) and `go.sh` runs the repository's own `setup-server.sh` as root from the same unverified download. This is the same trust as finding 1 and is fixed by the same signature check. The archive is now checked for size, gzip, unsafe paths and the files it must contain before anything runs.

### Low

7. **systemd hardening gaps.** The unit had `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome` and `PrivateTmp` already. *Added:* `PrivateDevices`, `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectControlGroups`, `RestrictAddressFamilies`, `RestrictNamespaces`, `LockPersonality`, an empty `CapabilityBoundingSet` and `UMask=0077` (the data file is private). Not added on purpose: `MemoryDenyWriteExecute` (Node's JIT needs writable code) and `SystemCallFilter` (needs testing on the real machine). **These unit lines could not be tested here (no systemd).** After the next `go.sh` run check `systemctl status smokebox` and `systemd-analyze security smokebox`; if the service fails to start, remove the line it complains about.
8. **No security headers.** *Fixed:* Caddy now sends HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and hides the Server header, and caps request bodies at 2 MB; the hub sets the same on the page. A content security policy was not added because the app is one page with inline script and Google Fonts; it needs a test pass of its own.
9. **Updater robustness** (not security, but the nightly job runs as root): the old script had a fixed `/tmp` file name, could run twice at once, removed the old build before the new one was checked and had no rollback. All fixed and tested: private temp folder, a lock, checks first, swap second, health check at `http://127.0.0.1:8787/`, automatic rollback to `/opt/smokebox.old`, and the updater refreshes itself from the new build.
10. **Download size.** The deploy branch archive is about 176 MB, mostly screenshots under `docs` and `test/.out`; the server only needs `server/`, `src/js/` and `dist/smokebox.html`. A lean deploy branch (or a release asset with just those) would make the nightly download seconds, not minutes, and shrink what a push can hide.

### Checked and fine

- No path traversal: the hub serves exactly one file (the configured page) and two routes; every other path is 404/405. Tested with `../`, `%2e%2e`, raw sockets and junk requests.
- Hostile action types and payloads (`__proto__`, `constructor`, deep JSON, 3 MB bodies, NaN times) neither crash the hub nor pollute prototypes. Time from clients can only fall between the last action and the hub clock.
- The state file is written through a temp file and a rename in its own folder; the service user is the only writer; a hostile or unreadable file is refused by the engine's `validateBackup`.
- The hub listens on 127.0.0.1 only; Caddy is the only public listener (ufw allows 22, 80, 443). If `HOST=0.0.0.0` is ever set the hub has no login of its own: do not.
- SSE has no cross-origin headers, so another site cannot read the stream.

## Not covered

The real server, real Caddy and Cloudflare behavior, DNS, the SSH configuration of the machine (password logins, fail2ban), backups of `/var/lib/smokebox/state.json`, and TLS certificate renewal.
