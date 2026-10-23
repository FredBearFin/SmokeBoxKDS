// Helpers for the connected-mode (read-only follower) proofs: a real hub process on a free port with a temp data folder, a tiny event-stream
// reader and a feature check. Used by test/connected-hub.test.mjs (Node) and test/connected-e2e.mjs (Playwright).
//
// FEATURE CHECK: the follower is built on its own track (hub client, follower screen, settings). Until that code is in this tree the browser
// proofs print a clear SKIP line and exit 0; the hub-level proofs run today and fail where the hub still has a known gap.
// ADAPTER: how a page is told to lead or follow is not fixed yet. The two URL templates below can be changed with environment variables and
// are the ONLY place to edit once the real names are known: SMOKEBOX_LEADER_URL and SMOKEBOX_FOLLOWER_URL, with {hub} for the hub address.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Stage 1 has no tablet that writes through the hub, so the "leader" is plain HTTP posts of actions (httpLeader below), as a cooking tablet will send them.
// A follower page is the hub's own page opened with ?follow (and &code=... when the hub has an access code).
export const followerUrl = (hub, code) => (process.env.SMOKEBOX_FOLLOWER_URL || '{hub}/?follow').replaceAll('{hub}', hub) + (code ? (process.env.SMOKEBOX_FOLLOWER_URL ? '' : '&code=' + encodeURIComponent(code)) : '');

/** True when the follower code is in this source tree (looks for the word in the store, util and boot files and the shell). */
export function followerBuilt() {
  const has = (f, re) => { const file = path.join(ROOT, 'src/js', f); return fs.existsSync(file) && re.test(fs.readFileSync(file, 'utf8')); };
  return has('30-store.js', /function initFollower/) && has('70-floor-board.js', /SB\.followMode/) && /\/follow/.test(fs.readFileSync(path.join(ROOT, 'server/server.mjs'), 'utf8'));
}
export const SKIP_MESSAGE = 'SKIP: the read-only follower is not in this source tree yet (initFollower, the follower screen or the /follow route of the hub is missing). Merge night/a5-c1, night/a1-c1 and night/a2-c1, then run this again.';

/** Starts server/server.mjs as a child process (so it can be stopped hard, like a crash). Returns { port, origin, dir, file, stop(signal), restart(), log() }. */
export async function startHub(opts = {}) {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'sbconn-'));
  const file = path.join(dir, 'state.json');
  let child = null, out = '', port = 0;
  async function launch() {
    out = ''; const prev = port; port = 0;
    child = spawn(process.execPath, [path.join(ROOT, 'server/server.mjs')], { env: Object.assign({}, process.env, { PORT: String(opts.port || prev || 0), HOST: '127.0.0.1', SMOKEBOX_DATA: file, SMOKEBOX_STARTER: opts.starter === false ? '0' : '1', SMOKEBOX_TZ: 'America/New_York' }, opts.tokens ? { SMOKEBOX_REQUIRE_TOKENS: '1' } : {}, opts.env || {}) });
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
    for (let i = 0; i < 150; i++) { const m = /127\.0\.0\.1:(\d+)/.exec(out); if (m && Number(m[1]) > 0) { port = Number(m[1]); break; } await sleep(40); }
    if (!port) throw new Error('the hub did not start: ' + out);
    hub.port = port; hub.origin = 'http://127.0.0.1:' + port; hub.pid = child.pid;
  }
  const hub = {
    dir, file, port: 0, origin: '',
    log: () => out,
    // Stops the hub. signal SIGTERM lets it save (a clean stop); SIGKILL is a crash with no chance to write.
    stop: (signal = 'SIGTERM') => new Promise((resolve) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
      const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) { /* gone */ } }, 3000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
      child.kill(signal);
    }),
    restart: async (signal = 'SIGTERM') => { await hub.stop(signal); await launch(); return hub; },
  };
  await launch();
  return hub;
}

/** POST /action as a same-origin page would. Returns { status, body }. */
export function postAction(origin, body, headers = {}) {
  const u = new URL(origin);
  return new Promise((resolve) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: u.hostname, port: u.port, path: '/action', method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers) }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) { /* not json */ } resolve({ status: res.statusCode, body: j, text: s }); });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
    req.end(data);
  });
}

/** An event-stream reader (a Node follower): keeps the last state and the change number and counts messages. */
export function stream(origin, { since, path: p = '/events', headers } = {}) {
  const u = new URL(origin);
  const s = { events: [], state: null, seq: null, status: 0, closed: false };
  s.req = http.get({ host: u.hostname, port: u.port, path: p + (since == null ? '' : '?since=' + since), headers }, (res) => {
    s.status = res.statusCode;
    let buf = ''; res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
        if (!ev || !da) continue;
        let data; try { data = JSON.parse(da[1]); } catch (e) { continue; }
        s.events.push({ event: ev[1], data });
        if (ev[1] === 'snapshot' || ev[1] === 'state') { s.state = data.state; s.seq = data.seq; } else if (data && typeof data.seq === 'number') s.seq = data.seq;
      }
    });
    res.on('end', () => { s.closed = true; });
  });
  s.req.on('error', () => { s.closed = true; });
  s.stop = () => s.req.destroy();
  return s;
}
export async function until(fn, what, ms = 4000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(25); } throw new Error('timed out waiting for ' + what); }

/** A leader that posts actions to the hub with an opId each, like a cooking tablet: act(type, payload) -> the hub's reply body. */
export function httpLeader(origin, name = 'leader') {
  let n = 0;
  return { async act(type, payload, extra) { const r = await postAction(origin, Object.assign({ type, payload, clientId: name, opId: name + ':' + (++n) }, extra || {})); return r.body || { report: 'http' + r.status }; }, count: () => n };
}

/** A TCP relay in front of a hub that can cut every open connection and refuse new ones (a Wi-Fi drop), then let them through again. Browser offline switches do not stop a stream that is already open. */
export async function startRelay(targetPort) {
  const net = await import('node:net');
  const socks = new Set(); let cut = false;
  const srv = net.createServer((c) => {
    if (cut) { c.destroy(); return; }
    const u = net.connect(targetPort, '127.0.0.1'); socks.add(c); socks.add(u);
    c.pipe(u); u.pipe(c);
    const end = () => { c.destroy(); u.destroy(); socks.delete(c); socks.delete(u); };
    c.on('error', end); u.on('error', end); c.on('close', end); u.on('close', end);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  return { port, origin: 'http://127.0.0.1:' + port, cut: () => { cut = true; for (const s of socks) s.destroy(); }, heal: () => { cut = false; }, close: () => { cut = true; for (const s of socks) s.destroy(); srv.close(); } };
}

/** Runs the hub's own admin command on this computer (node server/server.mjs admin ...), as the owner of the hub would. Resolves { code, out, err }. */
export function adminCli(hub, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server/server.mjs'), 'admin', ...args, '--port', String(hub.port), '--data', hub.file], { encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}
/** A one-time 6-character pairing code from the hub (owner true: the screen that uses it can make codes and remove screens). Throws if refused. */
export function pairingCode(hub, { owner = false } = {}) {
  const r = adminCli(hub, ['pair', ...(owner ? ['--owner'] : [])]);
  const m = /Pairing code: ([A-Z2-9]{6})/.exec(r.out);
  if (!m) throw new Error('no pairing code: ' + (r.err || r.out));
  return m[1];
}
/** Every screen the hub knows: [{ id, name, owner, lastSeen?, revokedAt? }] (through the admin list command). */
export function listScreens(hub) {
  const key = fs.readFileSync(hub.file + '.admin', 'utf8').trim();
  return new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port: hub.port, path: '/admin/screens', headers: { authorization: 'Bearer ' + key } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { try { resolve(JSON.parse(t).screens); } catch (e) { reject(e); } }); }).on('error', reject); });
}
/** Removes one screen by id, as the owner would (node server/server.mjs admin revoke ID). */
export function revokeScreen(hub, id) { return adminCli(hub, ['revoke', id]); }
/** The hub's pairing answer for a code and a name, over HTTP as a screen would ask: { status, body }. */
export function pairOver(origin, code, name, headers = {}) { return postJson(origin, '/pair', { code, name }, headers); }
/** One JSON POST to any path: { status, body }. */
export function postJson(origin, p, body, headers = {}) {
  const u = new URL(origin), data = JSON.stringify(body);
  return new Promise((resolve) => {
    const r = http.request({ host: u.hostname, port: u.port, path: p, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-smokebox-client': '1' }, headers) }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, body: j, text: t }); }); });
    r.on('error', () => resolve({ status: 0, body: null })); r.write(data); r.end();
  });
}
