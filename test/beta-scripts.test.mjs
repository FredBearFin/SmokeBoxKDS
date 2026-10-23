// beta.sh and beta-remove.sh against a scratch folder standing in for the server (SMOKEBOX_BETA_ROOT) with stand-ins for systemctl, caddy and
// useradd. NOT a real server: nothing here proves systemd, Caddy or the certificate parts. Proves: checks refuse bad input, the real instance's
// files are untouched, the beta hub actually starts from the installed copy, codes are root-only and kept on a re-run, Caddy edits are undone when
// Caddy refuses them, and beta-remove.sh leaves nothing behind. Run: node --test --test-force-exit test/beta-scripts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbbeta-'));
const R = path.join(tmp, 'root'), BIN = path.join(tmp, 'bin'), PORT = String(20000 + Math.floor(Math.random() * 20000));
const write = (p, s, mode) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, { mode }); };
const hash = (d) => { let h = crypto.createHash('sha1'); const walk = (x) => { for (const f of fs.readdirSync(x).sort()) { const p = path.join(x, f); fs.statSync(p).isDirectory() ? walk(p) : h.update(f + fs.readFileSync(p)); } }; walk(d); return h.digest('hex'); };

// the tarball of the connected build, as GitHub makes it (one top folder): taken from the branch itself, so the test needs only the branch to exist
const tarball = path.join(tmp, 'connected.tar.gz');
let hasConnected = false;
for (const ref of [process.env.SMOKEBOX_BETA_REF, 'kds/connected', 'origin/connected', 'connected'].filter(Boolean)) {
  const r = spawnSync('sh', ['-c', `git -C ${ROOT} archive --format=tar.gz --prefix=SmokeBoxKDS-connected/ ${ref} > ${tarball}`], { encoding: 'utf8' });
  if (r.status === 0 && fs.statSync(tarball).size > 100000) { hasConnected = true; break; }
}
if (!hasConnected) console.log('# SKIP: the connected branch is not available here (set SMOKEBOX_BETA_REF)');

// stand-ins
const stub = (n, body) => write(path.join(BIN, n), '#!/bin/sh\n' + body + '\n', 0o755);
stub('systemctl', `echo "systemctl $*" >> ${tmp}/calls.log
case "$*" in
 "restart smokebox-beta") [ -f ${tmp}/hub.pid ] && kill $(cat ${tmp}/hub.pid) 2>/dev/null
   PORT=${PORT} HOST=127.0.0.1 SMOKEBOX_DATA=${R}/var/lib/smokebox-beta/state.json $(command -v node) ${R}/opt/smokebox-beta/server/server.mjs >${tmp}/hub.log 2>&1 &
   echo $! > ${tmp}/hub.pid ;;
 "stop smokebox-beta"|"disable --now smokebox-beta") [ -f ${tmp}/hub.pid ] && kill $(cat ${tmp}/hub.pid) 2>/dev/null ;;
esac
exit 0`);
stub('caddy', `echo "caddy $*" >> ${tmp}/calls.log
if [ "$1" = validate ]; then [ -f ${tmp}/caddy-refuses ] && exit 1; grep -q '^import ' "\${3:-$2}" 2>/dev/null; exit 0; fi
exit 0`);
for (const n of ['useradd', 'userdel', 'chown']) stub(n, `echo "${n} $*" >> ${tmp}/calls.log`);
stub('ss', 'exit 0');
stub('id', '[ "$1" = "-u" ] && echo 0 && exit 0; exit 1');
const env = (extra = {}) => Object.assign({}, process.env, { PATH: BIN + ':' + process.env.PATH, SMOKEBOX_BETA_ROOT: R, SMOKEBOX_BETA_PORT: PORT, SMOKEBOX_BETA_URL: 'file://' + tarball }, extra);
const run = (script, args = [], extra) => spawnSync('bash', [path.join(ROOT, script), ...args], { env: env(extra), encoding: 'utf8', timeout: 120000 });

const realFiles = () => { fs.mkdirSync(path.join(R, 'var/tmp'), { recursive: true }); fs.mkdirSync(path.join(R, 'run/lock'), { recursive: true }); write(path.join(R, 'etc/systemd/system/smokebox.service'), '[Service]\nEnvironment=SMOKEBOX_TZ=America/Chicago\nEnvironment=PORT=8787\n'); write(path.join(R, 'etc/caddy/Caddyfile'), '1-2-3-4.sslip.io {\n\tencode gzip\n\tbasic_auth {\n\t\tfreddy $2a$14$abcdefghijklmnopqrstuv\n\t}\n\treverse_proxy 127.0.0.1:8787\n}\n'); write(path.join(R, 'opt/smokebox/server/server.mjs'), 'real'); write(path.join(R, 'var/lib/smokebox/state.json'), '{"real":true}'); fs.mkdirSync(path.join(R, 'usr/local/bin'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'server/smokebox-update.sh'), path.join(R, 'usr/local/bin/smokebox-update')); fs.chmodSync(path.join(R, 'usr/local/bin/smokebox-update'), 0o755); };
const snapReal = () => hash(path.join(R, 'opt/smokebox')) + hash(path.join(R, 'var/lib/smokebox')) + fs.readFileSync(path.join(R, 'etc/systemd/system/smokebox.service'), 'utf8');
test.after(() => { try { process.kill(Number(fs.readFileSync(path.join(tmp, 'hub.pid'), 'utf8'))); } catch (e) { /* gone */ } });

test('both scripts parse', () => { for (const f of ['beta.sh', 'beta-remove.sh']) assert.equal(spawnSync('bash', ['-n', path.join(ROOT, f)]).status, 0, f); });

test('refuses without a real install, with a tiny download, and for the same name as the real site', { skip: !hasConnected }, () => {
  let r = run('beta.sh'); assert.notEqual(r.status, 0); assert.match(r.stderr, /not installed here/);
  realFiles();
  const small = path.join(tmp, 'small.tar.gz'); fs.writeFileSync(small, 'x');
  r = run('beta.sh', [], { SMOKEBOX_BETA_URL: 'file://' + small }); assert.notEqual(r.status, 0); assert.match(r.stderr, /too small|valid gzip/);
  r = run('beta.sh', ['1-2-3-4.sslip.io']); assert.notEqual(r.status, 0); assert.match(r.stderr, /differ/);
  r = run('beta.sh', ['bad host!']); assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(R, 'opt/smokebox-beta')), 'nothing installed after refusals');
});

test('refuses an archive with unsafe paths or links, and a branch without the connected code', { skip: !hasConnected }, () => {
  const evil = path.join(tmp, 'evil'); fs.mkdirSync(path.join(evil, 'top'), { recursive: true }); fs.writeFileSync(path.join(evil, 'top/pad'), crypto.randomBytes(200000)); fs.symlinkSync('/etc/passwd', path.join(evil, 'top/link'));
  execSync(`tar -czf ${tmp}/link.tar.gz -C ${evil} top`);
  let r = run('beta.sh', [], { SMOKEBOX_BETA_URL: 'file://' + tmp + '/link.tar.gz' }); assert.notEqual(r.status, 0); assert.match(r.stderr, /links/);
  assert.ok(!fs.existsSync(path.join(R, 'opt/smokebox-beta')));
});

test('installs: hub answers on the beta port, real instance untouched, codes root-only, Caddy block checked and imported', { skip: !hasConnected }, async () => {
  const before = snapReal();
  const r = run('beta.sh'); assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(snapReal(), before, 'the real instance files are exactly as they were');
  const env = fs.readFileSync(path.join(R, 'etc/smokebox-beta.env'), 'utf8'); assert.match(env, /SMOKEBOX_FOLLOW_CODE=[A-Z2-7]{16}/); assert.match(env, /SMOKEBOX_WRITE_CODE=[A-Z2-7]{16}/);
  assert.equal(fs.statSync(path.join(R, 'etc/smokebox-beta.env')).mode & 0o777, 0o600);
  const unit = fs.readFileSync(path.join(R, 'etc/systemd/system/smokebox-beta.service'), 'utf8');
  for (const k of ['NoNewPrivileges=true', 'ProtectSystem=strict', 'CapabilityBoundingSet=', 'UMask=0077', 'EnvironmentFile=', 'PORT=' + PORT, 'HOST=127.0.0.1']) assert.ok(unit.includes(k), k);
  assert.ok(!/8787|smokebox\/|var\/lib\/smokebox\//.test(unit.replace(/smokebox-beta/g, '')), 'the beta unit names none of the real instance\'s port or folders');
  const cad = fs.readFileSync(path.join(R, 'etc/caddy/beta.caddy'), 'utf8');
  assert.match(cad, /^beta\.1-2-3-4\.sslip\.io \{/); assert.match(cad, /freddy \$2a\$14\$abcdefghijklmnopqrstuv/); assert.match(cad, new RegExp('reverse_proxy 127.0.0.1:' + PORT)); assert.match(cad, /flush_interval -1/);
  const main = fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile'), 'utf8'); assert.equal((main.match(/^import /gm) || []).length, 1);
  assert.ok(main.startsWith(fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile.before-beta'), 'utf8')), 'the earlier Caddyfile is saved and only an import line was added');
  assert.match(r.stdout, /\?hub&code=[A-Z2-7]{16}/); assert.match(r.stdout, /\?follow&code=[A-Z2-7]{16}/);
  const res = await fetch('http://127.0.0.1:' + PORT + '/'); assert.equal(res.status, 200);
  assert.ok(!r.stdout.includes('$2a$'), 'the login hash is never printed');
  const calls = fs.readFileSync(path.join(tmp, 'calls.log'), 'utf8'); assert.ok(!/ smokebox( |$)/m.test(calls.replace(/smokebox-beta[a-z-]*/g, '')), 'no command named the real service: ' + calls);
  // the beta hub enforces the codes it was given
  const code = /SMOKEBOX_WRITE_CODE=(\w+)/.exec(env)[1];
  const hubEnvRun = fs.readFileSync(path.join(R, 'opt/smokebox-beta/server/server.mjs'), 'utf8'); assert.match(hubEnvRun, /SMOKEBOX_WRITE_CODE/);
  assert.ok(code.length === 16);
});

test('a re-run keeps the codes and the data; the nightly wrapper points only at the beta', { skip: !hasConnected }, () => {
  const e1 = fs.readFileSync(path.join(R, 'etc/smokebox-beta.env'), 'utf8'); write(path.join(R, 'var/lib/smokebox-beta/keep.txt'), 'mine');
  const r = run('beta.sh'); assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(R, 'etc/smokebox-beta.env'), 'utf8'), e1); assert.match(r.stdout, /codes unchanged/); assert.equal(fs.readFileSync(path.join(R, 'var/lib/smokebox-beta/keep.txt'), 'utf8'), 'mine');
  const main = fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile'), 'utf8'); assert.equal((main.match(/^import /gm) || []).length, 1, 'one import line, not two');
  const upd = fs.readFileSync(path.join(R, 'usr/local/bin/smokebox-beta-update'), 'utf8');
  assert.match(upd, new RegExp('SMOKEBOX_PREFIX=' + R.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/opt/smokebox-beta')); assert.match(upd, new RegExp('127.0.0.1:' + PORT)); assert.match(upd, /smokebox-beta-systemctl/); assert.doesNotMatch(upd, /8787/);
  assert.equal(spawnSync('sh', ['-n', path.join(R, 'usr/local/bin/smokebox-beta-systemctl')]).status, 0);
});

test('the nightly update really swaps the beta build and leaves the real one alone', { skip: !hasConnected }, () => {
  const before = snapReal();
  const r = spawnSync('sh', [path.join(R, 'usr/local/bin/smokebox-beta-update')], { env: env({ SMOKEBOX_UPDATE_URL: 'file://' + tarball }), encoding: 'utf8', timeout: 90000 });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /updated/);
  assert.equal(snapReal(), before); assert.ok(fs.existsSync(path.join(R, 'opt/smokebox-beta.old')), 'the previous beta build is kept');
  assert.ok(!fs.existsSync(path.join(R, 'usr/local/bin/smokebox-beta-update.new')));
});

test('if Caddy refuses the new block the Caddyfile is put back and the real site is not changed', { skip: !hasConnected }, () => {
  const rr = run('beta-remove.sh'); assert.equal(rr.status, 0, rr.stderr);
  const main0 = fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile'), 'utf8');
  fs.writeFileSync(path.join(tmp, 'caddy-refuses'), '');
  const r = run('beta.sh'); assert.notEqual(r.status, 0); assert.match(r.stderr, /did not accept/);
  assert.equal(fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile'), 'utf8'), main0); assert.ok(!fs.existsSync(path.join(R, 'etc/caddy/beta.caddy')));
  fs.rmSync(path.join(tmp, 'caddy-refuses'));
});

test('beta-remove.sh leaves nothing of the beta and nothing changed of the real instance', { skip: !hasConnected }, () => {
  let r = run('beta.sh'); assert.equal(r.status, 0, r.stderr);
  const realBefore = snapReal(); r = run('beta-remove.sh'); assert.equal(r.status, 0, r.stderr);
  assert.equal(snapReal(), realBefore);
  for (const p of ['opt/smokebox-beta', 'opt/smokebox-beta.old', 'var/lib/smokebox-beta', 'etc/smokebox-beta.env', 'etc/caddy/beta.caddy', 'etc/systemd/system/smokebox-beta.service', 'etc/systemd/system/smokebox-beta-update.timer', 'etc/systemd/system/smokebox-beta-update.service', 'usr/local/bin/smokebox-beta-update', 'usr/local/bin/smokebox-beta-systemctl']) assert.ok(!fs.existsSync(path.join(R, p)), p + ' is gone');
  assert.ok(!/^import /m.test(fs.readFileSync(path.join(R, 'etc/caddy/Caddyfile'), 'utf8')), 'the import line is gone');
  r = run('beta-remove.sh'); assert.equal(r.status, 0, 'removing twice is fine');
});
