// The beta next to the real instance behind one reverse proxy stand-in (a small Node program playing Caddy: it picks the hub by host name, or by a
// path prefix it strips). Proves, with the connected branch's page: (1) at its own host name the beta page works for a writing tablet and a
// follower, the real instance on the other name is unaffected and keeps its own data; (2) under a PATH prefix the page only works when the
// screen's address names the prefix explicitly (a bare ?hub asks for /follow at the site root). NOT a real server, real Caddy or real TLS.
// Run: SMOKEBOX_TOOLS=$(npm root -g) node test/beta-proxy.e2e.mjs   (about 40 s; needs git ref kds/connected, or SMOKEBOX_BETA_REF)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toolRequire } from '../tools/_deps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const check = (n, ok, d) => { if (!ok) fail++; console.log((ok ? '  ok    ' : '  FAIL  ') + n + (ok ? '' : ' -> ' + String(JSON.stringify(d)).slice(0, 300))); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbproxy-')), conn = path.join(tmp, 'conn'); fs.mkdirSync(conn);
let ref = ''; for (const r of [process.env.SMOKEBOX_BETA_REF, 'kds/connected', 'origin/connected', 'connected'].filter(Boolean)) { if (spawnSync('sh', ['-c', `git -C ${ROOT} archive ${r} | tar -x -C ${conn}`]).status === 0 && fs.existsSync(path.join(conn, 'server/server.mjs'))) { ref = r; break; } }
if (!ref) { console.log('SKIP: the connected branch is not available (set SMOKEBOX_BETA_REF)'); process.exit(0); }
const kids = [];
function hub(dir, port, env) { const c = spawn(process.execPath, [path.join(dir, 'server/server.mjs')], { env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', SMOKEBOX_DATA: path.join(tmp, 'data-' + port, 'state.json') }, env) }); fs.mkdirSync(path.join(tmp, 'data-' + port), { recursive: true }); kids.push(c); return c; }
const MAIN = 28787, BETA = 28788, PROXY = 28800;
const KEY = 'k'.repeat(40); const TRUST = 28801, NOTRUST = 28802;
hub(ROOT, MAIN, { SMOKEBOX_STARTER: '0', SMOKEBOX_ALLOWED_HOSTS: 'main.test' }); hub(ROOT, TRUST, { SMOKEBOX_TRUST_PROXY: '1', SMOKEBOX_ADMIN_KEY: KEY, SMOKEBOX_REQUIRE_TOKENS: '1' }); hub(ROOT, NOTRUST, { SMOKEBOX_ADMIN_KEY: KEY, SMOKEBOX_REQUIRE_TOKENS: '1' }); hub(conn, BETA, { SMOKEBOX_ALLOWED_HOSTS: 'beta.test,main.test', SMOKEBOX_STARTER: '1', SMOKEBOX_WRITE_CODE: 'WRITECODE12345', SMOKEBOX_FOLLOW_CODE: 'FOLLOWCODE12345' });
// the stand-in for Caddy: hosts main.test and beta.test, and the path /beta/ on main.test sent to the beta with the prefix removed; flush at once (no buffering)
const proxy = http.createServer((req, res) => {
  const host = String(req.headers.host || '').split(':')[0]; let target = MAIN, url = req.url;
  if (host === 'trust.test') target = TRUST; else if (host === 'notrust.test') target = NOTRUST; else if (host === 'beta.test') target = BETA; else if (/^\/beta(\/|\?|$)/.test(url)) { target = BETA; url = url.replace(/^\/beta/, '') || '/'; }
  const up = http.request({ host: '127.0.0.1', port: target, path: url, method: req.method, headers: Object.assign({}, req.headers, { 'x-forwarded-for': (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'] + ', ' : '') + (req.headers['x-test-client'] || '203.0.113.9') }) }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); res.flushHeaders(); });
  up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up); res.on('close', () => up.destroy());
});
await new Promise((r) => proxy.listen(PROXY, '127.0.0.1', r));
for (let i = 0; i < 100; i++) { try { const a = await fetch(`http://127.0.0.1:${MAIN}/`), b = await fetch(`http://127.0.0.1:${BETA}/`); if (a.ok && b.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
const { chromium } = toolRequire('playwright');
const browser = await chromium.launch({ args: ['--no-sandbox', `--host-resolver-rules=MAP main.test 127.0.0.1, MAP beta.test 127.0.0.1, MAP trust.test 127.0.0.1, MAP notrust.test 127.0.0.1`] });
async function open(url) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); await p.goto(url, { waitUntil: 'load' }); await p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 15000 }).catch(() => {}); p.ctx = ctx; return p; }
const status = (p) => p.evaluate(() => (/[?&]follow/.test(location.search) ? SB.store.followStatus() : SB.store.hubStatus()).state);
async function waitState(p, want, ms = 12000) { const e = Date.now() + ms; let s; while (Date.now() < e) { s = await status(p).catch(() => 'err'); if (s === want) return s; await sleep(200); } return s; }
try {
  console.log('\n# its own host name (what beta.sh sets up)');
  const T = await open(`http://beta.test:${PROXY}/?hub&code=WRITECODE12345`);
  check('a writing tablet at the beta name is connected through the proxy', (await waitState(T, 'connected')) === 'connected', await status(T));
  const m = await T.evaluate(() => SB.store.getState().menu[0].id);
  const dr = await T.evaluate((m) => { window.__r = []; SB.store.subscribeRefusals((x) => window.__r.push(x)); return SB.store.dispatch('createTicket', { customer: 'Beta only', items: [{ menuId: m }] }); }, m); await sleep(1500); console.log('  info  tap -> ' + dr + ' ' + JSON.stringify(await T.evaluate(() => [window.__r, SB.store.hubStatus()])).slice(0, 400));
  const F = await open(`http://beta.test:${PROXY}/?follow&code=FOLLOWCODE12345`);
  check('a follower at the beta name connects and shows the tablet\'s ticket', (await waitState(F, 'following')) === 'following' && await F.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Beta only')), [await status(F), await F.evaluate(() => JSON.stringify(SB.store.followStatus()) + SB.store.getState().tickets.length)]);
  const bad = await open(`http://beta.test:${PROXY}/?hub&code=nope`);
  check('a wrong code is refused with a message, not a board', await bad.evaluate(() => /could not join/i.test(document.body.innerText)), (await bad.evaluate(() => document.body.innerText)).slice(0, 120));
  const real = await open(`http://main.test:${PROXY}/`);
  check('the real instance on its own name has none of the beta\'s tickets and is a normal kitchen', await real.evaluate(() => SB.store.getState().tickets.length === 0 && !(SB.store.isHubClient && SB.store.isHubClient())));
  const r = await fetch(`http://main.test:${PROXY}/follow`).catch(() => null);
  check('the real instance does not offer the beta\'s follower stream', !r || r.status === 404, r && r.status);
  check('no page errors', [T, F, real].every((p) => p.errs.length === 0), [T, F, real].map((p) => p.errs));

  console.log('\n# two screens behind the proxy: separate wrong-code lockouts (SMOKEBOX_TRUST_PROXY=1, as beta.sh and setup-server.sh set it)');
  const call = (host, client, body, p = '/pair', headers = {}) => new Promise((resolve) => { const d = JSON.stringify(body); const r = http.request({ host: '127.0.0.1', port: PROXY, path: p, method: 'POST', headers: Object.assign({ host: host + ':' + PROXY, 'content-type': 'application/json', 'content-length': Buffer.byteLength(d), 'x-smokebox-client': '1', 'x-test-client': client }, headers) }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* no body */ } resolve({ status: res.statusCode, body: j }); }); }); r.on('error', () => resolve({ status: 0 })); r.end(d); });
  const adminCode = async (port) => (await (await fetch(`http://127.0.0.1:${port}/admin/pair`, { method: 'POST', headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json', 'x-smokebox-client': '1' }, body: '{}' })).json()).code;
  for (const [host, port, shared] of [['trust.test', TRUST, false], ['notrust.test', NOTRUST, true]]) {
    const code = await adminCode(port); const bad = [];
    for (let i = 0; i < 5; i++) bad.push((await call(host, '10.0.0.1', { code: 'ZZZZZ' + i, name: 'x' })).status);
    const other = await call(host, '10.0.0.2', { code, name: 'Second screen' });
    check(host + ': screen 1 is locked after five wrong codes (' + bad.join(',') + ')', bad[4] === 429, bad);
    check(shared ? host + ' (no TRUST_PROXY): the lock is shared, so screen 2 is locked too (the problem the setting fixes)' : host + ': screen 2, another address behind the same proxy, can still pair', shared ? other.status === 429 : other.status === 200, other);
    if (!shared) { const spoof = await call(host, '10.0.0.1', { code: await adminCode(port), name: 'Spoofer' }, '/pair', { 'x-forwarded-for': '10.0.0.77' }); check('a client that writes its own X-Forwarded-For cannot pick another address (the proxy\'s own entry is the one used): still locked', spoof.status === 429, spoof); }
  }

  console.log('\n# under a path prefix on the real site (NOT what beta.sh does)');
  const P1 = await open(`http://main.test:${PROXY}/beta/?hub&code=WRITECODE12345`);
  const s1 = await waitState(P1, 'connected', 8000);
  const P2 = await open(`http://main.test:${PROXY}/beta/?hub=${encodeURIComponent(`http://main.test:${PROXY}/beta`)}&code=WRITECODE12345`);
  const s2 = await waitState(P2, 'connected', 12000);
  console.log('  info  bare ?hub under /beta/ -> ' + s1 + '; ?hub=<address with /beta> -> ' + s2);
  check('under a path prefix the screen connects with the prefix named, and (builds with the page-folder fix) also with a bare ?hub', s2 === 'connected' && s1 === 'connected', { s1, s2 });
} finally { await browser.close(); proxy.close(); kids.forEach((k) => k.kill('SIGKILL')); }
console.log(fail ? fail + ' failed' : 'all checks passed'); process.exit(fail ? 1 : 0);
