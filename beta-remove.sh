#!/usr/bin/env bash
# Removes the Smokebox beta completely: service, nightly update, files, user, codes, Caddy block and (unless --keep-data) the beta's data.
# The real Smokebox (service smokebox, /opt/smokebox, /var/lib/smokebox) is not touched. Usage (as root): bash beta-remove.sh [--keep-data]
set -euo pipefail
R="${SMOKEBOX_BETA_ROOT:-}"   # empty on a real server; tests point it at a scratch folder
[ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }
CADDYFILE="$R/etc/caddy/Caddyfile"; BETACADDY="$R/etc/caddy/beta.caddy"
systemctl disable --now smokebox-beta-update.timer >/dev/null 2>&1 || true
systemctl disable --now smokebox-beta >/dev/null 2>&1 || true
rm -f $R/etc/systemd/system/smokebox-beta.service $R/etc/systemd/system/smokebox-beta-update.service $R/etc/systemd/system/smokebox-beta-update.timer
rm -f $R/usr/local/bin/smokebox-beta-update $R/usr/local/bin/smokebox-beta-systemctl $R/etc/smokebox-beta.env $R/run/smokebox-beta-update.unused $R/run/lock/smokebox-beta-update.lock
systemctl daemon-reload
rm -rf "$R/opt/smokebox-beta" "$R/opt/smokebox-beta.new" "$R/opt/smokebox-beta.old"
if [ -f "$CADDYFILE" ] && grep -qF "import $BETACADDY" "$CADDYFILE"; then
  cp -p "$CADDYFILE" "$CADDYFILE.before-beta-remove"
  grep -vF "import $BETACADDY" "$CADDYFILE" > "$CADDYFILE.tmp" && cat "$CADDYFILE.tmp" > "$CADDYFILE"; rm -f "$CADDYFILE.tmp"
fi
rm -f "$BETACADDY"
if command -v caddy >/dev/null && caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then systemctl reload caddy || true
else echo "beta-remove: Caddy would not accept $CADDYFILE; the earlier copy is $CADDYFILE.before-beta-remove (nothing was reloaded)."; fi
if [ "${1:-}" = "--keep-data" ]; then echo "The beta's data is kept in /var/lib/smokebox-beta."; else rm -rf "$R/var/lib/smokebox-beta"; fi
id smokebox-beta >/dev/null 2>&1 && userdel smokebox-beta 2>/dev/null || true
echo "The Smokebox beta is removed. The real Smokebox was not touched."
