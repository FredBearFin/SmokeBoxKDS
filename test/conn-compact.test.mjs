// The connected track with compact saves: a hub client keeps the hub's last snapshot in the compact form (so a busy hub's kitchen fits under the cap
// and shows offline), a hub snapshot reaches a store whose own save is compact, and the hub's own saved file stays readable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHub } from '../server/server.mjs';
import { loadSB, ROOT } from './_load.mjs';

const SB0 = await loadSB(['00-util', '10-config', '20-engine']);
const E0 = SB0.engine;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 8000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
// A device: a VM with the modules, a fake localStorage and a network that can be cut.
function device(seed) {
  const disk = new Map(Object.entries(seed || {}));
  const localStorage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => { disk.set(k, String(v)); }, removeItem: (k) => { disk.delete(k); } };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, localStorage };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const net = { online: true, ctrls: new Set() };
  net.fetch = async (u, o = {}) => { if (!net.online) throw new Error('offline'); const c = new AbortController(); net.ctrls.add(c); if (o.signal) o.signal.addEventListener('abort', () => c.abort()); return fetch(u, Object.assign({}, o, { signal: c.signal })); };
  net.set = (on) => { net.online = on; if (!on) for (const c of net.ctrls) c.abort(); };
  return { store: ctx.SB.store, disk, net, env: { fetch: net.fetch, TextDecoder, AbortController } };
}
// A busy kitchen state: n finished tickets over a few closed days.
function busy(n) {
  let t = new Date(2026, 9, 20, 12).getTime(); let s = E0.newState({ now: t, blank: true });
  const go = (type, p) => { t += 15000; const x = E0.apply(s, type, p, t); if (x.report === 'ok') s = x.state; return x; };
  const dish = go('addMenuItem', { name: 'Plain', zone: 'pit', cat: 'meat', price: 6, prepSec: 60, track: 'one', prepGuess: false }).info.id;
  for (let i = 0; i < n; i++) { const c = go('createTicket', { customer: 'G' + (i % 30), items: [{ menuId: dish }] }); const tk = s.tickets[s.tickets.length - 1]; go('advanceItem', { ticketId: tk.id, itemId: tk.items[0].id }); go('advanceItem', { ticketId: tk.id, itemId: tk.items[0].id }); go('bumpTicket', { ticketId: tk.id }); go('payOrder', { orderId: c.info.orderId, method: 'cash' }); }
  return { s, t, dish };
}
const body = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.rev; delete c.undo; return JSON.stringify(c, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((y) => [y, v[y]])) : v)); };

test('a hub with 360 tickets: the client keeps the snapshot compact, and after a reload with the hub down it shows the same kitchen as last known', async () => {
  const K = busy(360);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbcc-')), file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify({ v: 1, seq: 5, state: K.s }));
  const hub = await createHub({ dataFile: file, tickMs: 600000, heartbeatMs: 150, saveMs: 50, now: () => K.t + 1000 });
  const port = await hub.listen(0);
  const A = device();
  try {
    A.store.init({ now: () => K.t + 1000, noTimers: true, noSync: true, blank: true });
    const j = await A.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, adopt: 'hub', name: 'Front' }, A.env));
    assert.equal(j.ok, true, JSON.stringify(j));
    await until(() => A.store.getState().tickets.length === 360, 'the hub kitchen');
    await until(() => A.disk.has('smokebox.v1.hubcache'), 'the saved snapshot');
    const rec = JSON.parse(A.disk.get('smokebox.v1.hubcache'));
    assert.equal(rec.fmt, 2, 'the saved snapshot is compact');
    assert.ok(A.disk.get('smokebox.v1.hubcache').length < 0.7 * JSON.stringify(K.s).length);
    const shown = body(A.store.getState());
    A.store.destroy(); await hub.close();
    // reload with the hub down
    const B = device({ 'smokebox.v1.hubcache': A.disk.get('smokebox.v1.hubcache') });
    B.net.set(false);
    try {
      B.store.init({ now: () => K.t + 5000, noTimers: true, noSync: true, blank: true });
      await B.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, adopt: 'hub', name: 'Front' }, B.env)).catch(() => {});
      await until(() => B.store.hubStatus().lastKnown === true, 'the last known kitchen');
      assert.equal(B.store.getState().tickets.length, 360);
      assert.equal(body(B.store.getState()).length, shown.length, 'the same kitchen');
    } finally { B.store.destroy(); }
  } finally { try { A.store.destroy(); } catch (e) { /* done */ } try { await hub.close(); } catch (e) { /* closed */ } }
});

test('the hub\'s own saved file stays the plain readable form, and a hub restart on it gives the same kitchen', async () => {
  const K = busy(320);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbcc2-')), file = path.join(dir, 'state.json');
  const hub = await createHub({ dataFile: file, tickMs: 600000, saveMs: 20, now: () => K.t });
  const port = await hub.listen(0);
  await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'sanitizeDone', payload: { who: 'JM' }, opId: 'x:1', clientId: 'x' }) });
  hub.flush(); await hub.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(saved.state && saved.fmt === undefined, 'readable');
  const hub2 = await createHub({ dataFile: file, tickMs: 600000, now: () => K.t });
  try { assert.equal(hub2.snapshot().state.events.length > 0, true); } finally { await hub2.close(); }
});
