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
// A stand-in for the service. mode true: like the real hub (/health says {"ok":true}, the page answers). false: errors everywhere.
// 'old': a build too old to have /health (404) whose page answers. 'old-down': no /health and the page fails. 'garbage': /health answers 200 with
// something that is not the hub's answer. 'notok': /health answers 200 {"ok":false}.
async function withHealth(mode, fn) {
  const srv = http.createServer((req, res) => {
    const isHealth = (req.url || '').split('?')[0] === '/health';
    if (mode === true) { res.statusCode = 200; res.setHeader('content-type', isHealth ? 'application/json' : 'text/html'); res.end(isHealth ? '{"ok":true,"hubId":"t"}' : '<html></html>'); }
    else if (mode === 'old') { res.statusCode = isHealth ? 404 : 200; res.end(isHealth ? 'not found' : '<html></html>'); }
    else if (mode === 'old-down') { res.statusCode = isHealth ? 404 : 500; res.end('x'); }
    else if (mode === 'garbage') { res.statusCode = 200; res.end(isHealth ? '<html>captive portal</html>' : '<html></html>'); }
    else if (mode === 'notok') { res.statusCode = 200; res.end(isHealth ? '{"ok":false}' : '<html></html>'); }
    else { res.statusCode = 500; res.end('x'); }
  });
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
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/health', SMOKEBOX_SELF_DEST: self, SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
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
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/health', SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
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

/* ---- the real deploy download: what GitHub's branch archive contains (git archive honors the same .gitattributes export-ignore rules) ---- */

const haveGit = have('git') && fs.existsSync(path.join(ROOT, '.git'));
function realExport(tmp) {
  const tgz = path.join(tmp, 'real.tgz');
  const out = execFileSync('git', ['-C', ROOT, 'archive', '--worktree-attributes', '--format=tar.gz', '--prefix=SmokeBoxKDS-deploy/', 'HEAD'], { maxBuffer: 1 << 30 });
  fs.writeFileSync(tgz, out);
  return tgz;
}

test('the real deploy archive is small and holds exactly what the server needs (no tests, docs, tools or screenshots)', { skip: !haveGit }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbexp-'));
  const tgz = realExport(tmp);
  const size = fs.statSync(tgz).size;
  assert.ok(size < 10 * 1024 * 1024, 'the archive is ' + Math.round(size / 1e6) + ' MB; it should be a few MB at most');
  const names = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  for (const need of ['server/server.mjs', 'server/setup-server.sh', 'server/smokebox-update.sh', 'dist/smokebox.html', 'src/js/00-util.js', 'src/js/10-config.js', 'src/js/20-engine.js', 'go.sh', 'tunnel.sh']) assert.ok(names.includes('SmokeBoxKDS-deploy/' + need), 'missing ' + need);
  for (const bad of ['test/', 'docs/', 'tools/', 'ux-scripts/', 'reference/', '.github/', 'dist/integ.html', 'dist/qa.html']) assert.ok(!names.some((n) => n.startsWith('SmokeBoxKDS-deploy/' + bad)), 'should be left out: ' + bad);
});

test('the server starts from the extracted deploy archive and serves the page', { skip: !haveGit }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbexp-'));
  const tgz = realExport(tmp);
  execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
  const dir = path.join(tmp, 'SmokeBoxKDS-deploy');
  const child = spawn(process.execPath, [path.join(dir, 'server/server.mjs')], { env: Object.assign({}, process.env, { PORT: '0', HOST: '127.0.0.1' }) });
  let log = '';
  child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  try {
    let port = 0;
    for (let i = 0; i < 100 && !port; i++) { const m = /127\.0\.0\.1:(\d+)/.exec(log); if (m && Number(m[1]) > 0) port = Number(m[1]); else await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(port, 'the hub printed its address: ' + log);
    const body = await new Promise((resolve, reject) => http.get({ port, host: '127.0.0.1', path: '/' }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(c) })); }).on('error', reject));
    assert.equal(body.status, 200);
    assert.ok(body.buf.equals(fs.readFileSync(path.join(dir, 'dist/smokebox.html'))), 'the page served is dist/smokebox.html');
  } finally { child.kill(); }
});

test('the updater accepts the real (small) deploy archive with its default size limits', { skip: skip || !haveGit }, async () => {
  const t = setup('real');
  const tgz = realExport(t.tmp);
  await withHealth(true, async (port) => {
    const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/health', SMOKEBOX_SELF_DEST: path.join(t.tmp, 'self'), SMOKEBOX_LOCK: path.join(t.tmp, 'lock') }, { SMOKEBOX_MIN_BYTES: '100000' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  assert.ok(fs.existsSync(path.join(t.prefix, 'server/server.mjs')) && marker(t.prefix) === null, 'the new build replaced the old one');
  assert.equal(marker(t.prefix + '.old'), 'OLD');
});

// The post-swap health check itself: what it accepts and what makes it put the old build back.
for (const [mode, label, expectPass] of [[true, 'the hub answers {"ok":true} at /health', true], ['old', 'a build too old to have /health (404) whose page answers', true], [false, '/health fails (500)', false], ['old-down', '/health is 404 and the page fails too', false], ['garbage', '/health answers 200 with something that is not the hub (a captive-portal page)', false], ['notok', '/health answers {"ok":false}', false]]) {
  test('health check: ' + label + (expectPass ? ' -> the new build stays' : ' -> the old build is put back'), { skip }, async () => {
    const t = setup('h-' + String(mode)); const tgz = tarball(t.tmp, 'h', (d) => makeTree(d, 'NEW'));
    await withHealth(mode, async (port) => {
      const r = await run({ SMOKEBOX_PREFIX: t.prefix, SMOKEBOX_UPDATE_URL: 'file://' + tgz, SMOKEBOX_SYSTEMCTL: t.fakeSystemctl, SMOKEBOX_HEALTH_URL: 'http://127.0.0.1:' + port + '/health', SMOKEBOX_SELF_DEST: path.join(t.tmp, 'self'), SMOKEBOX_LOCK: path.join(t.tmp, 'lock') });
      if (expectPass) { assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(marker(t.prefix), 'NEW'); }
      else { assert.notEqual(r.status, 0); assert.match(r.stdout, /putting the previous version back/); assert.equal(marker(t.prefix), 'OLD'); }
    });
  });
}
