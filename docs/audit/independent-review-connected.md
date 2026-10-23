# Independent review of the connected track (night/review-r2)

Reviewer had not seen this code. Source: `kds/connected` at 188d09b. No app code was changed. "Confirmed" means reproduced with a throwaway
script (in `/tmp/review2/`, not committed) against a hub on localhost (in-process `createHub`, or the store loaded in a VM like
`test/hub-client.test.mjs`, or headless Chromium). "Suspected" means read from the code only. Previous review of the main track not repeated.

Totals: 11 confirmed (data loss 3, auth/security 4, availability 4), 9 suspected/minor, plus a "checked and fine" list.

## Ranked findings

### 1. DATA LOSS (confirmed): after Leave then Join without a reload, every tap is silently thrown away by the hub as a "duplicate"
`src/js/30-store.js:107` (`tabId` is chosen once per page load), `:621` (`init()` sets `opN = 0`, and `folBegin`/`leaveHub` both call `init`),
`:1476` (opId = `tabId:opN`), `server/server.mjs:325` (`replies.has(opId)` answers `ok, duplicate` without applying).
A tablet that leaves the hub and joins the same hub again in the same page gets the same opIds (`tab_x:1`, `tab_x:2` ...) as before. The hub still
remembers them (5000 in memory and in the record), says `ok`, and applies nothing. The tablet marks the tap answered and its prediction vanishes.
```
join1 true / tap1 -> opId tab_28owi8:1 ... hub tickets ['First']
leave {"ok":true} / join2 true
tap2 -> report "ok", opId tab_28owi8:1, ticket t_2 shown on the tablet
hub tickets after second tap: ['First']  | screen shows: ['First'] | hubStatus connected queued 0 | hub opIds ['tab_28owi8:1']
```
The order the cook just entered is gone and no refusal is shown. Same effect for any reload that keeps `tabId` (none today) and for two pages with the same random `tabId` (30 bits).
Smallest fix: make `opN` never restart (declare it outside `init`, or put a per-join random part into the opId, e.g. `tabId + ':' + joinNonce + ':' + n`).

### 2. DESTRUCTIVE / AUTH (confirmed): any paired screen, owner or not, can wipe the kitchen with `resetLive`; the hub has no per-action permission
`server/server.mjs:650-686` (the `/action` route passes any engine action type to `runAction`); the only guard is client-side, `src/js/30-store.js:1467`.
```
non-owner token, POST /action {"type":"resetLive","payload":{"catalog":"blank","keepSettings":false}}
-> 200 {"ok":true,"report":"ok",...}   menu 21 -> 0   tickets 1 -> 0
```
It is also undoable by nobody (resetLive is not in UNDOABLE). A "cook" tablet is paired with a token specifically so that only an owner screen does admin things (`/seed`, `/screen/*` do check `owner`), but the destructive engine actions (`resetLive`, `closeDay`, `updateSettings`, `restock`, `voidOrder`, `payOrder`...) are open to every token and, with no tokens/codes, to anybody who can reach the port.
Smallest fix: in `runAction` (or before it) keep a small set `OWNER_ONLY = ['resetLive', ...]` and refuse with `notOwner` when `au.screen && !au.screen.owner` (and when there is no token, require the write code or refuse). At minimum refuse `resetLive` over `/action` completely (the tablet client already never sends it).

### 3. AUTH BYPASS (confirmed): `GET /events` ignores the follow code, the write code and the version check
`server/server.mjs:622-638` calls only `authReq`; there is no `readOk`, no `versionFail`, no lock counting. With `SMOKEBOX_FOLLOW_CODE` and `SMOKEBOX_WRITE_CODE` set (and tokens not required):
```
GET /events (no code) -> 200, event: snapshot  data: {"state":{"v":1,"rev":0,"settings":...   (the whole kitchen)
GET /follow (no code) -> 403
```
With `REQUIRE_TOKENS=1` it is correctly 403. `src/js` no longer uses `/events` (grep finds none), so it is a leftover of stage 1. It also sends the full state to every client on every change with no backlog limit except `maxBacklog` and no gzip (CPU: `view()` stringifies the state once per client per change).
The beta.sh setup (codes only, no tokens) is therefore readable by anyone who passes Caddy's login. Fix: delete the route, or make it call the same checks as `handleFollow`.

### 4. DATA INTEGRITY (confirmed): taps queued for one kitchen are applied to a different hub; `hubChanged` only fires for a page reload
`src/js/30-store.js:1205` (`if (f.hub && f.fromCache && f.hubId && d.hubId !== f.hubId)`) drops the queue only when the kitchen was shown from the saved copy. In a running session the in-memory `f.pend` survives a hub that came back as a different history (wiped data dir, replaced hub, a `/seed`), and `hubAfterSnapshot` filters it only by opId.
```
join; cut the network; hub closes; tap createTicket "Offline-for-old-kitchen";
a NEW hub (different hubId) starts on the same port; network back
new hub tickets: ['Offline-for-old-kitchen']   client state: connected   (no hubChanged refusal)
```
Fix: in the `hello` handler, if `f.hub && f.hubId && d.hubId !== f.hubId` (not only `fromCache`) refuse every unanswered entry with `hubChanged`, clear `f.pend`, `QUEUE_KEY` and `CACHE_KEY`.

### 5. DATA LOSS (confirmed, narrow window): a torn last line in the record corrupts the next acknowledged action
`server/server.mjs:216-222` (`walAppend` writes `JSON + '\n'` to a file whose last line may lack its newline), `:244` (replay skips a bad line).
After a crash mid-write (or a failed write on a full disk) the file ends with `{"seq":3,...,"cust`. The hub restarts, ignores the line, and the next append glues onto it: `...cust{"seq":3,"opId":"o4",...}`. That entry (and everything after: the replay then reports a gap) is unreadable.
```
[hub] a damaged record line was ignored        restart 1: replayed 2 seq 2
actions o4, o5 acknowledged (200 ok)
wal: {"seq":3,"opId":"o3",...,"cust{"seq":3,"opId":"o4",...}   <- o4 destroyed
crash again before the 500 ms save -> restart 2: seq 2, tickets T1,T2  (T4,T5 were acknowledged)
```
Window: a second crash within `saveMs` (500 ms) of the first restart, or any time the state file cannot be written (disk full). Fix: when opening the record for append, if the file does not end in `\n`, write one first (or truncate to the last newline); on a failed append, truncate back to the previous length.

### 6. AVAILABILITY (confirmed): anyone who can reach the hub can block all pairing indefinitely, and behind the tunnel they can also lock the owner out
`server/screens.mjs:81` (30 wrong guesses in 10 minutes from anywhere burn every open code and lock pairing for 10 minutes) `server/server.mjs:598-600` (admin lockout is keyed by `admin:<address>`).
```
31 wrong codes from 31 different addresses, then the real valid owner code -> {"ok":false,"report":"tooManyTries"}
(single shared address) 5 wrong, then the valid code -> 429;  10 wrong Bearer keys, then the REAL admin key -> 429
```
A repeating loop of 31 requests per 10 minutes keeps a hub unpairable forever. Behind `tunnel.sh` (cloudflared -> Caddy -> hub) every caller reaches Caddy from 127.0.0.1, so `X-Forwarded-For` is always `127.0.0.1`: all internet callers share one bucket with each other and with the local admin CLI (`harden.sh` itself notes tunnel traffic cannot be told apart). The real code space (32^6 = 2^30, 5 tries/10 min/address) already makes the hub-wide counter unnecessary for guessing; it only adds this lever.
Fix (smallest): do not let the hub-wide counter burn codes that were issued to the owner: keep the per-address limit, raise the hub-wide threshold, and exempt the admin CLI (loopback with the correct key is never counted; count `admin:` failures only when the request carries a non-loopback forwarded address). Optionally lengthen codes to 8 characters.

### 7. AVAILABILITY (confirmed): a full hub is a permanent error on the tablet, and one address can take every stream slot
`src/js/30-store.js:1000` (`tooMany` is in FOLLOW_FATAL) and `:1278` (503 -> `tooMany`); `server/server.mjs:483,625` (100 streams in total, no per-address limit; the hub sends `retry-after: 10` that the client ignores).
```
hub full -> follower error tooMany; slot freed; 4 s later the follower is still: error tooMany (no retry)
100 streams from one address -> the 101st /follow gets 503
```
Also a tablet that reconnects while the hub still holds its dead half-open stream (the hub notices only when a write fails, up to 15 s) can hit 503 and then stops for good. Fix: treat `tooMany` as retryable (back off 10 s), and cap streams per address (e.g. 20) and per token (e.g. 4; close the oldest).

### 8. SECURITY (confirmed, needs a hub reachable without a login): DNS rebinding, the Host header is never checked
`server/server.mjs:426-435` and the `/action` copy at `:654-663` compare `Origin` host to the `Host` header, which the attacker controls.
```
POST /action  Host: rebind.evil.example  Origin: http://rebind.evil.example  -> 200 ok (action applied)
GET /events   Host: rebind.evil.example -> 200
```
A web page on the internet that rebinds its name to a hub on 127.0.0.1 or the kitchen LAN (open mode, which is the documented "trusted network" mode) can read the whole kitchen and write to it. Behind Caddy it does not apply (Caddy only serves its own host). Fix: accept only Host values that are an IP literal, `localhost`, or listed in `SMOKEBOX_HOSTS`; or require a token whenever HOST is not loopback.

### 9. DATA LOSS (confirmed): two hub processes on one data directory both run and overwrite each other
`server/server.mjs:213` opens the record with append and nothing locks the data folder.
```
hub1 ticket A, hub2 ticket B on the same state.json: wal has two lines with seq 1; state.json ends with only B; both hubs share one hubId.
```
Possible when the updater restarts before the old process has gone, a hand-started `node server.mjs`, or `beta.sh` with the wrong port/data. Fix: take an exclusive lock at start (`fs.openSync(file + '.lock', 'wx')` with the pid, removed on exit; stale if the pid is dead) and refuse to start otherwise.

### 10. SECURITY (suspected): tokens and codes land in Caddy's access log after `harden.sh`
`harden.sh:33-39` turns on JSON access logging with default fields. Caddy's JSON log includes request headers; it redacts only Authorization/Cookie style ones, so `X-Smokebox-Token` (long-lived, owner or not) and `X-Smokebox-Code` are written in clear to `/var/log/caddy/access.log` (mode 0640, read by group `adm` on Ubuntu). `beta.sh:174-175` also tells people to open `https://host/?hub&code=<WRITE CODE>`, and the URI (with the code) is logged for that first page load. Not run here (no Caddy in the sandbox).
Fix: add to the snippet `format filter { request>headers>X-Smokebox-Token delete; request>headers>X-Smokebox-Code delete; request>uri query { delete code } }`. Also change the beta hand-out to say "open the address, then type the code on the sheet", or use a URL fragment (`#code=`).

### 11. SECURITY / SUPPLY CHAIN (confirmed by reading; not run on a server)
- `server/smokebox-update.sh:46-60`: with no `/etc/smokebox/update-pubkey` (the default after go.sh) the nightly root job installs whatever is on the `deploy` branch, then `:99` copies the downloaded updater over `/usr/local/bin/smokebox-update` (root code from an unverified download). It prints a warning; nothing creates the key. A tag pin (`SMOKEBOX_UPDATE_REF`) is a movable ref.
- The health gate (`:85-91`) accepts `{"ok":true}` even when `dataProblem` is present, i.e. a build that set the saved file aside and started an empty kitchen counts as healthy and is not rolled back. Fix: fail when the body contains `dataProblem`.
- With signing turned on, the beta updater (`beta.sh:131-139` reuses the same script and the same `/etc/smokebox/update-pubkey`) will refuse every unsigned `connected` build (operational, not a hole).
- `tunnel.sh:17-18` installs the latest `cloudflared` .deb as root with only a size and `dpkg-deb --info` check (no checksum or signature). The tunnel bypasses fail2ban (noted in harden.sh) so the Caddy password can be guessed at will (each guess costs a bcrypt check) and, per item 6, all tunnel users share one rate-limit bucket.
- `go.sh:19-24` and `setup-server.sh:21-25` check archive names but not link members (the updater and beta.sh do). GNU tar guards most link tricks; still an inconsistency.

### 12. Minor / suspected
- `src/js/77-floor-setup.js:1650`: "Leave and pair again" (shown after a removal) calls `leaveHub({force:true})`, which deletes `hubqueue` including taps that were never sent because the token was revoked; the screen does not say how many were lost. (suspected)
- `?hub=<url>` / `?follow=<url>` (`70-floor-board.js:101-126`, `99-boot.js:214`) will connect to any address in a link with no confirmation, and show that hub's kitchen (rendered safely as text; XSS probe below found nothing). A pasted link can show a tablet a fake kitchen with fake temperatures. Tokens are per address so none leak. Fix: if the url origin differs from the page origin, show the address and ask.
- `server/server.mjs:546-549`: `handleSeed` reads up to 8 MB of body and parses it before checking the token (measured: 7.5 MB anonymous body, 403 after 119 ms). Check the token/code headers first, then read.
- Dedupe is global to the hub: another screen that sends the same opId gets `ok, duplicate` and its action is dropped (`:325`). opIds and screen ids (`by: "s:<id>"`) are broadcast to every read-only follower (`opMessage`), so a hostile paired screen can pre-empt another tablet's next tap (`tab_x:n+1`). Namespace `replies` by screen id.
- Tokenless screens can set `clientId` to another screen's `s:<id>` (id is not secret) and take its undo ownership (`:336`). Only matters in the optional-token mode.
- `loadSaved` treats a missing `seq` as 0 (`:82`); with a leftover record that would re-apply every entry on top of an already-final state. (suspected, legacy files only)
- `server/screens.mjs:42-45`: `save()` swallows write errors, so after a full disk a revoked screen is revoked only in memory and is valid again after a restart. (suspected)
- Restoring an older `state.json` (or `.bak`) keeps the same `hubId` (`:121`); a follower holding `seq` below the restored hub's can resume (`:494`) across a forked history. Regenerate `hubId` when the loaded `seq` is lower than the last one served, or on any manual restore. (suspected)
- State, record and `.bak` files get the process umask; only `.admin` and `.screens` are 0600. Under the systemd units `UMask=0077` covers it; a hand-started hub leaves kitchen data world-readable.
- No Content-Security-Policy on the page or the hub's response (`:689`); the page also loads Google Fonts. Nothing exploitable found, but no second line of defence.
- `/health` is unauthenticated and shows `hubId`, uptime and, if present, the name of the set-aside file.

## Checked and fine
- Token format and comparison: `screens.authenticate` is a strict regex, SHA-256 of the secret compared with `timingSafeEqual`; admin key and codes use the same hash-then-compare; tokens travel in headers only (`hubHeaders`), never in URLs; `?code=` is removed from the address bar (`codeFor`); list output has no hashes.
- Revocation: removing a screen destroys its open `/follow` and `/events` streams at once; reconnect and `/action` answer `revoked` (reproduced). A non-owner token gets `notOwner` on `/screen/*` and 403 on `/admin/*`; `owner:true` pairing is admin-key only.
- With `REQUIRE_TOKENS=1` every route except `/health` (and `/sw.js`, manifest, icons, `/pair`) refuses a call without a token (reproduced for /events, /follow, /probe, /action, /seed, /screen/list, /admin/screens).
- Pairing brute force: 2^30 codes, one use, 10 minutes, 5 tries per address and 30 hub-wide; the code is not leaked by `badName` ordering.
- trust-proxy: only honoured from loopback, takes the last entry, must be an IP; direct callers cannot choose their address.
- CSRF: JSON content type plus same-host Origin on `/action`, `/pair`, `/seed`, `/screen/*`; `Origin: null` is refused; CORS `*` is sent only on `/follow` and `/probe` and only when a code/token is set, and credentials are never ambient (headers), so a cross-site page cannot ride a login.
- Body limits and timeouts: 256 KB actions, 4 KB pairing, 8 MB seed; 413 closes the connection; `headersTimeout` 15 s, `requestTimeout` 30 s; SSE backlog over 4 MB drops the client; no request decompression, so no gzip bomb inbound; gzip on streams is flushed per event.
- Write-ahead log basics: fsync before the answer, refusals recorded, a resent opId after a restart gets the same answer, replay equals live apply (tick entries included), compaction runs after the state save, `/seed` clears the record and changes `hubId`, a bad or newer-version `state.json` is renamed or refused, never overwritten.
- XSS: a hub with HTML in the dish name, short name, ticket note, screen name and refusal text rendered as text in both `?follow` and `?hub` pages (Chromium; `window.__xss` stayed unset, no injected element). Hub text is placed with `textContent`/`h()`; the only `innerHTML` is the icon helper with names from code.
- Service worker: stores only a plain 200 text/html answer over 50 KB containing the Smokebox title (login pages, redirects and error pages are not stored); intercepts only navigations to the page itself under its own folder, never `/action`, `/follow` etc.; the key is fixed so no per-URL poisoning; caches carry no user data; `?nosw` skips it; the kill worker (`SMOKEBOX_NO_SW=1`) removes caches and itself; a failed install keeps the old worker; update is stored first and never reloads a page. Verified in Chromium: offline reload opens the app, `/other` is not served. (A hub that serves a different valid-looking page replaces the app on every tablet by design; the hub is trusted, and the secure-context rule keeps plain-http LAN pages out.)
- `/seed`: owner token or write code required, refused with 409 once any action or seed happened, streams ended, new `hubId`; the client only offers it when `probe.empty`.
- Admin key: 24 random bytes, file created 0600, read by the CLI only from the given data path, compared in constant time.
- systemd units: NoNewPrivileges, ProtectSystem=strict with one writable path, empty capability set, UMask 0077; env files 0600 root.

## Not covered
Real Caddy/cloudflared/systemd runs of the installers (read only); `?trim=N` divergence under random actions (relies on `rev`; covered by existing tests, not re-fuzzed); long-run soak (memory growth with many streams, `ops` byte cap); IPv6 /64 rotation against the per-address limits (reasoned only: per-address limits can be dodged, the hub-wide limit is what holds, which is item 6); the office/back-office screens beyond the joined-hub panel; Safari/iPad service worker behaviour.
