#!/usr/bin/env bash
# Nightly updater for the Smokebox server. Installed by go.sh as /usr/local/bin/smokebox-update and run by smokebox-update.timer.
# It downloads the latest deploy build, checks it, swaps it in, restarts the service and, if the new build does not answer, puts the old one back.
# Saved data (/var/lib/smokebox) is never touched. Every path and command can be replaced through SMOKEBOX_* variables so the steps can be tested.
set -euo pipefail

PREFIX="${SMOKEBOX_PREFIX:-/opt/smokebox}"
REPO_ARCHIVE="https://github.com/FredBearFin/SmokeBoxKDS/archive"
REF="${SMOKEBOX_UPDATE_REF:-}"                  # a tag or a full commit id to stay on, instead of following the moving deploy branch
PUBKEY="${SMOKEBOX_PUBKEY:-/etc/smokebox/update-pubkey}"   # if this file exists the build must carry a signature made with its private key
SYSTEMCTL="${SMOKEBOX_SYSTEMCTL:-systemctl}"
HEALTH_URL="${SMOKEBOX_HEALTH_URL:-http://127.0.0.1:8787/health}"
SELF_DEST="${SMOKEBOX_SELF_DEST:-/usr/local/bin/smokebox-update}"
LOCK="${SMOKEBOX_LOCK:-/run/lock/smokebox-update.lock}"
MIN_BYTES="${SMOKEBOX_MIN_BYTES:-100000}"     # the built page alone is over a megabyte; anything tiny is an error page
HEALTH_TRIES="${SMOKEBOX_HEALTH_TRIES:-20}"
say() { echo "smokebox-update: $*"; }
fail() { say "$*"; exit 1; }
if [ -n "$REF" ]; then
  case "$REF" in *[!A-Za-z0-9._/-]*|*..*|/*) fail "SMOKEBOX_UPDATE_REF has characters that are not allowed; the running version is kept" ;; esac
  if printf '%s' "$REF" | grep -Eq '^[0-9a-f]{40}$'; then DEFAULT_URL="$REPO_ARCHIVE/$REF.tar.gz"; else DEFAULT_URL="$REPO_ARCHIVE/refs/tags/$REF.tar.gz"; fi
  say "pinned to $REF"
else
  DEFAULT_URL="$REPO_ARCHIVE/refs/heads/deploy.tar.gz"
fi
URL="${SMOKEBOX_UPDATE_URL:-$DEFAULT_URL}"

# One update at a time (the timer and a hand-started run could overlap).
mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock -n 9 || { say "another update is running; nothing to do"; exit 0; }

WORK="$(mktemp -d "${TMPDIR:-/var/tmp}/smokebox-update.XXXXXX")"
NEW="$PREFIX.new"; OLD="$PREFIX.old"
trap 'rm -rf "$WORK" "$NEW"' EXIT

# 1. Download, and make sure it is a real, reasonably large archive.
curl -fsSL --max-time 180 --retry 2 "$URL" -o "$WORK/update.tar.gz" || fail "download failed; the running version is kept"
[ -s "$WORK/update.tar.gz" ] || fail "the download is empty; the running version is kept"
SIZE="$(wc -c < "$WORK/update.tar.gz")"
[ "$SIZE" -ge "$MIN_BYTES" ] || fail "the download is only $SIZE bytes (expected at least $MIN_BYTES); the running version is kept"
gzip -t "$WORK/update.tar.gz" || fail "the download is not a valid gzip file; the running version is kept"

# 2. Refuse archives that could write outside the folder: absolute paths, '..' parts, links of any kind.
# (The listings go to files first: with "grep -q" straight after a pipe, tar can be cut off early and the check silently counted as "no match".)
tar -tzf "$WORK/update.tar.gz" > "$WORK/names.txt" || fail "the archive cannot be read; the running version is kept"
tar -tvzf "$WORK/update.tar.gz" > "$WORK/types.txt" || fail "the archive cannot be read; the running version is kept"
if grep -Eq '(^/|(^|/)\.\.(/|$))' "$WORK/names.txt"; then fail "the archive has unsafe paths; the running version is kept"; fi
if grep -Eq '^[^-d]' "$WORK/types.txt"; then fail "the archive contains links, devices or other special files; the running version is kept"; fi

# 3. Unpack beside the live folder and check the pieces the service needs.
rm -rf "$NEW"; mkdir -p "$NEW"
tar -xzf "$WORK/update.tar.gz" -C "$NEW" --strip-components=1 --no-same-owner --no-same-permissions
for f in server/server.mjs dist/smokebox.html src/js/20-engine.js; do
  [ -s "$NEW/$f" ] || fail "the new build has no $f; the running version is kept"
done
HTML_BYTES="$(wc -c < "$NEW/dist/smokebox.html")"
[ "$HTML_BYTES" -ge "$MIN_BYTES" ] || fail "the new page is only $HTML_BYTES bytes; the running version is kept"
# Integrity. SMOKEBOX_REQUIRE_SIGNED=1 makes a missing public key an error instead of a warning. With a public key installed, the build must carry deploy.manifest (a sha256 line for every file) and deploy.manifest.sig (its signature):
# the signature must verify, every file must match its line and no file may be missing from or extra to the list. Without a key nothing is verified.
if [ "${SMOKEBOX_REQUIRE_SIGNED:-0}" = "1" ] && [ ! -f "$PUBKEY" ]; then
  fail "signing is required (SMOKEBOX_REQUIRE_SIGNED=1) but $PUBKEY is missing; the running version is kept"
fi
if [ -f "$PUBKEY" ]; then
  command -v openssl >/dev/null || fail "openssl is needed to check the signature; the running version is kept"
  [ -s "$NEW/deploy.manifest" ] && [ -s "$NEW/deploy.manifest.sig" ] || fail "the build is not signed (deploy.manifest.sig is missing) and $PUBKEY exists; the running version is kept"
  openssl pkeyutl -verify -pubin -inkey "$PUBKEY" -rawin -in "$NEW/deploy.manifest" -sigfile "$NEW/deploy.manifest.sig" >/dev/null 2>&1 || fail "the signature does not match $PUBKEY; the running version is kept"
  ( cd "$NEW" && sha256sum --quiet -c deploy.manifest >/dev/null 2>&1 ) || fail "a file does not match the signed list; the running version is kept"
  LISTED="$(sed -E 's/^[0-9a-f]{64}  //' "$NEW/deploy.manifest" | LC_ALL=C sort)"
  ACTUAL="$(cd "$NEW" && find . -type f ! -name deploy.manifest ! -name deploy.manifest.sig | LC_ALL=C sort)"
  [ "$LISTED" = "$ACTUAL" ] || fail "the build has files that are not on the signed list (or the list names missing files); the running version is kept"
  say "signature OK ($PUBKEY)"
else
  say "WARNING: updates are NOT verified (no $PUBKEY): whoever can write the deploy branch controls this server. See docs/connected-howto.md to turn signing on."
fi
node --check "$NEW/server/server.mjs" || fail "the new server file does not parse; the running version is kept"
if [ "$(id -u)" -eq 0 ]; then chown -R root:root "$NEW"; fi

# 4. Swap in, restart, and wait for the new build to answer.
rm -rf "$OLD"
mv "$PREFIX" "$OLD"
mv "$NEW" "$PREFIX"
rollback() {
  say "$1; putting the previous version back"
  rm -rf "$PREFIX"
  mv "$OLD" "$PREFIX"
  "$SYSTEMCTL" restart smokebox || true
  exit 1
}
"$SYSTEMCTL" restart smokebox || rollback "the service would not restart"
healthy=0; DATA_PROBLEM=""
for _ in $(seq 1 "$HEALTH_TRIES"); do
  # The new build must say {"ok":true}; a build too old to have /health (404) is accepted if the page itself answers.
  body=$(curl -sS --max-time 3 -w '\n%{http_code}' "$HEALTH_URL" 2>/dev/null) || body=""
  code=${body##*$'\n'}
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"dataProblem"'; then DATA_PROBLEM="the new build set the saved data aside and started with an empty kitchen (dataProblem in $HEALTH_URL: $(printf '%s' "$body" | head -n1 | cut -c1-300)); the data was NOT deleted, look for state.json.bad-* in the data folder"; break; fi
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q '"ok":true'; then healthy=1; break; fi
  if [ "$code" = "404" ] && curl -fsS --max-time 3 "${HEALTH_URL%/health}/" -o /dev/null 2>/dev/null; then healthy=1; break; fi
  sleep 1
done
[ -z "$DATA_PROBLEM" ] || rollback "$DATA_PROBLEM"
[ "$healthy" -eq 1 ] || rollback "the new build did not answer at $HEALTH_URL"

# 5. Refresh this script from the new build (atomic), so improvements to the updater arrive too.
if [ -f "$PREFIX/server/smokebox-update.sh" ]; then
  cp "$PREFIX/server/smokebox-update.sh" "$SELF_DEST.new" && chmod 755 "$SELF_DEST.new" && mv "$SELF_DEST.new" "$SELF_DEST" || true
fi
say "updated; the previous version is kept in $OLD"
