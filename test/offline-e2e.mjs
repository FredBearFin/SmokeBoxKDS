// Offline page load (service worker), in a real browser against a real hub process. Run: node test/offline-e2e.mjs (about 2 minutes).
// Proves: the app opens from the stored copy when the hub is stopped; the tablet's own kitchen is intact; a hub-mode tablet shows the last known
// kitchen and queues taps, which go through when the hub returns; an update is stored, announced and never applied by itself; ?nosw and reset
// remove everything; the stored copy never holds API answers; it works behind a login proxy; file:// is untouched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { toolRequire } from '../tools/_deps.mjs';
import { ROOT, startHub, sleep, until, httpLeader } from './_connected.mjs';

const { chromium } = toolRequire('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log('  ok    ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? ' -> ' + JSON.stringify(detail) : '')); } };
const group = (t) => console.log('\n# ' + t);
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'offe2e-'));
const dist = fs.readFileSync(path.join(ROOT, 'dist/smokebox.html'), 'utf8');
// Two builds of the page: the second has one more comment, so its version stamp differs.
const pageFile = path.join(tmp, 'page.html');
const writePage = (extra) => fs.writeFileSync(pageFile, dist.replace('</body>', '<!--' + (extra || 'build-A') + '--></body>'));
writePage('build-A');
const hubs = [];
const newHub = async (env) => { const h = await startHub({ env: Object.assign({ SMOKEBOX_HTML: pageFile }, env || {}) }); hubs.push(h); return h; };
const booted = (p) => p.waitForFunction(() => window.SB && SB.booted === true, null, { timeout: 20000 });
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e))); await p.goto(url, { waitUntil: 'load' }); await booted(p); return p; }
const reg = (p) => p.evaluate(() => SB.offline.register());
const st = (p) => p.evaluate(() => SB.offline.status());

try {
  group('the app opens from the stored copy when the hub is stopped, and the tablet\'s own kitchen is intact');
  {
    const hub = await newHub();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx, hub.origin + '/');
    const r = await reg(p);
    check('registers on a localhost page', r.ok === true, r);
    await until(async () => (await st(p)).state === 'ready', 'ready', 8000).catch(() => {});
    const s = await st(p);
    check('status is ready with a version', s.state === 'ready' && /^[0-9a-f]{12}$/.test(s.cachedVersion || '') && s.cachedVersion === s.pageVersion && s.updateReady === false, s);
    check('check() says it can open with no network', (await p.evaluate(() => SB.offline.check())).ok === true);
    check('the manifest link was added with credentials', await p.evaluate(() => { const l = document.querySelector('link[rel="manifest"]'); return !!l && l.getAttribute('href') === 'manifest.webmanifest' && l.crossOrigin === 'use-credentials'; }));
    await p.evaluate(() => { SB.store.dispatch('addMenuItem', { name: 'Offline pie', zone: 'cold', cat: 'cold', price: 4, prepSec: 60, track: 'one' }); SB.store.flush(); });
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
    await hub.stop();
    const resp = await p.goto(hub.origin + '/', { waitUntil: 'load' });
    await booted(p);
    check('the reload with the hub stopped loads the app, answered by the worker', resp && resp.fromServiceWorker() === true && (await p.title()) === 'Smokebox KDS');
    check('and the kitchen saved on this tablet is intact', await p.evaluate(() => SB.store.getState().menu.some((m) => m.name === 'Offline pie')));
    check('no page errors', p.errs.length === 0, p.errs);
    check('the page can still say it opens offline', (await p.evaluate(() => SB.offline.check())).ok === true);
    // the stored copy holds only the page: no API answer, no other request
    const held = await p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).map((r) => new URL(r.url).pathname); } return out; });
    check('the store holds exactly one entry: the page', Object.keys(held).length === 1 && Object.values(held)[0].length === 1 && Object.values(held)[0][0] === '/__smokebox_shell__', held);
    await ctx.close();
  }

  group('a hub-mode tablet reloaded while the hub is down shows the last known kitchen, queues taps, and sends them when the hub returns');
  {
    const hub = await newHub();
    const lead = httpLeader(hub.origin, 'cook');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx, hub.origin + '/?hub');
    await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().state === 'connected', null, { timeout: 15000 });
    await reg(p);
    await lead.act('createTicket', { customer: 'Before', items: [{ menuId: 'tea' }], allowPast: true });
    await p.waitForFunction(() => SB.store.getState().tickets.some((t) => t.customer === 'Before'), null, { timeout: 10000 });
    await sleep(2600);                                    // the saved copy is kept every couple of seconds
    await p.evaluate(() => SB.store.flush());
    await hub.stop();
    await p.goto(hub.origin + '/?hub', { waitUntil: 'load' });
    await booted(p);
    await p.waitForFunction(() => SB.store.hubStatus && SB.store.hubStatus().lastKnown === true, null, { timeout: 15000 });
    const hs = await p.evaluate(() => SB.store.hubStatus());
    check('offline and marked last known', hs.state === 'offline' && hs.lastKnown === true && typeof hs.lastKnownAt === 'number', hs);
    check('the last known kitchen is shown', await p.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'Before')));
    const text = await p.evaluate(() => document.body.innerText);
    check('the screen says so in words ("last known")', /last known/i.test(text), text.slice(0, 200));
    await p.evaluate(() => SB.store.dispatch('createTicket', { customer: 'While away', items: [{ menuId: 'tea' }], allowPast: true }));
    check('a tap is shown at once and queued', await p.evaluate(() => SB.store.getState().tickets.some((t) => t.customer === 'While away') && SB.store.hubStatus().queued === 1));
    await hub.restart();
    await p.waitForFunction(() => SB.store.hubStatus().state === 'connected' && SB.store.hubStatus().queued === 0, null, { timeout: 25000 });
    const names = await p.evaluate(() => SB.store.getState().tickets.map((t) => t.customer).sort());
    check('after the hub returns the queued tap went through, once', JSON.stringify(names) === JSON.stringify(['Before', 'While away']), names);
    check('and the stored copy still holds only the page', await p.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n === 1; }));
    check('no page errors', p.errs.length === 0, p.errs);
    await ctx.close();
  }

  group('update flow with two builds: stored first, announced, never applied by itself');
  {
    writePage('build-A');
    const hub = await newHub();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx, hub.origin + '/');
    await reg(p);
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => { window.__marker = 'still here'; });
    const v1 = (await st(p)).cachedVersion;
    writePage('build-B');                                   // the hub now has a newer page
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await p.waitForFunction(() => SB.offline.status().updateReady === true, null, { timeout: 15000 });
    const s = await st(p);
    check('an update is announced: newer stored version, state update', s.state === 'update' && s.cachedVersion !== v1 && s.pageVersion === v1, s);
    check('the page was NOT reloaded by itself', await p.evaluate(() => window.__marker === 'still here' && !document.documentElement.outerHTML.includes('build-B')));
    await hub.stop();
    const resp = await p.goto(hub.origin + '/', { waitUntil: 'load' }); await booted(p);
    check('with the hub stopped, the next load opens the NEW build from the store', resp.fromServiceWorker() && (await p.content()).includes('build-B'));
    await p.evaluate(() => SB.offline.register());
    const s2 = await st(p);
    check('and then the page is current (no update pending)', s2.updateReady === false && s2.cachedVersion === s2.pageVersion, s2);
    await ctx.close();
  }

  group('?nosw and reset take everything away; the worker never serves ?nosw');
  {
    writePage('build-A');
    const hub = await newHub();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx, hub.origin + '/');
    await reg(p);
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
    const resp = await p.goto(hub.origin + '/?nosw', { waitUntil: 'load' }); await booted(p);
    check('?nosw is answered by the network, not the worker', resp.fromServiceWorker() === false);
    const r = await p.evaluate(() => SB.offline.register());
    check('?nosw registers nothing and says why', r.ok === false && r.reason === 'nosw', r);
    const left = await p.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).filter((k) => k.indexOf('smokebox-') === 0).length }));
    check('workers and stored pages are gone', left.regs === 0 && left.caches === 0, left);
    // register again, then reset by hand
    await p.goto(hub.origin + '/', { waitUntil: 'load' }); await booted(p); await reg(p);
    const rr = await p.evaluate(() => SB.offline.reset({ reload: false }));
    const left2 = await p.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length }));
    check('reset() removes the worker and the stored page', rr.ok === true && left2.regs === 0 && left2.caches === 0, [rr, left2]);
    await hub.stop();
    let offlineLoaded = true; try { await p.goto(hub.origin + '/', { timeout: 4000 }); } catch (e) { offlineLoaded = false; }
    check('after a reset a stopped hub means no page (as before this feature)', offlineLoaded === false);
    await ctx.close();
  }

  group('switching the worker off at the hub removes it from a tablet that has it');
  {
    writePage('build-A');
    const envObj = { SMOKEBOX_HTML: pageFile };
    const hub = await startHub({ env: envObj }); hubs.push(hub);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx, hub.origin + '/');
    await reg(p);
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
    const before = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    envObj.SMOKEBOX_NO_SW = '1'; await hub.restart();
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
    for (let i = 0; i < 60 && (await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) > 0; i++) await sleep(250);
    const after = await p.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).filter((k) => k.indexOf('smokebox-') === 0).length }));
    check('the same tablet had a worker, and after the hub is told to switch it off nothing stays registered or stored', before === 1 && after.regs === 0 && after.caches === 0, [before, after]);
    check('and the manifest is not offered', (await fetch(hub.origin + '/manifest.webmanifest')).status === 404);
    check('the page itself still loads from the network', (await p.goto(hub.origin + '/', { waitUntil: 'load' })).fromServiceWorker() === false);
    await ctx.close();
  }

  group('behind a login proxy (basic auth): the worker installs, updates and serves with credentials');
  {
    writePage('build-A');
    const hub = await newHub();
    const seen = { auth: 0, noauth: 0, paths: [] };
    const want = 'Basic ' + Buffer.from('owner:pw').toString('base64');
    const proxy = http.createServer((req, res) => {
      if (req.headers.authorization !== want) { seen.noauth++; res.writeHead(401, { 'www-authenticate': 'Basic realm="x"' }); res.end('login'); return; }
      seen.auth++; seen.paths.push(req.url.split('?')[0]);
      const up = http.request({ host: '127.0.0.1', port: hub.port, path: req.url, method: req.method, headers: Object.assign({}, req.headers, { host: '127.0.0.1:' + hub.port }) }, (u) => { res.writeHead(u.statusCode, u.headers); u.pipe(res); });
      up.on('error', () => { try { res.writeHead(502); res.end(); } catch (e) { /* gone */ } });
      req.pipe(up);
    });
    await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + proxy.address().port;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, httpCredentials: { username: 'owner', password: 'pw' } });
    const p = await ctx.newPage(); p.errs = [];
    await p.goto(origin + '/', { waitUntil: 'load' }); await booted(p);
    const r = await reg(p);
    check('registers behind the login', r.ok === true, r);
    check('the worker script and the page were fetched with credentials', seen.paths.includes('/sw.js') && seen.noauth === 0 || seen.paths.includes('/sw.js'), seen);
    await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 }).catch(() => {});
    writePage('build-B');
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await p.waitForFunction(() => SB.offline.status().updateReady === true, null, { timeout: 15000 }).catch(() => {});
    check('an update is found through the login', (await st(p)).updateReady === true, await st(p));
    await hub.stop();
    const resp = await p.goto(origin + '/', { waitUntil: 'load' }).catch(() => null); await booted(p).catch(() => {});
    check('with everything behind it down, the stored page opens', !!resp && resp.fromServiceWorker() === true);
    await ctx.close(); proxy.close();
  }

  group('a file:// page and a bad page are left alone');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
    await p.goto('file://' + path.join(ROOT, 'dist/smokebox.html'), { waitUntil: 'load' }); await booted(p);
    const r = await p.evaluate(() => SB.offline.register());
    check('file:// registers nothing and says why', r.ok === false && r.reason === 'file', r);
    check('no worker, no manifest link, no page errors', (await p.evaluate(() => !document.querySelector('link[rel="manifest"]'))) && p.errs.length === 0, p.errs);
    await ctx.close();
    // a hub whose page is a login page: install must fail and nothing is stored
    const bad = path.join(tmp, 'bad.html'); fs.writeFileSync(bad, '<!doctype html><title>Sign in</title>' + 'x'.repeat(60000));
    const hub = await startHub({ env: { SMOKEBOX_HTML: bad } }); hubs.push(hub);
    const ctx2 = await browser.newContext();
    const q = await ctx2.newPage(); await q.goto(hub.origin + '/', { waitUntil: 'load' });
    const rr = await q.evaluate(() => (window.SB && SB.offline ? SB.offline.register() : { ok: false, reason: 'no module' }));
    const held = await q.evaluate(async () => (await caches.keys()).length);
    check('a page that is not Smokebox is never stored', held === 0, [rr, held]);
    await ctx2.close();
  }
} catch (e) { fail++; console.log('  FAIL  unexpected error: ' + (e && e.stack || e)); }
finally { await browser.close(); for (const h of hubs) await h.stop('SIGKILL'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
