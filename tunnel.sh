#!/usr/bin/env bash
# Adds a second web address (https://<random-words>.trycloudflare.com) that reaches the same Smokebox server through Cloudflare,
# for networks that block the server's own address. The password prompt still applies. Run as root: bash tunnel.sh
# It only adds a service; it changes nothing already installed. To remove it: systemctl disable --now smokebox-tunnel
set -euo pipefail
R="${SMOKEBOX_TUNNEL_ROOT:-}"   # empty on a real server; tests point it at a scratch folder
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
[ -f "$R/etc/caddy/Caddyfile" ] || { echo "Install the server first (go.sh)."; exit 1; }
DOMAIN="$(awk 'NR==1 {print $1; exit}' "$R/etc/caddy/Caddyfile")"
ARCH="$(dpkg --print-architecture)"
case "$ARCH" in amd64|arm64) ;; *) echo "Unsupported CPU: $ARCH"; exit 1 ;; esac

# The Cloudflare connector, from its official release page.
TMPDEB="$(mktemp "$R/var/tmp/cloudflared.XXXXXX.deb")"
trap 'rm -f "$TMPDEB"' EXIT
# SMOKEBOX_CLOUDFLARED_VERSION=2025.1.2 pins a version (otherwise the newest is used). The package is installed only if its sha256 is the one you give
# (the second word on the command line, or SMOKEBOX_CLOUDFLARED_SHA256): copy it from the release page of that version at
# https://github.com/cloudflare/cloudflared/releases . Without it this script downloads, shows the sha256 of what it got and stops (exit 2).
VERSION="${SMOKEBOX_CLOUDFLARED_VERSION:-}"
case "$VERSION" in ''|*[!A-Za-z0-9._-]*|*..*) [ -z "$VERSION" ] || { echo "SMOKEBOX_CLOUDFLARED_VERSION has characters that are not allowed; stopping."; exit 1; } ;; esac
if [ -n "$VERSION" ]; then DEB_URL="https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-linux-${ARCH}.deb"
else DEB_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"; fi
EXPECT="$(printf '%s' "${1:-${SMOKEBOX_CLOUDFLARED_SHA256:-}}" | tr 'A-F' 'a-f')"
curl -fsSL --max-time 180 --retry 2 "$DEB_URL" -o "$TMPDEB"
[ "$(wc -c < "$TMPDEB")" -ge 1000000 ] || { echo "The download is too small to be the connector; stopping."; exit 1; }
dpkg-deb --info "$TMPDEB" >/dev/null || { echo "The download is not a valid package; stopping."; exit 1; }
GOT="$(sha256sum "$TMPDEB" | cut -d' ' -f1)"
if [ -z "$EXPECT" ]; then
  echo "Downloaded $DEB_URL"
  echo "Its sha256 is: $GOT"
  echo "Nothing was installed. Compare that with the checksum shown for this file on https://github.com/cloudflare/cloudflared/releases (open the release, look at the asset)."
  echo "If they are the same, run:  bash tunnel.sh $GOT"
  exit 2
fi
[ "$GOT" = "$EXPECT" ] || { echo "The download's sha256 ($GOT) does not match the one you gave ($EXPECT); nothing was installed."; exit 1; }
dpkg -i "$TMPDEB"

# The tunnel goes through the same web server, so the password prompt is still in front of the app. Note: Cloudflare carries this traffic
# (including the password you type) in a form it can read, and anyone who learns the random address can reach the sign-in page.
cat > "$R/etc/systemd/system/smokebox-tunnel.service" <<UNIT
[Unit]
Description=Smokebox second address through Cloudflare
After=network-online.target caddy.service
Wants=network-online.target

[Service]
User=nobody
Group=nogroup
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url https://127.0.0.1:443 --no-tls-verify --http-host-header ${DOMAIN} --origin-server-name ${DOMAIN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# A tiny command that prints the current address (it changes each time the tunnel restarts).
cat > "$R/usr/local/bin/smokebox-url" <<'EOF'
#!/usr/bin/env bash
journalctl -u smokebox-tunnel --no-pager -o cat | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
EOF
chmod +x "$R/usr/local/bin/smokebox-url"

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
