#!/usr/bin/env bash
# One-line installer for a fresh or existing Smokebox server: installs the app, HTTPS and the nightly self-update.
# Usage (as root): bash go.sh <login name> <password> [time zone]   (time zone defaults to America/New_York)
set -euo pipefail
LOGIN="${1:?login name}"
PASS="${2:?password}"
TZNAME="${3:-America/New_York}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
cd /root
curl -fsSL https://github.com/FredBearFin/SmokeBoxKDS/archive/refs/heads/deploy.tar.gz -o smokebox-server.tar.gz
rm -rf /root/smokebox-src && mkdir -p /root/smokebox-src
tar -xzf smokebox-server.tar.gz -C /root/smokebox-src --strip-components=1
bash /root/smokebox-src/server/setup-server.sh "$TZNAME" "$LOGIN" "$PASS" < /dev/null

# Nightly update: fetch the latest deploy build at 4:30 AM server time, swap it in, restart. Saved data is never touched.
cat > /usr/local/bin/smokebox-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /tmp
curl -fsSL https://github.com/FredBearFin/SmokeBoxKDS/archive/refs/heads/deploy.tar.gz -o smokebox-update.tar.gz
rm -rf /opt/smokebox.new && mkdir -p /opt/smokebox.new
tar -xzf smokebox-update.tar.gz -C /opt/smokebox.new --strip-components=1
chown -R root:root /opt/smokebox.new
rm -rf /opt/smokebox.old && mv /opt/smokebox /opt/smokebox.old && mv /opt/smokebox.new /opt/smokebox
systemctl restart smokebox
rm -f smokebox-update.tar.gz
EOF
chmod +x /usr/local/bin/smokebox-update
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
