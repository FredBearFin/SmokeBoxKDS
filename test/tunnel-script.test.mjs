// tunnel.sh against a scratch folder (SMOKEBOX_TUNNEL_ROOT) with stand-ins for curl, dpkg, dpkg-deb and systemctl. NOT a real server. Proves the connector
// package is installed only when its sha256 matches the one the owner copied from Cloudflare's release page, and that a version can be pinned.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbtunnel-')), R = path.join(tmp, 'root'), BIN = path.join(tmp, 'bin');
const write = (p, s, mode) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, { mode }); };
const DEB = crypto.randomBytes(1200000), SHA = crypto.createHash('sha256').update(DEB).digest('hex');
write(path.join(tmp, 'fake.deb'), DEB);
const stub = (n, body) => write(path.join(BIN, n), '#!/bin/bash\n' + body + '\n', 0o755);
stub('curl', `echo "curl $*" >> ${tmp}/calls.log\nout=""; while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done\ncp ${tmp}/fake.deb "$out"`);
stub('dpkg-deb', 'exit 0');
stub('dpkg', `if [ "$1" = --print-architecture ]; then echo amd64; exit 0; fi\necho "dpkg $*" >> ${tmp}/calls.log`);
stub('systemctl', `echo "systemctl $*" >> ${tmp}/calls.log`);
write(path.join(R, 'etc/caddy/Caddyfile'), '1-2-3-4.sslip.io {\n}\n'); fs.mkdirSync(path.join(R, 'var/tmp'), { recursive: true }); fs.mkdirSync(path.join(R, 'usr/local/bin'), { recursive: true }); fs.mkdirSync(path.join(R, 'etc/systemd/system'), { recursive: true });
const run = (args = [], env = {}) => { fs.writeFileSync(path.join(tmp, 'calls.log'), ''); return spawnSync('bash', [path.join(ROOT, 'tunnel.sh'), ...args], { env: Object.assign({}, process.env, { PATH: BIN + ':' + process.env.PATH, SMOKEBOX_TUNNEL_ROOT: R }, env), encoding: 'utf8', timeout: 60000 }); };
const calls = () => fs.readFileSync(path.join(tmp, 'calls.log'), 'utf8');

test('parses', () => { assert.equal(spawnSync('bash', ['-n', path.join(ROOT, 'tunnel.sh')]).status, 0); });

test('without a checksum nothing is installed: it prints the download\'s sha256 and where to compare it, and stops', () => {
  const r = run(); assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(SHA), 'the checksum of what was downloaded is shown'); assert.match(r.stdout, /github\.com\/cloudflare\/cloudflared\/releases/);
  assert.ok(!/dpkg -i/.test(calls()), 'the package was not installed'); assert.ok(!fs.existsSync(path.join(R, 'etc/systemd/system/smokebox-tunnel.service')));
});

test('a wrong checksum stops it with nothing installed', () => {
  const r = run([], { SMOKEBOX_CLOUDFLARED_SHA256: 'a'.repeat(64) }); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr + r.stdout, /does not match/);
  assert.ok(!/dpkg -i/.test(calls()));
});

test('the right checksum installs the package and the service', () => {
  const r = run([SHA]); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(calls(), /dpkg -i /); assert.ok(fs.existsSync(path.join(R, 'etc/systemd/system/smokebox-tunnel.service')));
});

test('a version can be pinned: the download address names it', () => {
  run([SHA], { SMOKEBOX_CLOUDFLARED_VERSION: '2025.1.2' }); assert.match(calls(), /releases\/download\/2025\.1\.2\/cloudflared-linux-amd64\.deb/);
  const r = run([SHA], { SMOKEBOX_CLOUDFLARED_VERSION: '../evil' }); assert.notEqual(r.status, 0); assert.ok(!/dpkg -i/.test(calls()));
});
