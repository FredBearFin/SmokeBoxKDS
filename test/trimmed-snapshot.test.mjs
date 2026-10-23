// Trimmed snapshots (opt-in ?trim=<days>): the hub keeps everything, a trimmed follower holds the open work and the recent days, says what was left
// out, converges with the hub for the kept window under random actions, and survives an action that touches history it does not hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createHub } from '../server/server.mjs';
import { ROOT } from './_load.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 6000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const DAY = 86400000, T0 = new Date(2026, 9, 1, 12, 0, 0).getTime();
// A fresh VM with the engine and the store and an empty fake localStorage.
function device() {
  const disk = new Map();
  const localStorage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k) };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, localStorage }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['00-util.js', '10-config.js', '20-engine.js', '30-store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
  return { store: ctx.SB.store, SB: ctx.SB };
}
const env = { fetch: globalThis.fetch, TextDecoder: globalThis.TextDecoder, AbortController: globalThis.AbortController };
const post = (port, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(JSON.parse(s))); });
  r.on('error', reject); r.end(JSON.stringify(body));
});
const plain = (x) => JSON.parse(JSON.stringify(x));
let n = 0;
const act = (port, type, payload) => post(port, { type, payload, opId: 'a:' + ++n, clientId: 'leader' });
const REST = (s) => { const c = plain(s); for (const k of ['tickets', 'orders', 'events', 'eventArchive', 'safetyKeep', 'undo']) delete c[k]; return c; };

// Builds a hub whose clock runs through ten days of busy service, closing every ticket as it goes.
async function busyHub(days) {
  let clock = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => clock });
  const port = await hub.listen(0);
  const menu = ['tea'];   // a drink with no timed ingredient, so it stays available as the clock runs for days
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 6; k++) {
      clock = T0 + d * DAY + k * 3600e3;
      const r = await act(port, 'createTicket', { customer: 'D' + d + 'T' + k, items: [{ menuId: menu[k % menu.length] }], pay: { method: 'cash' }, allowPast: true });
      const t = hub.snapshot().state.tickets.find((x) => x.customer === 'D' + d + 'T' + k);
      if (t && k < 5) await act(port, 'bumpTicket', { ticketId: t.id, force: true });
    }
  }
  return { hub, port, setClock: (t) => { clock = t; }, getClock: () => clock, menu };
}

test('trimState: keeps open work and the recent days, leaves the input alone, and the copy passes the engine\'s own checks', async () => {
  const { hub } = await busyHub(10);
  try {
    const d = device(), st = hub.snapshot().state, now = T0 + 9 * DAY + 6 * 3600e3;
    const before = JSON.stringify(st);
    const t = d.SB.engine.trimState(st, now, 3);
    assert.equal(JSON.stringify(st), before, 'the hub state is untouched');
    const cut = now - 3 * DAY;
    assert.ok(t.state.tickets.length < st.tickets.length && t.state.tickets.length > 0);
    assert.ok(t.state.tickets.every((x) => x.status === 'active' || x.createdAt >= cut || t.state.orders.some((o) => o.id === x.orderId)));
    assert.ok(st.tickets.filter((x) => x.status === 'active').every((x) => t.state.tickets.some((y) => y.id === x.id)), 'every active ticket stays');
    assert.ok(st.orders.filter((o) => o.status === 'open').every((o) => t.state.orders.some((y) => y.id === o.id)), 'every open order stays');
    assert.ok(t.state.tickets.every((x) => x.orderId === undefined || t.state.orders.some((o) => o.id === x.orderId)), 'no ticket points at a left-out order');
    assert.deepEqual(plain(t.state.menu), plain(st.menu)); assert.deepEqual(plain(t.state.seq), plain(st.seq)); assert.deepEqual(plain(t.state.ledger), plain(st.ledger));
    assert.equal(t.trimmed.days, 3); assert.equal(t.trimmed.since, cut); assert.ok(t.trimmed.left.tickets > 0);
    assert.deepEqual(Array.from(d.SB.engine.checkInvariants(t.state, now)), []);
    assert.equal(d.SB.engine.validateBackup(plain(t.state)).ok, true, 'a follower accepts it like any backup');
    assert.equal(d.SB.engine.trimState(st, now, 0).trimmed, null, 'a bad window changes nothing');
  } finally { await hub.close(); }
});

test('/follow: no ?trim sends everything, ?trim=N sends less with a marker, a bad value is ignored', async () => {
  const { hub, port, setClock } = await busyHub(10);
  setClock(T0 + 9 * DAY + 7 * 3600e3);
  try {
    // Reads /follow until the snapshot event arrives and returns its parsed data.
    const snap = (qs) => new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, path: '/follow' + qs, agent: false }, (res) => {
        let s = ''; res.on('data', (c) => { s += c; const m = /event: snapshot\ndata: (.*)\n\n/.exec(s); if (m) { res.destroy(); resolve(JSON.parse(m[1])); } });
      });
      r.on('error', reject); r.end(); setTimeout(() => reject(new Error('no snapshot')), 4000);
    });
    const full = await snap(''), two = await snap('?trim=2'), bad = await snap('?trim=abc'), huge = await snap('?trim=9999');
    assert.equal(full.trimmed, undefined); assert.equal(full.state.tickets.length, hub.snapshot().state.tickets.length);
    assert.ok(two.state.tickets.length < full.state.tickets.length && two.trimmed.days === 2 && Number.isFinite(two.trimmed.since));
    assert.equal(bad.trimmed, undefined); assert.equal(huge.trimmed, undefined);
    assert.equal(hub.snapshot().state.tickets.length, full.state.tickets.length, 'the hub itself keeps everything');
  } finally { await hub.close(); }
});

test('a trimmed follower converges on the kept window under random actions and reports what it left out', async () => {
  const { hub, port, setClock, getClock, menu } = await busyHub(10);
  setClock(T0 + 9 * DAY + 7 * 3600e3);
  const d = device();
  try {
    const r = await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, trim: 2 }, env));
    assert.equal(r.ok, true);
    const info = d.store.trimInfo();
    assert.ok(info && info.days === 2 && info.left.tickets > 0);
    assert.ok(d.store.getState().tickets.length < hub.snapshot().state.tickets.length);
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 80; i++) {
      setClock(getClock() + Math.round(rnd() * 60000));
      const open = hub.snapshot().state.tickets.filter((t) => t.status === 'active'), roll = rnd();
      if (roll < 0.4 || !open.length) await act(port, 'createTicket', { customer: 'N' + i, items: [{ menuId: menu[Math.floor(rnd() * menu.length)] }], allowPast: true });
      else if (roll < 0.7) { const t = open[Math.floor(rnd() * open.length)]; const it = t.items.find((x) => x.status !== 'done'); if (it) await act(port, 'advanceItem', { ticketId: t.id, itemId: it.id }); }
      else if (roll < 0.85) { const t = open[Math.floor(rnd() * open.length)]; await act(port, 'bumpTicket', { ticketId: t.id, force: true }); }
      else await act(port, 'toggle86', { menuId: menu[Math.floor(rnd() * menu.length)], on: rnd() < 0.5 });
      if (i % 10 === 9) await sleep(40);
    }
    await until(() => d.store.followStatus().seq === hub.snapshot().seq, 'the follower to reach the hub');
    const h = hub.snapshot().state, f = d.store.getState(), since = d.store.trimInfo().since;
    assert.deepEqual(REST(f), REST(h), 'everything except the history lists is identical');
    const keepH = h.tickets.filter((t) => t.status === 'active' || t.createdAt >= since || h.orders.some((o) => o.id === t.orderId && (o.status === 'open' || o.createdAt >= since)));
    const have = new Set(f.tickets.map((t) => t.id));
    assert.ok(keepH.every((t) => have.has(t.id)), 'every ticket of the kept window is there (the follower may still hold one that has since closed: it trims only at a fresh copy)');
    assert.ok(f.tickets.length < h.tickets.length, 'and old history is still left out');
    for (const t of f.tickets) assert.deepEqual(plain(t), plain(h.tickets.find((x) => x.id === t.id)), 'ticket ' + t.id + ' is identical');
    assert.deepEqual(plain(f.events.filter((e) => e.t >= since)), plain(h.events.filter((e) => e.t >= since)), 'the recent events are identical');
    assert.equal(d.store.followStatus().state, 'following');
  } finally { d.store.stopFollower(); await hub.close(); }
});

test('an action on history the follower does not hold makes it take a fresh copy, never crash or stall', async () => {
  const { hub, port, setClock } = await busyHub(10);
  setClock(T0 + 9 * DAY + 7 * 3600e3);
  const d = device();
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port, trim: 2 }, env));
    const old = hub.snapshot().state.tickets.find((t) => t.customer === 'D0T0');
    assert.ok(old && !d.store.getState().tickets.some((t) => t.id === old.id), 'the old ticket is not on the follower');
    const r = await act(port, 'recallTicket', { ticketId: old.id });
    const r2 = await act(port, 'createTicket', { customer: 'After', items: [{ menuId: 'tea' }], allowPast: true });
    assert.equal(r2.ok, true, JSON.stringify([r, r2]).slice(0, 400));
    await until(() => d.store.followStatus().seq === hub.snapshot().seq && d.store.getState().tickets.some((t) => t.customer === 'After'), 'the follower to catch up');
    assert.equal(d.store.followStatus().state, 'following');
    assert.ok(d.store.trimInfo(), 'still trimmed');
    const now = d.store.getState().tickets.find((t) => t.id === old.id);
    assert.ok(now && now.status === 'active', 'the recalled old ticket is open work now, so the fresh copy holds it');
    assert.deepEqual(plain(now), plain(hub.snapshot().state.tickets.find((t) => t.id === old.id)));
    assert.ok(Array.isArray(plain(d.store.getState().events)));
    assert.equal(typeof r.ok, 'boolean');
  } finally { d.store.stopFollower(); await hub.close(); }
});

test('a follower without trim is unchanged: the whole kitchen and no marker', async () => {
  const { hub, port, setClock } = await busyHub(4);
  setClock(T0 + 3 * DAY + 7 * 3600e3);
  const d = device();
  try {
    await d.store.initFollower(Object.assign({ url: 'http://127.0.0.1:' + port }, env));
    assert.equal(d.store.trimInfo(), null);
    assert.equal(d.store.getState().tickets.length, hub.snapshot().state.tickets.length);
  } finally { d.store.stopFollower(); await hub.close(); }
});
