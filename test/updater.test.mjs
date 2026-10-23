// Tests for server/smokebox-update.sh: the nightly updater must refuse bad downloads, keep the running version when anything is wrong,
// and put the old build back when the new one does not answer. Runs the real script against a temp folder with a fake systemctl.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'server/smokebox-update.sh');
const have = (cmd) => spawnSync('bash', ['-c', 'command -v ' + cmd]).status === 0;
const skip = !have('flock') || !have('tar') || !have('curl') ? 'needs flock, tar and curl' : false;

// Builds a folder like a release: marker file says which version it is.
function makeTree(dir, marker, { server = 'console.log("hi");\n', html = 'x'.repeat(200000), engine = '//e\n', extra } = {}) {
  fs.mkdirSync(path.join(dir, 'server'), { recursive: true }); fs.mkdirSync(path.join(dir, 'dist'), { recursive: true }); fs.mkdirSync(path.join(dir, 'src/js'), { recursive: true });
  if (server !== null) fs.writeFileSync(path.join(dir, 'server/server.mjs'), server);
  fs.writeFileSync(path.join(dir, 'server/smokebox-update.sh'), '#!/bin/bash\n# marker ' + marker + '\n');
  fs.writeFileSync(path.join(dir, 'dist/smokebox.html'), html);
  fs.writeFileSync(path.join(dir, 'src/js/20-engine.js'), engine);
  fs.writeFileSync(path.join(dir, 'MARKER'), marker);
  if (extra) extra(dir);
}
function tarball(tmp, name, mk) {
  const src = path.join(tmp, name + '-src'); fs.mkdirSync(path.join(src, 'Repo-deploy'), { recursive: true });
  mk(path.join(src, 'Repo-deploy'));
  const out = path.join(tmp, name + '.tgz');
  execFileSync('tar', ['-czf', out, '-C', src, 'Repo-deploy']);
  return out;
}
function setup(label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbupd-' + label + '-'));
  const prefix = path.join(tmp, 'opt-smokebox');
  makeTree(prefix, 'OLD');
  const fakeSystemctl = path.join(tmp, 'systemctl'); const log = path.join(tmp, 'systemctl.log');
  fs.writeFileSync(fakeSystemctl, '#!/bin/bash\necho "$@" >> ' + log + '\n');
  fs.chmodSync(fakeSystemctl, 0o755);
  return { tmp, prefix, log, fakeSystemctl };
}
async function withHealth(ok, fn) {
  const srv = http.createServer((req, res) => { res.statusCode = ok ? 200 : 500; res.end('x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try { return await fn(srv.address().port); } finally { srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); }
}
// Runs the script without blocking this process (the health check talks to a server in this very process).
function run(env, extra = {}) {
  return new Promise((resolve) => {
    const p = spawn('bash', [SCRIPT], { env: Object.assign({}, process.env, { SMOKEBOX_HEALTH_TRIES: '3', SMOKEBOX_MIN_BYTES: '300' }, env, extra) });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d)); p.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}
const marker = (prefix) => (fs.existsSync(path.join(prefix, 'MARKER')) ? fs.readFileSync(path.join(prefix, 'MARKER'), 'utf8') : null);

test('a good update swaps the build, restarts the service, keeps the old one and refreshes the updater', { skip }, async () => {
  const t = setup('good');
  const tgz = tarball(t.tmp, 'good', (d) => makeTree(d, 'NEW'));
  const self = path.join(t.tmp, 'bin-smokebox-update');
  await withHealth(true, async (port) => {
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/', SMOKEBOX_SELF_DEST: self, SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  assert.equal(marker(t.prefix), 'NEW');
  assert.equal(marker(t.prefix + '.old'), 'OLD');
  assert.match(fs.readFileSync(t.log, 'utf8'), /restart smokebox/);
  assert.match(fs.readFileSync(self, 'utf8'), /marker NEW/, 'the updater copied itself from the new build');
});

for (const [name, mk, why] of [
  ['an empty download', null, 'empty'],
  ['a tiny archive (an error page)', (d) => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'a'), 'x'); }, 'bytes'],
  ['a build with no server file', (d) => makeTree(d, 'NEW', { server: null }), 'no server/server.mjs'],
  ['a build whose server file does not parse', (d) => makeTree(d, 'NEW', { server: 'this is ( not javascript' }), 'does not parse'],
  ['a build with a tiny page', (d) => makeTree(d, 'NEW', { html: 'x' }), 'page is only'],
  ['an archive with a symbolic link', (d) => makeTree(d, 'NEW', { extra: (dir) => fs.symlinkSync('/etc/passwd', path.join(dir, 'link')) }), 'links'],
]) {
  test('refuses ' + name + ' and keeps the running version', { skip }, async () => {
    const t = setup('bad');
    let tgz;
    if (mk === null) { tgz = path.join(t.tmp, 'empty.tgz'); fs.writeFileSync(tgz, ''); } else tgz = tarball(t.tmp, 'bad', mk);
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_LOCK: path.join(t.tmp, 'lock'), SMOKEBOX_MIN_BYTES: name.includes('tiny archive') ? '100000' : '300' });
    assert.notEqual(r.status, 0, 'must fail: ' + r.stdout);
    assert.equal(marker(t.prefix), 'OLD', 'running version kept (' + why + ')');
    assert.ok(!fs.existsSync(t.log), 'the service was not restarted');
    assert.ok(!fs.existsSync(t.prefix + '.new'), 'no half-unpacked folder is left behind');
  });
}

test('refuses an archive with a ".." path (written with a raw tar header, as an attacker would)', { skip }, async () => {
  const t = setup('dots');
  const src = path.join(t.tmp, 'src'); fs.mkdirSync(path.join(src, 'Repo-deploy'), { recursive: true }); makeTree(path.join(src, 'Repo-deploy'), 'NEW');
  const tgz = path.join(t.tmp, 'dots.tgz');
  // --transform puts a ../ in front of one member's name
  execFileSync('tar', ['-czf', tgz, '-C', src, '--transform', 's,^Repo-deploy/MARKER$,Repo-deploy/../MARKER,', 'Repo-deploy']);
  const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.equal(marker(t.prefix), 'OLD');
  assert.ok(!fs.existsSync(path.join(t.tmp, 'MARKER')), 'nothing was written outside the folder');
});

test('a new build that does not answer is rolled back to the old build and the service is restarted again', { skip }, async () => {
  const t = setup('roll');
  const tgz = tarball(t.tmp, 'roll', (d) => makeTree(d, 'NEW'));
  await withHealth(false, async (port) => {
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/', SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /putting the previous version back/);
  });
  assert.equal(marker(t.prefix), 'OLD', 'the old build is back');
  assert.equal(fs.readFileSync(t.log, 'utf8').trim().split('\n').length, 2, 'restarted for the new build and again after the rollback');
});

test('a second update while one is running does nothing', { skip }, async () => {
  const t = setup('lock');
  const lock = path.join(t.tmp, 'lock');
  const tgz = tarball(t.tmp, 'lock', (d) => makeTree(d, 'NEW'));
  const holder = spawnSync('bash', ['-c', `exec 9>${lock}; flock -n 9; SMOKEBOX_PREFIX=${t.prefix} SMOKEBOX_UPDATE_URL=file://${tgz} SMOKEBOX_SYSTEMCTL=${t.fakeSystemctl} SMOKEBOX_LOCK=${lock} bash ${SCRIPT} 9>&-`], { encoding: 'utf8', timeout: 30000, env: Object.assign({}, process.env, { SMOKEBOX_MIN_BYTES: '300' }) });
  // The script opens the same lock file itself; while the outer shell holds it, the inner run must exit 0 without changing anything.
  assert.equal(holder.status, 0, holder.stdout + holder.stderr);
  assert.match(holder.stdout, /another update is running/);
  assert.equal(marker(t.prefix), 'OLD');
});

test('the install scripts parse and refuse short passwords', { skip: !have('bash') }, () => {
  for (const f of ['go.sh', 'server/setup-server.sh', 'tunnel.sh', 'server/smokebox-update.sh']) assert.equal(spawnSync('bash', ['-n', path.join(ROOT, f)]).status, 0, f + ' parses');
  // Runs as non-root: setup-server stops at the password check or the root check, never installing anything.
  const r = spawnSync('bash', [path.join(ROOT, 'server/setup-server.sh'), 'America/New_York', 'freddy', 'short'], { encoding: 'utf8', timeout: 20000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /at least 8 characters/);
});
