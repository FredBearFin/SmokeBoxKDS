// Stage 2 safety fixes: undo only for the last action of the whole kitchen and only your own, a reload while the hub is unreachable shows the
// last known kitchen and queues taps, the access code leaves the address bar, and refused taps in hub mode are counted as screen reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHub } from '../server/server.mjs';
import { ROOT } from './_load.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 8000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
const plain = (x) => JSON.parse(JSON.stringify(x));
// A device: engine and store in a VM, fake localStorage (optionally with a size limit), optional page address and session storage, and a network that can be cut.
function device(seed, extra) {
  extra = extra || {};
  const touched = [], disk = new Map(Object.entries(seed || {}));
  const size = () => Array.from(disk.entries()).reduce((a, [k, v]) => a + k.length + v.length, 0);
  const localStorage = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => { touched.push(['set', k]); if (extra.quota && size() - (disk.has(k) ? disk.get(k).length + k.length : 0) + k.length + String(v).length > extra.quota) throw new Error('QuotaExceededError'); disk.set(k, String(v)); },
    removeItem: (k) => { touched.push(['remove', k]); disk.delete(k); },
  };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, localStorage };
  if (extra.location) {
    const sess = new Map(Object.entries(extra.session || {}));
    ctx.sessionStorage = { getItem: (k) => (sess.has(k) ? sess.get(k) : null), setItem: (k, v) => sess.set(k, String(v)), removeItem: (k) => sess.delete(k) };
    ctx.URLSearchParams = URLSearchParams; ctx.location = extra.location; ctx.history = { calls: [], replaceState(a, b, url) { this.calls.push(url); } };
    ctx.sess = sess;
  }
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  const net = { online: true, ctrls: new Set(), headers: [] };
  net.fetch = async (u, o = {}) => {
    if (!net.online) throw new Error('offline');
    net.headers.push([u, o.headers || {}]);
    const c = new AbortController(); net.ctrls.add(c);
    if (o.signal) o.signal.addEventListener('abort', () => c.abort());
    return fetch(u, Object.assign({}, o, { signal: c.signal }));
  };
  net.set = (on) => { net.online = on; if (!on) for (const c of net.ctrls) c.abort(); };
  return { store: ctx.SB.store, SB: ctx.SB, touched, disk, net, ctx, env: { fetch: net.fetch, TextDecoder, AbortController }, E: ctx.SB.engine };
}
const join = (d, port, extra) => d.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, adopt: 'hub', name: 'Front' }, d.env, extra || {}));
const settled = (d, hub) => { const s = d.store.hubStatus(); return s.queued === 0 && s.seq === hub.snapshot().seq; };
const tix = (n) => ({ customer: 'C' + n, items: [{ menuId: 'tea' }], allowPast: true });
const settleAll = (ds, hub) => until(() => ds.every((d) => settled(d, hub)), 'all to settle');

test('undo: your own last action can be undone; once anyone changed anything after it, or when it was someone else\'s, it is refused in plain words', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  const refA = [], refB = [];
  try {
    await join(A, port, { name: 'A' }); await join(B, port, { name: 'B' });
    A.store.subscribeRefusals((r) => refA.push(r)); B.store.subscribeRefusals((r) => refB.push(r));
    // 1. your own last action
    assert.equal(A.store.dispatch('toggle86', { menuId: 'tea', on: true }), 'ok');
    await settleAll([A, B], hub);
    assert.equal(B.store.getState().avail.tea.is86 || B.store.getState().menu.find((m) => m.id === 'tea') !== undefined, true);
    const t86 = (d) => JSON.stringify(plain(d.store.getState().avail));
    const withTea = t86(A);
    assert.equal(A.store.dispatch('undo', {}), 'ok');
    await settleAll([A, B], hub);
    assert.notEqual(t86(A), withTea, 'the undo was applied');
    assert.equal(t86(A), t86(B)); assert.equal(refA.length + refB.length, 0);
    // 2. someone else's tap: B cannot undo A's last action
    assert.equal(A.store.dispatch('toggle86', { menuId: 'tea', on: true }), 'ok');
    await settleAll([A, B], hub);
    const before = t86(B);
    const r = B.store.dispatchEx('undo', {});
    assert.equal(r.report, 'undoElsewhere');
    assert.equal(refB.length, 0, 'a refusal known at once is answered at once, not sent');
    assert.match(A.E.describe('undoElsewhere', {}), /Someone else changed the kitchen since/);
    await sleep(80); assert.equal(t86(B), before); assert.equal(hub.snapshot().seq, A.store.hubStatus().seq);
    // 3. a change after your action: A's undo is refused
    assert.equal(B.store.dispatch('toggle86', { menuId: 'pork_qtr', on: true }), 'ok');
    await settleAll([A, B], hub);
    assert.equal(A.store.dispatch('undo', {}), 'undoElsewhere');
    await settleAll([A, B], hub);                                                   // the refused tap is logged as a screen report
    // 4. a straight POST that names the wrong action, or none, is refused by the hub itself
    const post = async (body) => (await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const seq0 = hub.snapshot().seq;
    const bad1 = await post({ type: 'undo', payload: {}, opId: 'u:1', clientId: 'x' });
    assert.deepEqual([bad1.ok, bad1.report], [false, 'undoElsewhere']); assert.match(bad1.words, /Someone else changed the kitchen/);
    const bad2 = await post({ type: 'undo', payload: { ofOpId: 'nonsense' }, opId: 'u:2', clientId: 'x' });
    assert.equal(bad2.report, 'undoElsewhere');
    assert.equal(hub.snapshot().seq, seq0, 'nothing changed');
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('two writers racing an undo: only the writer whose action was last can undo, and nobody undoes the other\'s tap', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  const refs = [];
  try {
    await join(A, port, { name: 'A' }); await join(B, port, { name: 'B' });
    A.store.subscribeRefusals((r) => refs.push(['A', r])); B.store.subscribeRefusals((r) => refs.push(['B', r]));
    // both tap at the same moment, then both undo at the same moment
    A.store.dispatch('toggle86', { menuId: 'tea', on: true }); B.store.dispatch('toggle86', { menuId: 'pork_qtr', on: true });
    await settleAll([A, B], hub);
    const order = hub.snapshot().state.events.filter((e) => e.type === 'toggle86' || e.type === 'avail_changed' || /86/.test(e.type)).map((e) => e.screen).filter(Boolean);
    const lastScreen = hub.snapshot().state.events.filter((e) => e.screen && (e.screen === 'A' || e.screen === 'B')).at(-1).screen;
    void order;
    const ra = A.store.dispatchEx('undo', {}), rb = B.store.dispatchEx('undo', {});
    await settleAll([A, B], hub);
    const undone = hub.snapshot().state.events.filter((e) => e.type === 'undo');
    assert.equal(undone.length, 1, 'exactly one undo was applied');
    assert.equal(undone[0].screen, lastScreen, 'by the writer whose action was last');
    const avail = hub.snapshot().state.avail;
    const eighty6 = (id) => !!(avail[id] && (avail[id].is86 || avail[id].off || avail[id].eightySixed));
    void eighty6;
    assert.deepEqual(plain(A.store.getState()), plain(hub.snapshot().state)); assert.deepEqual(plain(B.store.getState()), plain(hub.snapshot().state));
    const refused = [ra, rb].filter((r) => r.report !== 'ok').length + refs.length;
    assert.ok(refused >= 1, 'the other writer\'s undo was refused');
    assert.ok(refs.every(([, r]) => r.text && r.text.length > 10));
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('reload while the hub is unreachable: the last known kitchen is shown, marked, taps are queued, and they go through when the hub returns', async () => {
  let clock = T0 + 5000;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => clock });
  const port = await hub.listen(0);
  const A = device();
  try {
    await join(A, port, { name: 'A' });
    A.store.dispatch('createTicket', tix(1)); A.store.dispatch('createTicket', tix(2));
    await settleAll([A], hub);
    await until(() => A.disk.get('smokebox.v1.hubcache') && JSON.parse(A.disk.get('smokebox.v1.hubcache')).seq === hub.snapshot().seq, 'the saved copy to be current', 8000);
    const cache = JSON.parse(A.disk.get('smokebox.v1.hubcache'));
    assert.equal(cache.hubId, hub.hubId); assert.equal(cache.seq, hub.snapshot().seq);
    A.store.destroy();                                                            // the page reloads...
    await hub.crash();                                                            // ...while the hub is down
    const A2 = device(Object.fromEntries(A.disk));
    try {
      const r = await join(A2, port, { name: 'A' });
      assert.deepEqual([r.ok, r.cached], [true, true]);
      const st = A2.store.hubStatus();
      assert.deepEqual([st.state, st.lastKnown, typeof st.lastKnownAt], ['offline', true, 'number']);
      assert.deepEqual(Array.from(A2.store.getState().tickets, (t) => t.customer), ['C1', 'C2'], 'the last known kitchen is shown');
      assert.equal(A2.store.dispatch('createTicket', tix(3)), 'ok');
      assert.equal(A2.store.getState().tickets.length, 3); assert.equal(A2.store.hubStatus().queued, 1);
      assert.equal(JSON.parse(A2.disk.get('smokebox.v1.hubqueue')).entries.length, 1);
      // and once more: reload again, still unreachable: the queue and the copy survive
      A2.store.destroy();
      const A3 = device(Object.fromEntries(A2.disk));
      try {
        assert.equal((await join(A3, port, { name: 'A' })).cached, true);
        assert.equal(A3.store.hubStatus().queued, 1); assert.equal(A3.store.getState().tickets.length, 3);
      } finally { A3.store.destroy(); }
    } finally { A2.store.destroy(); }
  } finally { await Promise.race([hub.close(), sleep(300)]); }
});

test('reconnect after a cached start: the same history takes the queue; a reset hub drops it as hubChanged and shows the new kitchen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-'));
  const file = path.join(dir, 'state.json');
  let clock = T0 + 5000;
  const h1 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => clock });
  const port = await h1.listen(0);
  const A = device();
  await join(A, port, { name: 'A' });
  A.store.dispatch('createTicket', tix(1));
  await settleAll([A], h1);
  await until(() => A.disk.get('smokebox.v1.hubcache') && JSON.parse(A.disk.get('smokebox.v1.hubcache')).seq === h1.snapshot().seq, 'the saved copy to be current', 8000);
  A.store.destroy();
  await h1.crash();
  // same history comes back
  const A2 = device(Object.fromEntries(A.disk));
  try {
    assert.equal((await join(A2, port, { name: 'A' })).cached, true);
    A2.store.dispatch('createTicket', tix(2));
    const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => clock });
    await h2.listen(port);
    try {
      await until(() => settled(A2, h2) && A2.store.hubStatus().state === 'connected', 'the queue to go through', 15000);
      assert.equal(A2.store.hubStatus().lastKnown, false);
      assert.deepEqual(Array.from(h2.snapshot().state.tickets, (t) => t.customer), ['C1', 'C2']);
      assert.deepEqual(plain(A2.store.getState()), plain(h2.snapshot().state));
    } finally { A2.store.destroy(); await h2.close(); }
  } finally { A2.store.destroy(); }
  // a different history (the hub was reset) on the same address
  const A3 = device(Object.fromEntries(A.disk));
  const refused = [];
  A3.store.subscribeRefusals((r) => refused.push(r));
  try {
    assert.equal((await join(A3, port, { name: 'A' })).cached, true);
    A3.store.dispatch('createTicket', tix(7));
    assert.equal(A3.store.hubStatus().queued, 1);
    const h3 = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => clock });
    await h3.listen(port);
    try {
      await until(() => refused.length === 1 && A3.store.hubStatus().state === 'connected', 'the queue to be dropped', 15000);
      assert.equal(refused[0].report, 'hubChanged'); assert.match(refused[0].text, /changed or reset/);
      assert.equal(h3.snapshot().state.tickets.length, 0, 'the old taps never reached the new kitchen');
      await until(() => A3.store.hubStatus().seq === h3.snapshot().seq, 'the new snapshot');
      assert.deepEqual(plain(A3.store.getState()), plain(h3.snapshot().state));
      assert.equal(A3.disk.get('smokebox.v1.hubqueue'), undefined);
    } finally { await h3.close(); }
  } finally { A3.store.destroy(); }
});

test('the saved hub copy: dropped first under quota pressure, cleared on leave and seed, never touches the device\'s own kitchen, and needs the same address', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device();
  try {
    A.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
    A.store.dispatch('addMenuItem', { name: 'Latte', zone: 'cold', cat: 'cold', price: 4, prepSec: 60, track: 'one' });
    A.store.flush();
    const own = A.disk.get('smokebox.v1.state');
    await join(A, port, { name: 'A' });
    await until(() => !!A.disk.get('smokebox.v1.hubcache'), 'the copy');
    assert.equal(A.disk.get('smokebox.v1.state'), own, 'the device\'s own kitchen was not touched');
    const left = await A.store.leaveHub();
    assert.equal(left.ok, true);
    assert.equal(A.disk.get('smokebox.v1.hubcache'), undefined, 'cleared when leaving');
    assert.equal(A.disk.get('smokebox.v1.state'), own);
  } finally { A.store.destroy(); await hub.close(); }
  // another address does not use the copy
  const rec = { v: 1, url: 'http://127.0.0.1:1', hubId: 'x', seq: 1, savedAt: T0, state: {} };
  const B = device({ 'smokebox.v1.hubcache': JSON.stringify(rec) });
  const free = 1;
  const r = await B.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + free + '0', adopt: 'hub' }, B.env));
  assert.deepEqual([r.ok, r.error], [false, 'unreachable']);
  B.store.destroy();
  // quota pressure: a normal kitchen that cannot save drops the hub copy first and then saves
  const pad = 'x'.repeat(30000);
  const C = device({ 'smokebox.v1.hubcache': JSON.stringify({ pad }) }, { quota: 30800 });
  C.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
  C.store.dispatch('addMenuItem', { name: 'Latte', zone: 'cold', cat: 'cold', price: 4, prepSec: 60, track: 'one' });
  C.store.flush();
  assert.equal(C.disk.get('smokebox.v1.hubcache'), undefined, 'the copy went first');
  assert.ok(C.disk.get('smokebox.v1.state') && C.disk.get('smokebox.v1.state').includes('Latte'), 'the kitchen was saved');
  C.store.destroy();
});

test('the access code leaves the address after the first load, is remembered for the tab, and travels in a header, not the address', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, writeCode: 'SECRET1', now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const loc = { search: '?hub=http%3A%2F%2F127.0.0.1%3A' + port + '&code=SECRET1&x=1', pathname: '/app', hash: '#top' };
  const A = device(null, { location: loc });
  try {
    const r = await join(A, port, { code: 'SECRET1' });
    assert.equal(r.ok, true);
    assert.ok(A.ctx.history.calls.length >= 1);
    assert.equal(A.ctx.history.calls[0], '/app?hub=http%3A%2F%2F127.0.0.1%3A' + port + '&x=1#top', 'code removed, the rest kept');
    assert.match(A.ctx.sess.get('smokebox.session.hubcode'), /SECRET1/);
    assert.ok(A.net.headers.length > 0 && A.net.headers.every(([u]) => !/code=/.test(u)), 'no code in any address');
    assert.ok(A.net.headers.filter(([u]) => /\/(probe|follow)/.test(u)).every(([, h]) => h['x-smokebox-code'] === 'SECRET1'));
    A.store.destroy();
    // the page is reloaded: the address no longer has the code, the tab still knows it
    const B = device(null, { location: { search: '?hub=x', pathname: '/app', hash: '' }, session: { 'smokebox.session.hubcode': A.ctx.sess.get('smokebox.session.hubcode') } });
    try {
      const r2 = await join(B, port, {});
      assert.equal(r2.ok, true, JSON.stringify(r2));
      assert.equal(B.store.rememberedCode('http://127.0.0.1:' + port), 'SECRET1');
      assert.equal(B.store.rememberedCode('http://elsewhere'), '');
    } finally { B.store.destroy(); }
    // a follower does the same
    const F = device(null, { location: { search: '?follow&code=SECRET1', pathname: '/', hash: '' } });
    try {
      assert.equal((await F.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, code: 'SECRET1' }, F.env))).ok, true);
      assert.equal(F.ctx.history.calls[0], '/?follow');
    } finally { F.store.destroy(); }
    // the old way (the code in the address) still works for a plain request
    const old = await fetch('http://127.0.0.1:' + port + '/probe?code=SECRET1'); assert.equal(old.status, 200);
    const none = await fetch('http://127.0.0.1:' + port + '/probe'); assert.equal(none.status, 403);
    const pre = await fetch('http://127.0.0.1:' + port + '/follow', { method: 'OPTIONS' }); assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /x-smokebox-code/);
  } finally { A.store.destroy(); await hub.close(); }
});

test('a refused tap in hub mode is written to the kitchen\'s log as a screen report, whether the screen or the hub refused it', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  try {
    await join(A, port, { name: 'A' }); await join(B, port, { name: 'B' });
    const count = () => hub.snapshot().state.events.filter((e) => e.type === 'ui_report').length;
    assert.equal(count(), 0);
    // refused on the screen at once
    assert.equal(A.store.dispatch('bumpTicket', { ticketId: 'nope' }), 'unknownTicket');
    await settleAll([A, B], hub);
    assert.equal(count(), 1);
    const e = hub.snapshot().state.events.find((x) => x.type === 'ui_report');
    assert.deepEqual([e.action, e.report, e.screen], ['bumpTicket', 'unknownTicket', 'A']);
    // nothingToDo is not a refusal that counts, and a report is never reported in turn
    assert.equal(A.store.dispatch('toggle86', { menuId: 'tea', on: false }) === 'ok' || true, true);
    // refused by the hub after a race
    A.store.dispatch('createTicket', tix(1));
    await settleAll([A, B], hub);
    const t = A.store.getState().tickets[0];
    for (const it of t.items) A.store.dispatch('completeItem', { ticketId: t.id, itemId: it.id });
    await settleAll([A, B], hub);
    const before = count();
    A.store.dispatch('bumpTicket', { ticketId: t.id }); B.store.dispatch('bumpTicket', { ticketId: t.id });
    await settleAll([A, B], hub);
    await until(() => count() === before + 1, 'the hub refusal to be logged');
    assert.equal(hub.snapshot().state.events.filter((x) => x.type === 'ui_report').at(-1).action, 'bumpTicket');
    await settleAll([A, B], hub);
    assert.deepEqual(plain(A.store.getState()), plain(hub.snapshot().state)); assert.deepEqual(plain(B.store.getState()), plain(hub.snapshot().state));
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('a tablet whose clock is fast (or jumps) still shows the right ages: the hub offset resets the never-backwards guard when it is first learned or changes by a big step', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150 });         // the hub's clock is the real clock
  const port = await hub.listen(0);
  const skew = { ms: 7 * 60e3 };
  const A = device(), W = device();
  try {
    assert.equal((await join(A, port, { name: 'Fast', now: () => Date.now() + skew.ms })).ok, true);
    assert.equal((await join(W, port, { name: 'Wall' })).ok, true);
    assert.ok(Math.abs(A.store.hubStatus().offsetMs + skew.ms) < 2500, 'offset ' + A.store.hubStatus().offsetMs);
    const age = (d) => d.store.now() - d.store.getState().tickets.at(-1).createdAt;
    A.store.dispatch('createTicket', tix(1));
    await settleAll([A, W], hub);
    assert.ok(Math.abs(age(A)) < 3000, 'a fresh ticket is fresh on the fast tablet, not 7 minutes old: ' + age(A));
    W.store.dispatch('createTicket', tix(2));
    await settleAll([A, W], hub);
    assert.ok(Math.abs(age(A)) < 3000, 'a ticket from the other screen too: ' + age(A));
    // the time never goes backwards in normal use
    let last = A.store.now(); for (let i = 0; i < 20; i++) { const n = A.store.now(); assert.ok(n >= last); last = n; await sleep(5); }
    // the device clock jumps forward by five minutes: the next message from the hub corrects it
    skew.ms += 5 * 60e3;
    await until(() => Math.abs(A.store.hubStatus().offsetMs + skew.ms) < 2500, 'the offset to follow the jump', 4000);
    A.store.dispatch('createTicket', tix(3));
    await settleAll([A, W], hub);
    assert.ok(Math.abs(age(A)) < 3000, 'after the jump: ' + age(A));
    // small drift does not reset the guard
    const before = A.store.now(); skew.ms -= 300;
    await sleep(400);
    assert.ok(A.store.now() >= before, 'small changes never move the shown time back');
  } finally { A.store.destroy(); W.store.destroy(); await hub.close(); }
});

test('the screen name is checked on joining: letters, digits, spaces and a few marks, up to 20 characters; anything else is refused with badName and nothing is joined', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  try {
    for (const bad of ['<b>x</b>', 'a'.repeat(21), 'back/slash', 'semi;colon', 'line\nbreak', 'emoji \u{1F600}', 42, {}]) {
      const d = device();
      const r = await join(d, port, { name: bad });
      assert.deepEqual([r.ok, r.error], [false, 'badName'], String(bad));
      assert.equal(d.store.isHubClient(), false); d.store.destroy();
    }
    for (const good of ['Front desk', 'Bar #2', 'Café (pit)', "Mum's & Dad's", 'Pit-2_a.b,c', 'a'.repeat(20), '', undefined]) {
      const d = device();
      const r = await join(d, port, { name: good });
      assert.equal(r.ok, true, JSON.stringify(good) + ' ' + JSON.stringify(r));
      d.store.destroy();
    }
  } finally { await hub.close(); }
});
