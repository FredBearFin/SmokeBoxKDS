#!/usr/bin/env bash
# Sets up the hosted Smokebox server on a fresh or existing Ubuntu 22.04 or 24.04 server: the Rust server (kitchens, devices, support) on
# Postgres, the natural voice helper, automatic HTTPS and a password. Running it again updates everything and keeps the kitchens.
# Usage (as root): bash setup-server.sh <time zone> <login name> <password> [domain]
# If smokebox-server.tar.gz is not in the current folder, it is downloaded from the public GitHub repo (branch main).
# Example: bash setup-server.sh America/New_York freddy 'a-long-password' smokebox.example.com
# With no domain it uses <your-server-ip>.sslip.io, a free name that points at your IP, so HTTPS works at once.
set -euo pipefail
TZNAME="${1:?time zone, for example America/New_York}"
LOGIN="${2:?login name}"
PASS="${3:-${SMOKEBOX_PASS:-}}"   # or set SMOKEBOX_PASS so it is not on the command line
DOMAIN="${4:-}"
[ -n "$PASS" ] || { echo "password needed (third argument or SMOKEBOX_PASS)"; exit 1; }
[ "${#PASS}" -ge 8 ] || { echo "Use a password of at least 8 characters (a long phrase is best): this server is on the internet."; exit 1; }
# These go into the Caddy file and the service file as they are, so only plain characters are allowed (a space or a brace would break them).
[[ "$LOGIN" =~ ^[A-Za-z0-9._@-]{1,64}$ ]] || { echo "Use a login name of letters, digits, dots, dashes or underscores only."; exit 1; }
[[ "$TZNAME" =~ ^[A-Za-z0-9/_+-]+$ ]] && [ -e "/usr/share/zoneinfo/$TZNAME" ] || { echo "Unknown time zone: $TZNAME (for example America/New_York); stopping."; exit 1; }
[ -z "$DOMAIN" ] || [[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]] || { echo "'$DOMAIN' does not look like a web address name; stopping."; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash ...)"; exit 1; }
if [ ! -f smokebox-server.tar.gz ]; then
  curl -fsSL --max-time 180 --retry 2 https://github.com/FredBearFin/SmokeBoxKDS/archive/refs/heads/main.tar.gz -o smokebox-server.tar.gz
fi
[ "$(wc -c < smokebox-server.tar.gz)" -ge 100000 ] || { echo "smokebox-server.tar.gz is too small to be the app; stopping."; exit 1; }
gzip -t smokebox-server.tar.gz
NAMES="$(tar -tzf smokebox-server.tar.gz)"   # read fully first: a pipe into grep -q can cut tar off and look like "no match"
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<< "$NAMES"; then echo "The archive has unsafe paths; stopping."; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Caddy (web server that gets and renews HTTPS certificates by itself)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# The app
id smokebox >/dev/null 2>&1 || useradd --system --home /opt/smokebox --shell /usr/sbin/nologin smokebox
rm -rf /opt/smokebox.new && mkdir -p /opt/smokebox.new
tar -xzf smokebox-server.tar.gz -C /opt/smokebox.new --strip-components=1 --no-same-owner --no-same-permissions
[ -s /opt/smokebox.new/server/voice-server.mjs ] && [ -s /opt/smokebox.new/dist/smokebox.html ] || { echo "The download is missing app files; stopping."; exit 1; }
# The server program, built by GitHub from the same main branch (release server-latest), checked against its published checksum.
mkdir -p /opt/smokebox.new/bin
curl -fsSL --max-time 300 --retry 2 https://github.com/FredBearFin/SmokeBoxKDS/releases/download/server-latest/smokebox-server -o /opt/smokebox.new/bin/smokebox-server
curl -fsSL --max-time 60 --retry 2 https://github.com/FredBearFin/SmokeBoxKDS/releases/download/server-latest/smokebox-server.sha256 -o /opt/smokebox.new/bin/smokebox-server.sha256
(cd /opt/smokebox.new/bin && sha256sum -c smokebox-server.sha256 >/dev/null) || { echo "The server program download is damaged; stopping. Nothing was changed."; exit 1; }
chmod 755 /opt/smokebox.new/bin/smokebox-server
rm -rf /opt/smokebox && mv /opt/smokebox.new /opt/smokebox
mkdir -p /var/lib/smokebox
chown -R smokebox:smokebox /var/lib/smokebox
chown -R root:root /opt/smokebox

# The natural kitchen voice (server/voice.mjs): espeak-ng for pronunciation, the ONNX runtime and the free Kokoro voice
# model (325 MB, downloaded once and kept in /opt/smokebox-voice across updates). If any step fails the app still runs and
# the tablets use their own voice.
echo "Setting up the natural voice (the first time downloads about 330 MB)..."
apt-get install -y espeak-ng >/dev/null 2>&1 || echo "espeak-ng could not be installed; tablets will use their own voice."
mkdir -p /opt/smokebox-voice
[ -d /opt/smokebox-voice/node_modules/onnxruntime-node ] || npm install --prefix /opt/smokebox-voice --ignore-scripts --no-audit --no-fund onnxruntime-node@1.22.0 >/dev/null 2>&1 || echo "The voice runtime could not be installed; tablets will use their own voice."
if [ ! -s /opt/smokebox-voice/kokoro-v1.0.onnx ]; then
  curl -fsSL --max-time 900 --retry 2 https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx -o /opt/smokebox-voice/kokoro-v1.0.onnx.part \
    && mv /opt/smokebox-voice/kokoro-v1.0.onnx.part /opt/smokebox-voice/kokoro-v1.0.onnx || { rm -f /opt/smokebox-voice/kokoro-v1.0.onnx.part; echo "The voice model could not be downloaded; tablets will use their own voice."; }
fi
chown -R root:root /opt/smokebox-voice

# Name for HTTPS: your own domain, or <ip>.sslip.io
if [ -z "$DOMAIN" ]; then
  IP="$(curl -4 -fsS https://api.ipify.org)"
  DOMAIN="${IP//./-}.sslip.io"
fi

# The database: Postgres on this server, one database "smokebox". Its password is made once, at random, and kept only in
# /etc/smokebox/server.env (readable by root alone); running this script again keeps it, so the kitchens stay.
apt-get install -y postgresql qrencode >/dev/null
systemctl enable --now postgresql
mkdir -p /etc/smokebox && chmod 700 /etc/smokebox
if [ ! -s /etc/smokebox/server.env ]; then
  DBPASS="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sudo -u postgres psql -qc "CREATE ROLE smokebox LOGIN PASSWORD '${DBPASS}';" >/dev/null 2>&1 || sudo -u postgres psql -qc "ALTER ROLE smokebox LOGIN PASSWORD '${DBPASS}';" >/dev/null
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname = 'smokebox'" | grep -q 1 || sudo -u postgres createdb -O smokebox smokebox
  printf 'DATABASE_URL=postgres://smokebox:%s@127.0.0.1:5432/smokebox\n' "$DBPASS" > /etc/smokebox/server.env
fi
# The address in password links follows the site name, so it is written again each run.
sed -i '/^PUBLIC_URL=/d' /etc/smokebox/server.env
printf 'PUBLIC_URL=https://%s\n' "$DOMAIN" >> /etc/smokebox/server.env
chmod 600 /etc/smokebox/server.env

# The server program runs as the smokebox user with no files to write (everything is in Postgres).
cat > /etc/systemd/system/smokebox.service <<UNIT
[Unit]
Description=Smokebox server (kitchens, devices, support)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=smokebox
EnvironmentFile=/etc/smokebox/server.env
Environment=PORT=8790
Environment=HOST=127.0.0.1
Environment=TZ=${TZNAME}
Environment=SMOKEBOX_TZ=${TZNAME}
Environment=SMOKEBOX_HTML=/opt/smokebox/dist/smokebox.html
WorkingDirectory=/opt/smokebox
ExecStart=/opt/smokebox/bin/smokebox-server
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
CapabilityBoundingSet=
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT

# The natural voice helper (server/voice-server.mjs): the web server sends /api/voice and /api/voices here.
cat > /etc/systemd/system/smokebox-voice.service <<UNIT
[Unit]
Description=Smokebox natural kitchen voice
After=network.target

[Service]
User=smokebox
Environment=PORT=8788
Environment=HOST=127.0.0.1
WorkingDirectory=/opt/smokebox
ExecStart=/usr/bin/node /opt/smokebox/server/voice-server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/smokebox
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
CapabilityBoundingSet=
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
# The old nightly updater swapped in the one-kitchen hub; updates are now this script, so it is switched off if it is there.
systemctl disable --now smokebox-update.timer >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable smokebox smokebox-voice >/dev/null 2>&1
systemctl restart smokebox smokebox-voice

# Short commands for the owner of the server (they read the database address from /etc/smokebox/server.env):
#   smokebox-staff EMAIL NAME   adds a support staff member and shows the code to scan into a free authenticator app
#   smokebox-reset EMAIL        prints a one-hour link that sets a new password for a kitchen owner
cat > /usr/local/bin/smokebox-staff <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: smokebox-staff EMAIL NAME"; exit 2; }
set -a; . /etc/smokebox/server.env; set +a
OUT="$(/opt/smokebox/bin/smokebox-server staff-add "$1" "${*:2}")"
echo "$OUT" | grep -v '^Or scan'
URI="$(echo "$OUT" | sed -n 's/^Or scan: //p')"
echo; echo "Scan this with Google Authenticator or Microsoft Authenticator (free apps), or type the secret above:"
qrencode -t ANSI256 -m 2 "$URI" 2>/dev/null || qrencode -t ASCII "$URI"
CMD
cat > /usr/local/bin/smokebox-reset <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: smokebox-reset OWNER-EMAIL"; exit 2; }
set -a; . /etc/smokebox/server.env; set +a
/opt/smokebox/bin/smokebox-server owner-reset "$1"
CMD
chmod 700 /usr/local/bin/smokebox-staff /usr/local/bin/smokebox-reset

# A copy of the database every night, kept 14 days in /var/backups/smokebox, and (once smokebox-offsite is set up) an encrypted copy
# off this server, in a Backblaze B2 bucket (free up to 10 GB). Every run is written down, and the staff console shows the latest.
# Once a week the newest copy is restored into a scratch database to prove it really works (smokebox-restore-check, also by hand).
apt-get install -y rclone postgresql-client >/dev/null 2>&1 || apt-get install -y rclone
mkdir -p /var/backups/smokebox && chmod 700 /var/backups/smokebox
mkdir -p /etc/smokebox/offsite && chmod 700 /etc/smokebox/offsite
cat > /usr/local/sbin/smokebox-note-backup <<'CMD'
#!/bin/sh
# smokebox-note-backup KIND OK SIZE OFFSITE NOTE: writes one row in backup_runs (KIND backup or restore-check, OK true or false).
# (psql fills in :'name' only in SQL it reads from its input, which also keeps quotes in the note safe.)
echo "INSERT INTO backup_runs (at, kind, ok, size_bytes, offsite, note) VALUES ((extract(epoch from now()) * 1000)::bigint, :'kind', :'ok', :'size', :'off', :'note');" |
  sudo -u postgres psql -q -d smokebox -v ON_ERROR_STOP=1 -v kind="$1" -v ok="$2" -v size="$3" -v off="$4" -v note="$5" >/dev/null 2>&1 || true
CMD
cat > /etc/cron.daily/smokebox-backup <<'CMD'
#!/bin/sh
cd /var/backups/smokebox || exit 1
F="smokebox-$(date +%F).sql.gz"
if sudo -u postgres pg_dump smokebox | gzip > "$F.part" && [ -s "$F.part" ] && mv "$F.part" "$F"; then
  SIZE="$(wc -c < "$F")"; OFF=false; NOTE=""
  if [ -s /etc/smokebox/offsite/rclone.conf ]; then
    if rclone --config /etc/smokebox/offsite/rclone.conf copy "$F" smokebox-safe: >/tmp/smokebox-offsite.log 2>&1; then OFF=true; else NOTE="off-server copy failed: $(tail -c 300 /tmp/smokebox-offsite.log)"; fi
    rclone --config /etc/smokebox/offsite/rclone.conf delete --min-age 60d smokebox-safe: >/dev/null 2>&1 || true
  else
    NOTE="no off-server copy: run smokebox-offsite"
  fi
  /usr/local/sbin/smokebox-note-backup backup true "$SIZE" "$OFF" "$NOTE"
else
  rm -f "$F.part"; /usr/local/sbin/smokebox-note-backup backup false 0 false "pg_dump failed"
fi
find /var/backups/smokebox -name 'smokebox-*.sql.gz' -mtime +14 -delete
CMD
chmod 755 /etc/cron.daily/smokebox-backup /usr/local/sbin/smokebox-note-backup
cat > /usr/local/bin/smokebox-restore-check <<'CMD'
#!/usr/bin/env bash
# Restores the newest nightly copy into a scratch database, checks the kitchens are there, then removes the scratch database.
set -uo pipefail
F="$(ls -1t /var/backups/smokebox/smokebox-*.sql.gz 2>/dev/null | head -1)"
[ -n "$F" ] || { echo "No backup yet."; /usr/local/sbin/smokebox-note-backup restore-check false 0 false "no backup file"; exit 1; }
sudo -u postgres dropdb --if-exists smokebox_restore_check
sudo -u postgres createdb smokebox_restore_check
if gunzip -c "$F" | sudo -u postgres psql -q -d smokebox_restore_check -v ON_ERROR_STOP=1 >/dev/null 2>/tmp/smokebox-restore.log; then
  N="$(sudo -u postgres psql -tA -d smokebox_restore_check -c 'SELECT COUNT(*) FROM kitchens' 2>/dev/null || echo x)"
  if [[ "$N" =~ ^[0-9]+$ ]]; then echo "Restore check OK: $(basename "$F") has $N kitchens."; /usr/local/sbin/smokebox-note-backup restore-check true "$(wc -c < "$F")" false "$N kitchens from $(basename "$F")"; R=0
  else echo "Restore check FAILED: no kitchens table."; /usr/local/sbin/smokebox-note-backup restore-check false 0 false "no kitchens table"; R=1; fi
else
  echo "Restore check FAILED:"; tail -5 /tmp/smokebox-restore.log; /usr/local/sbin/smokebox-note-backup restore-check false 0 false "$(tail -c 300 /tmp/smokebox-restore.log)"; R=1
fi
sudo -u postgres dropdb --if-exists smokebox_restore_check
exit $R
CMD
printf '#!/bin/sh\n/usr/local/bin/smokebox-restore-check >/dev/null 2>&1\n' > /etc/cron.weekly/smokebox-restore-check
# smokebox-offsite: asks for a Backblaze B2 key and a backup passphrase, and sets up the encrypted off-server copy. The passphrase is
# needed to read the copies if this server is ever lost, so it must be written down somewhere else.
cat > /usr/local/bin/smokebox-offsite <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
echo "Off-server backups go to your own Backblaze B2 bucket (free up to 10 GB), encrypted with a passphrase you choose."
read -rp "B2 keyID: " KEYID; read -rsp "B2 applicationKey (hidden): " APPKEY; echo
read -rp "Bucket name: " BUCKET
read -rsp "Backup passphrase (hidden, write it down somewhere safe): " PHRASE; echo
read -rsp "Same passphrase again: " PHRASE2; echo
[ "$PHRASE" = "$PHRASE2" ] || { echo "The two passphrases differ. Nothing changed."; exit 1; }
[ "${#PHRASE}" -ge 12 ] || { echo "Use a passphrase of at least 12 characters. Nothing changed."; exit 1; }
C=/etc/smokebox/offsite/rclone.conf.new
umask 077
{ printf '[b2]\ntype = b2\naccount = %s\nkey = %s\n\n' "$KEYID" "$APPKEY"
  printf '[smokebox-safe]\ntype = crypt\nremote = b2:%s/smokebox\npassword = %s\n' "$BUCKET" "$(rclone obscure "$PHRASE")"; } > "$C"
echo test > /tmp/smokebox-offsite-test.txt
if rclone --config "$C" copy /tmp/smokebox-offsite-test.txt smokebox-safe:check/ && rclone --config "$C" delete smokebox-safe:check/; then
  mv "$C" /etc/smokebox/offsite/rclone.conf; rm -f /tmp/smokebox-offsite-test.txt
  echo "Off-server backups are on. Tonight's copy goes to $BUCKET. Running one now..."; /etc/cron.daily/smokebox-backup && echo "Done."
else
  rm -f "$C" /tmp/smokebox-offsite-test.txt; echo "Backblaze refused the key or bucket. Check them and try again. Nothing changed."; exit 1
fi
CMD
chmod 700 /usr/local/bin/smokebox-restore-check /usr/local/bin/smokebox-offsite; chmod 755 /etc/cron.weekly/smokebox-restore-check

# The password goes to Caddy on its input, not on the command line (where any user on the server could read it in the process list). An older Caddy
# that cannot read it that way gets it on the command line as before. Only its hash is kept, in /etc/smokebox/site (root only).
HASH="$(printf '%s\n' "$PASS" | caddy hash-password 2>/dev/null || true)"
case "$HASH" in '$2'*) ;; *) HASH="$(caddy hash-password --plaintext "$PASS")" ;; esac
mkdir -p /etc/smokebox/site && chmod 700 /etc/smokebox/site
printf '%s\n' "$DOMAIN" > /etc/smokebox/site/domain
printf '%s\n' "$LOGIN" > /etc/smokebox/site/login
printf '%s\n' "$HASH" > /etc/smokebox/site/hash
chmod 600 /etc/smokebox/site/*

# smokebox-site writes the web server's settings and restarts it. While the site is locked (the default) every page asks for the login
# above, except what must reach the server without one: the health check (for the uptime monitor) and Stripe's payment messages.
# smokebox-open removes the login for everyone (for launch: kitchens sign in with their own accounts); smokebox-lock puts it back.
# The voice helper always answers joined kitchen devices only (Caddy asks the server first, which also limits how fast).
cat > /usr/local/sbin/smokebox-site <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
DOMAIN="$(cat /etc/smokebox/site/domain)"; LOGIN="$(cat /etc/smokebox/site/login)"; HASH="$(cat /etc/smokebox/site/hash)"
if [ -f /etc/smokebox/site/open ]; then
  AUTH=""
else
  AUTH="	@locked not path /health /healthz /api/stripe/webhook
	basic_auth @locked {
		${LOGIN} ${HASH}
	}"
fi
# Re-running keeps what beta.sh and harden.sh added to the old file: harden's snippet import at the top and its "import smokebox_log" in the
# site, and every other top-level import line (the beta site) at the end. If Caddy refuses the result, the plain site is installed and the
# old file is kept as Caddyfile.before-setup.
keep_imports() {
  local old="$1" new="$2" body
  [ -f "$old" ] || return 0
  body="$(cat "$new")"
  if grep -q '^[[:space:]][[:space:]]*import smokebox_log[[:space:]]*$' "$old"; then body="$(printf '%s\n' "$body" | awk 'NR == 1 { print; print "\timport smokebox_log"; next } { print }')"; fi
  {
    if grep -qx 'import /etc/caddy/harden-log.caddy' "$old"; then printf '# smokebox-harden\nimport /etc/caddy/harden-log.caddy\n\n'; fi
    printf '%s\n' "$body"
    { grep '^import ' "$old" || true; } | { grep -vx 'import /etc/caddy/harden-log.caddy' || true; } | while IFS= read -r line; do printf '\n%s\n' "$line"; done
  } > "$new.tmp"
  cat "$new.tmp" > "$new"; rm -f "$new.tmp"
}
CADDYFILE=/etc/caddy/Caddyfile
cat > "$CADDYFILE.plain" <<CADDY
${DOMAIN} {
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
		Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=()"
		-Server
	}
	request_body {
		max_size 4MB
	}
${AUTH}
	handle /api/voice* {
		forward_auth 127.0.0.1:8790 {
			uri /api/voice-ok
		}
		reverse_proxy 127.0.0.1:8788
	}
	handle {
		reverse_proxy 127.0.0.1:8790 {
			flush_interval -1
		}
	}
}
CADDY
cp "$CADDYFILE.plain" "$CADDYFILE.setup"
if [ -f "$CADDYFILE" ]; then
  cp -p "$CADDYFILE" "$CADDYFILE.before-setup"
  keep_imports "$CADDYFILE" "$CADDYFILE.setup"
  if ! cmp -s "$CADDYFILE.plain" "$CADDYFILE.setup" && ! caddy validate --config "$CADDYFILE.setup" --adapter caddyfile >/dev/null 2>&1; then
    echo "Caddy did not accept the site with the earlier extras (beta.sh, harden.sh) kept, so the plain site is installed. Run those scripts again;"
    echo "the earlier file is $CADDYFILE.before-setup."
    cp "$CADDYFILE.plain" "$CADDYFILE.setup"
  fi
fi
mv "$CADDYFILE.setup" "$CADDYFILE"; rm -f "$CADDYFILE.plain"
systemctl restart caddy
if [ -f /etc/smokebox/site/open ]; then echo "The site is OPEN: anyone can reach the start page; kitchens sign in with their own accounts."; else echo "The site is LOCKED: every page asks for the login ${LOGIN}."; fi
CMD
cat > /usr/local/bin/smokebox-open <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
touch /etc/smokebox/site/open && /usr/local/sbin/smokebox-site
CMD
cat > /usr/local/bin/smokebox-lock <<'CMD'
#!/usr/bin/env bash
set -euo pipefail
rm -f /etc/smokebox/site/open && /usr/local/sbin/smokebox-site
CMD
chmod 700 /usr/local/sbin/smokebox-site /usr/local/bin/smokebox-open /usr/local/bin/smokebox-lock
/usr/local/sbin/smokebox-site

# The firewall lets in ssh on every port sshd really listens on (not only 22), so a server with ssh moved elsewhere does not lock its owner out.
ufw allow OpenSSH >/dev/null
for p in $(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}'); do if [[ "$p" =~ ^[0-9]+$ ]]; then ufw allow "$p/tcp" >/dev/null; fi; done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

sleep 3
echo
echo "Done. Open https://${DOMAIN}/ and sign in as ${LOGIN}."
echo "If your own domain was given, point its A record at this server's IP first."
echo "Check:   systemctl status smokebox smokebox-voice caddy"
echo "Logs:    journalctl -u smokebox -f"
echo "Data:    Postgres database smokebox (copied every night to /var/backups/smokebox; smokebox-offsite adds an encrypted copy off this server)"
echo "Site:    smokebox-open lets kitchens in without the login above; smokebox-lock puts the login back"
echo "Staff:   smokebox-staff you@example.com Freddy      Owner password link:   smokebox-reset owner@example.com"
