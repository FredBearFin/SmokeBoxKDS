#!/usr/bin/env bash
# One-line installer for a fresh or existing Smokebox server: installs the app, HTTPS and the nightly self-update.
# Usage (as root): bash go.sh <login name> <password> [time zone]   (time zone defaults to America/New_York)
set -euo pipefail
LOGIN="${1:?login name}"
PASS="${2:-${SMOKEBOX_PASS:-}}"   # better: SMOKEBOX_PASS=... bash go.sh <login>, so the password is not in the process list or shell history
[ -n "$PASS" ] || { echo "password needed (second argument or SMOKEBOX_PASS)"; exit 1; }
TZNAME="${3:-America/New_York}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
cd /root
curl -fsSL --max-time 180 --retry 2 https://github.com/FredBearFin/SmokeBoxKDS/archive/refs/heads/deploy.tar.gz -o smokebox-server.tar.gz
[ "$(wc -c < smokebox-server.tar.gz)" -ge 100000 ] || { echo "The download is too small to be the app; stopping."; exit 1; }
gzip -t smokebox-server.tar.gz
if tar -tzf smokebox-server.tar.gz | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo "The archive has unsafe paths; stopping."; exit 1; fi
rm -rf /root/smokebox-src && mkdir -p /root/smokebox-src
tar -xzf smokebox-server.tar.gz -C /root/smokebox-src --strip-components=1 --no-same-owner --no-same-permissions
[ -s /root/smokebox-src/server/server.mjs ] && [ -s /root/smokebox-src/server/smokebox-update.sh ] || { echo "The download is missing server files; stopping."; exit 1; }
SMOKEBOX_PASS="$PASS" bash /root/smokebox-src/server/setup-server.sh "$TZNAME" "$LOGIN" < /dev/null

# Nightly update: the updater lives in the repository (server/smokebox-update.sh). It downloads the latest deploy build, checks it, swaps it
# in, restarts, and puts the old build back if the new one does not answer. Saved data is never touched.
install -m 755 /root/smokebox-src/server/smokebox-update.sh /usr/local/bin/smokebox-update
cat > /etc/systemd/system/smokebox-update.service <<'EOF'
[Unit]
Description=Update Smokebox from GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/smokebox-update
EOF
cat > /etc/systemd/system/smokebox-update.timer <<'EOF'
[Unit]
Description=Nightly Smokebox update
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now smokebox-update.timer
echo
echo "Nightly update is on (4:30 AM server time). To update right now: systemctl start smokebox-update"
