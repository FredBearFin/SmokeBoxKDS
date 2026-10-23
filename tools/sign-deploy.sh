#!/usr/bin/env bash
# Signs a deploy build so servers that have a public key installed (/etc/smokebox/update-pubkey) accept it. Run it in the folder that is about to be
# committed to the deploy branch, with the private key kept OFF the server and off GitHub:  bash tools/sign-deploy.sh /path/to/update-key.pem [folder]
# It writes deploy.manifest (a sha256 line per file) and deploy.manifest.sig (an ed25519 signature of it). Needs OpenSSL 3 (Ubuntu 22.04 and later).
# One-time key making:   openssl genpkey -algorithm ed25519 -out update-key.pem && openssl pkey -in update-key.pem -pubout -out update-pubkey.pem
set -euo pipefail
KEY="${1:?private key file (update-key.pem)}"; DIR="${2:-.}"
[ -f "$KEY" ] || { echo "no such key file: $KEY"; exit 1; }
cd "$DIR"
rm -f deploy.manifest deploy.manifest.sig
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT   # written elsewhere first, so the list can never contain itself
find . -type f ! -path './.git/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$TMP"
cat "$TMP" > deploy.manifest
openssl pkeyutl -sign -inkey "$KEY" -rawin -in deploy.manifest -out deploy.manifest.sig
echo "signed $(wc -l < deploy.manifest) files"
