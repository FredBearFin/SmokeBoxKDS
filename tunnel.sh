#!/usr/bin/env bash
# Adds a second web address (https://<random-words>.trycloudflare.com) that reaches the same Smokebox server through Cloudflare,
# for networks that block the server's own address. The password prompt still applies. Run as root: bash tunnel.sh
# It only adds a service; it changes nothing already installed. To remove it: systemctl disable --now smokebox-tunnel
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
[ -f /etc/caddy/Caddyfile ] || { echo "Install the server first (go.sh)."; exit 1; }
DOMAIN="$(awk 'NR==1 {print $1; exit}' /etc/caddy/Caddyfile)"
ARCH="$(dpkg --print-architecture)"
case "$ARCH" in amd64|arm64) ;; *) echo "Unsupported CPU: $ARCH"; exit 1 ;; esac

# The Cloudflare connector, from its official release page.
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
rm -f /tmp/cloudflared.deb

# The tunnel goes through the same web server, so the password prompt is still in front of the app.
cat > /etc/systemd/system/smokebox-tunnel.service <<UNIT
[Unit]
Description=Smokebox second address through Cloudflare
After=network-online.target caddy.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url https://127.0.0.1:443 --no-tls-verify --http-host-header ${DOMAIN} --origin-server-name ${DOMAIN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# A tiny command that prints the current address (it changes each time the tunnel restarts).
cat > /usr/local/bin/smokebox-url <<'EOF'
#!/usr/bin/env bash
journalctl -u smokebox-tunnel --no-pager -o cat | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
EOF
chmod +x /usr/local/bin/smokebox-url

systemctl daemon-reload
systemctl enable --now smokebox-tunnel
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  URL="$(smokebox-url || true)"
  [ -n "$URL" ] && break
  sleep 2
done
echo
if [ -n "${URL:-}" ]; then
  echo "Your second address: $URL"
  echo "Sign in with the same login name and password. To see it again later, type: smokebox-url"
  echo "Note: this address changes if the tunnel restarts (for example after a reboot). Type smokebox-url for the new one."
else
  echo "The tunnel started but the address is not ready yet. Wait a minute, then type: smokebox-url"
fi
