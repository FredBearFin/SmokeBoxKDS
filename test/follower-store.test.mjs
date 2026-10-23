// The read-only follower in the store (SB.store.initFollower) against the real hub: it converges with the hub under random actions,
// refuses every local write, never touches the device's own saved kitchen, resumes after an outage or a hub restart, falls back to a
// snapshot when the history is gone, reports its status honestly, and follows the hub's clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHub } from '../server/server.mjs';
import { ROOT } from './_load.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 4000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
// A device: a fresh VM with the engine and the store, and a fake localStorage that records every touch (the device's own kitchen).
function device(seed) {
  const touched = [], disk = new Map(Object.entries(seed || {}));
  const localStorage = {
    getItem: (k) => { touched.push(['get', k]); return disk.has(k) ? disk.get(k) : null; },
    setItem: (k, v) => { touched.push(['set', k]); disk.set(k, String(v)); },
    removeItem: (k) => { touched.push(['remove', k]); disk.delete(k); },
  };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, localStorage };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  return { store: ctx.SB.store, SB: ctx.SB, touched, disk };
}
const env = { fetch: globalThis.fetch, TextDecoder: globalThis.TextDecoder, AbortController: globalThis.AbortController };
const post = (port, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (res) => {
    let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(JSON.parse(s)));
  });
  r.on('error', reject); r.end(JSON.stringify(body));
});
const plain = (x) => JSON.parse(JSON.stringify(x));
let n = 0;
const act = (port, type, payload) => post(port, { type, payload, opId: 'a:' + ++n, clientId: 'leader' });

test('random actions on the leader: the follower always ends in the hub\'s exact state, including ticks', async () => {
  let clock = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 25, heartbeatMs: 200, now: () => clock });
  const port = await hub.listen(0);
  const d = device();
  try {
    const r = await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port }, env));
    assert.equal(r.ok, true);
    assert.equal(d.store.followStatus().state, 'following');
    const menu = hub.snapshot().state.menu.map((m) => m.id);
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 120; i++) {
      clock += Math.round(rnd() * 90000);
      const s = hub.snapshot().state, open = s.tickets.filter((t) => t.status === 'active');
      const roll = rnd();
      if (roll < 0.3 || !open.length) await act(port, 'createTicket', { customer: 'G' + i, items: [{ menuId: menu[Math.floor(rnd() * menu.length)] }, { menuId: menu[Math.floor(rnd() * menu.length)] }], allowPast: true });
      else if (roll < 0.6) { const t = open[Math.floor(rnd() * open.length)]; const it = t.items.find((x) => x.status !== 'done'); if (it) await act(port, 'advanceItem', { ticketId: t.id, itemId: it.id }); }
      else if (roll < 0.75) { const t = open[Math.floor(rnd() * open.length)]; await act(port, 'bumpTicket', { ticketId: t.id }); }
      else if (roll < 0.85) await act(port, 'toggle86', { menuId: menu[Math.floor(rnd() * menu.length)], on: rnd() < 0.5 });
      else if (roll < 0.95) await act(port, 'pullBatch', { ing: 'pork', g: 200 });
      else await act(port, 'logTemp', { batchId: (s.batches.find((b) => b.status !== 'discard') || {}).id, tempF: 150 });
      if (i % 10 === 9) await sleep(60);
    }
    clock += 6 * 3600e3;                                               // a long gap: batches expire on the hub's own tick
    await until(() => d.store.followStatus().seq === hub.snapshot().seq && hub.snapshot().seq > 30, 'the follower to reach the hub (hub seq ' + hub.snapshot().seq + ')');
    await sleep(120);
    await until(() => d.store.followStatus().seq === hub.snapshot().seq, 'the final tick');
    assert.deepEqual(plain(d.store.getState()), plain(hub.snapshot().state));
    assert.ok(hub.snapshot().state.events.some((e) => e.type === 'batch_status'), 'time-driven changes happened');
  } finally { d.store.destroy(); await hub.close(); }
});

test('a follower refuses every local write and never touches the device\'s own saved kitchen', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => T0 });
  const port = await hub.listen(0);
  // this device already holds its own saved kitchen
  const own = { v: 1, savedAt: T0, rev: 1, clock: { virtual: T0, real: T0, speed: 1 } };
  const seed = { 'smokebox.v1.state': JSON.stringify(own), 'smokebox.v1.outbox': '[]', 'smokebox.v1.initials': '"ZZ"' };
  const d = device(seed);
  try {
    assert.equal((await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port }, env))).ok, true);
    assert.equal(d.store.isFollower(), true);
    const before = JSON.stringify(plain(d.store.getState()));
    for (const [type, payload] of [['createTicket', { items: [{ menuId: 'tea' }] }], ['toggle86', { menuId: 'tea', on: true }], ['resetLive', {}], ['undo', {}], ['uiReport', { action: 'x', report: 'y' }], ['nonsense', {}]]) {
      const r = d.store.dispatchEx(type, payload);
      assert.equal(r.report, 'followerReadOnly', type); assert.deepEqual(plain(r.info), {}); assert.equal(r.opId, null);
      assert.equal(d.store.dispatch(type, payload), 'followerReadOnly');
    }
    assert.equal(d.store.lastResult().report, 'followerReadOnly');
    assert.equal(d.store.importAll('{}'), 'followerReadOnly');
    assert.equal(d.store.reset(), 'followerReadOnly');
    assert.equal(d.store.resetLive({}), 'followerReadOnly');
    assert.equal(d.store.startOver({ confirm: d.store.START_OVER_WORD }).ok, false);
    assert.equal(d.store.enterDemo(), false);
    assert.equal(JSON.stringify(plain(d.store.getState())), before, 'nothing changed');
    assert.equal(hub.snapshot().seq, 0, 'nothing reached the hub');
    d.store.flush();
    assert.equal(d.touched.some(([op, k]) => op !== 'get' && /smokebox\.v1\.(state|outbox|initials|lastgood|corrupt)/.test(k)), false, 'no write to the device\'s own kitchen keys');
    assert.equal(d.disk.get('smokebox.v1.state'), seed['smokebox.v1.state']);
    assert.equal(d.store.outbox().length, 0);
    assert.match(d.SB.engine.describe('followerReadOnly', {}), /only shows the kitchen/);
  } finally { d.store.destroy(); await hub.close(); }
  // a normal kitchen and the demo never become followers
  const k = device();
  k.store.init({ now: () => T0, noTimers: true, noSync: true });
  assert.equal(k.store.isFollower(), false); assert.equal(k.store.followStatus().state, 'off');
  assert.equal(k.store.dispatch('toggle86', { menuId: 'tea', on: true }) !== 'followerReadOnly', true);
  k.store.init({ now: () => T0, noTimers: true, noSync: true, mode: 'demo' });
  assert.equal(k.store.isFollower(), false);
  k.store.destroy();
});

test('a short outage: the follower shows reconnecting, resumes from its change number without a snapshot, and catches up', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fol-'));
  const file = path.join(dir, 'state.json');
  let clock = T0;
  const h1 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 100, saveMs: 3600000, now: () => clock });
  const port = await h1.listen(0);
  const d = device();
  const seen = [];
  d.store.subscribeFollow((s) => seen.push(s.state));
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, staleMs: 60000 }, env));
    for (let i = 0; i < 4; i++) { clock += 1000; await act(port, 'createTicket', { customer: 'A' + i, items: [{ menuId: 'tea' }] }); }
    await until(() => d.store.followStatus().seq === 4, 'four actions');
    d.store.subscribeFollow((s) => seen.push(s.state));
    const hubId = h1.hubId;
    await h1.crash();                                                  // the hub loses power
    await until(() => d.store.followStatus().state === 'reconnecting', 'reconnecting');
    assert.equal(d.store.followStatus().seq, 4, 'it keeps showing the last good state');
    assert.equal(d.store.getState().tickets.length, 4);
    const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 100, now: () => clock });
    await h2.listen(port);
    try {
      assert.equal(h2.hubId, hubId); assert.equal(h2.replayed, 4);
      for (let i = 0; i < 3; i++) { clock += 1000; await act(port, 'createTicket', { customer: 'B' + i, items: [{ menuId: 'tea' }] }); }
      await until(() => d.store.followStatus().state === 'following' && d.store.followStatus().seq === 7, 'following again at seq 7', 8000);
      assert.deepEqual(plain(d.store.getState()), plain(h2.snapshot().state));
      assert.ok(seen.includes('reconnecting') && seen.includes('following'));
    } finally { await h2.close(); }
  } finally { d.store.destroy(); }
});

test('a hub with no history left (a new hub, another history) gives a snapshot, and the follower converges on it', async () => {
  let clock = T0;
  const h1 = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 100, now: () => clock });
  const port = await h1.listen(0);
  const d = device();
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port }, env));
    for (let i = 0; i < 3; i++) { clock += 1000; await act(port, 'createTicket', { customer: 'Old' + i, items: [{ menuId: 'tea' }] }); }
    await until(() => d.store.followStatus().seq === 3, 'three actions');
    const oldId = d.store.followStatus().hubId;
    await h1.crash();
    const h2 = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 100, now: () => clock });
    await h2.listen(port);
    try {
      for (let i = 0; i < 2; i++) { clock += 1000; await act(port, 'createTicket', { customer: 'New' + i, items: [{ menuId: 'tea' }] }); }
      await until(() => d.store.followStatus().state === 'following' && d.store.followStatus().hubId === h2.hubId, 'the new history', 8000);
      assert.notEqual(d.store.followStatus().hubId, oldId);
      assert.deepEqual(plain(d.store.getState()), plain(h2.snapshot().state));
      assert.deepEqual(Array.from(d.store.getState().tickets, (t) => t.customer), ['New0', 'New1']);
    } finally { await h2.close(); }
  } finally { d.store.destroy(); }
});

test('status: a wrong code, a page that is not a hub, an unreachable hub that appears later, and a version it cannot read', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, followCode: 'SECRET', heartbeatMs: 100, now: () => T0 });
  const port = await hub.listen(0);
  try {
    const bad = device();
    const r = await bad.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, code: 'nope' }, env));
    assert.deepEqual([r.ok, r.error], [false, 'badCode']);
    assert.equal(bad.store.followStatus().state, 'error'); assert.equal(bad.store.followStatus().error, 'badCode'); assert.match(bad.store.followStatus().reason, /code/);
    assert.equal(bad.store.followStatus().url.includes('nope'), false);
    bad.store.destroy();
    const good = device();
    assert.equal((await good.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port + '/', code: 'SECRET' }, env))).ok, true);
    good.store.destroy();
  } finally { await hub.close(); }
  // a plain web server: not a hub
  const web = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<html></html>'); });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  const w = device();
  const wr = await w.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + web.address().port }, env));
  assert.deepEqual([wr.ok, wr.error], [false, 'notFound']); assert.equal(w.store.followStatus().state, 'error');
  w.store.destroy();
  // another protocol version
  const odd = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/event-stream' }); s.write('event: hello\ndata: {"proto":2,"hubId":"x","seq":0}\n\n'); });
  await new Promise((r) => odd.listen(0, '127.0.0.1', r));
  const o = device();
  const or = await o.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + odd.address().port }, env));
  assert.deepEqual([or.ok, or.error], [false, 'wrongVersion']); assert.equal(o.store.followStatus().state, 'error');
  o.store.destroy(); odd.closeAllConnections?.(); odd.close(); web.close();
  // unreachable now, the hub starts later: the follower keeps trying and gets there
  const free = http.createServer(); await new Promise((r) => free.listen(0, '127.0.0.1', r)); const fport = free.address().port; await new Promise((r) => free.close(r));
  const u = device();
  const ur = await u.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + fport }, env));
  assert.deepEqual([ur.ok, ur.error], [false, 'unreachable']);
  assert.equal(u.store.followStatus().state, 'connecting'); assert.ok(u.store.followStatus().retryInMs > 0);
  const late = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 100, now: () => T0 });
  await late.listen(fport);
  try { await until(() => u.store.followStatus().state === 'following', 'the late hub', 8000); assert.equal(u.store.followStatus().error, null); } finally { u.store.destroy(); await late.close(); }
});

test('a silent stream becomes stale after the limit, is reconnected, and recovers', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 3600000, now: () => T0 });
  const port = await hub.listen(0);
  const d = device();
  const seen = [];
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, staleMs: 400 }, env));
    d.store.subscribeFollow((s) => seen.push(s.state));
    await until(() => seen.includes('stale'), 'stale', 5000);
    assert.ok(d.store.followStatus().staleSince !== null || d.store.followStatus().state !== 'following');
    await until(() => d.store.followStatus().state === 'following', 'recovered after the reconnect', 6000);
    assert.equal(d.store.followStatus().seq, 0);
  } finally { d.store.destroy(); await hub.close(); }
});

test('the follower\'s clock is the hub\'s: now() is this device\'s time plus the offset, so elapsed times agree', async () => {
  const skew = 7 * 60e3;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 100, now: () => Date.now() + skew });
  const port = await hub.listen(0);
  const d = device();
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port }, env));
    const off = d.store.followStatus().offsetMs;
    assert.ok(Math.abs(off - skew) < 1500, 'offset ' + off);
    assert.ok(Math.abs(d.store.now() - (Date.now() + skew)) < 1500);
    const a = d.store.now(); await sleep(30); assert.ok(d.store.now() >= a, 'time never goes backwards');
  } finally { d.store.destroy(); await hub.close(); }
});
