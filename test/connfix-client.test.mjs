// Independent review r2, client side (night/a5-connfix): opIds that never repeat after Leave and Join, taps for one hub never sent to another, a full hub is retried. (Helpers copied from hub-client.test.mjs.)
// Old header: Stage 2: screens that write through the hub. Two or three stores plus the real hub: prediction then the hub's answer, the hub's order
// wins, conflicting taps give one winner and a plain refusal, offline queues replay on reconnect, a hub restart and a lost answer never
// apply a tap twice, joining needs an explicit choice and never touches the device's own saved kitchen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHub } from '../server/server.mjs';
import { ROOT } from './_load.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 6000) { for (let i = 0; i < ms / 20; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
const plain = (x) => JSON.parse(JSON.stringify(x));
// A device: a VM with the engine and store, a fake localStorage (its own kitchen), and a network whose link can be cut.
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
  const net = { online: true, ctrls: new Set(), dropNext: 0, posts: 0 };
  net.fetch = async (u, o = {}) => {
    if (!net.online) throw new Error('offline');
    const c = new AbortController(); net.ctrls.add(c);
    if (o.signal) o.signal.addEventListener('abort', () => c.abort());
    const res = await fetch(u, Object.assign({}, o, { signal: c.signal }));
    if (o.method === 'POST' && /\/action$/.test(u)) { net.posts++; if (net.dropNext > 0) { net.dropNext--; throw new Error('the answer was lost'); } }
    return res;
  };
  net.set = (on) => { net.online = on; if (!on) for (const c of net.ctrls) c.abort(); };
  const env = { fetch: net.fetch, TextDecoder, AbortController };
  return { store: ctx.SB.store, SB: ctx.SB, touched, disk, net, env, E: ctx.SB.engine };
}
const join = (d, port, extra) => d.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, adopt: 'hub', name: 'Front' }, d.env, extra || {}));
const settled = (d, hub) => { const s = d.store.hubStatus(); return s.queued === 0 && s.seq === hub.snapshot().seq && d.store.pendingFor().tickets.length + d.store.pendingFor().orders.length + d.store.pendingFor().batches.length === 0; };
const tix = (n) => ({ customer: 'C' + n, items: [{ menuId: 'tea' }], allowPast: true });


test('review #1: Leave then Join the same hub in the same page: the next tap is applied, not dropped as a duplicate', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device();
  try {
    A.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
    assert.equal((await join(A, port, { name: 'A' })).ok, true);
    assert.equal(A.store.dispatch('createTicket', tix(1)), 'ok');
    const id1 = A.store.lastResult().opId;
    await until(() => settled(A, hub), 'the first tap to settle');
    assert.equal((await A.store.leaveHub()).ok, true);
    assert.equal((await join(A, port, { name: 'A' })).ok, true);
    assert.equal(A.store.dispatch('createTicket', tix(2)), 'ok');
    const id2 = A.store.lastResult().opId;
    assert.notEqual(id1, id2, 'an action id is never used twice in one page');
    await until(() => settled(A, hub), 'the second tap to settle');
    assert.deepEqual(Array.from(hub.snapshot().state.tickets, (t) => t.customer).sort(), ['C1', 'C2']);
    assert.deepEqual(Array.from(A.store.getState().tickets, (t) => t.customer).sort(), ['C1', 'C2']);
  } finally { A.store.destroy(); await hub.close(); }
});

test('review #4: taps queued while the hub was away are refused (hubChanged) when a different hub answers in the same session', async () => {
  const hubA = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hubA.listen(0);
  const A = device();
  let hubB = null;
  try {
    await join(A, port, { name: 'A' });
    await until(() => A.store.hubStatus().state === 'connected', 'connected');
    const refused = [];
    A.store.subscribeRefusals((r) => refused.push(r));
    A.net.set(false);
    await until(() => A.store.hubStatus().state === 'offline', 'offline');
    assert.equal(A.store.dispatch('createTicket', tix(9)), 'ok');
    assert.equal(A.store.hubStatus().queued, 1);
    await hubA.close();
    hubB = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 6000 });
    await hubB.listen(port);
    assert.notEqual(hubB.hubId, hubA.hubId);
    A.net.set(true);
    await until(() => refused.length === 1, 'the refusal', 12000);
    assert.equal(refused[0].report, 'hubChanged');
    await sleep(300);
    assert.equal(hubB.snapshot().state.tickets.length, 0, 'the new hub never saw the old kitchen\'s tap');
    assert.equal(A.store.hubStatus().queued, 0);
    await until(() => A.store.hubStatus().state === 'connected' && A.store.getState().tickets.length === 0, 'the screen shows the new hub\'s kitchen');
  } finally { A.store.destroy(); await hubA.close(); if (hubB) await hubB.close(); }
});

test('review #7: a full hub is not a permanent error: the screen says the kitchen is busy and connects when a place is free', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, maxClients: 1, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  try {
    assert.equal((await join(A, port, { name: 'A' })).ok, true);
    await until(() => A.store.hubStatus().state === 'connected', 'A connected');
    join(B, port, { name: 'B', tooManyRetryMs: 300 }).catch(() => {});
    await until(() => B.store.hubStatus().error === 'tooMany', 'B to see the hub is full');
    assert.notEqual(B.store.hubStatus().state, 'error', 'a full hub is retried, not fatal');
    assert.match(B.store.hubStatus().reason || '', /busy/i);
    A.store.destroy();                                 // a place is free again
    await until(() => B.store.hubStatus().state === 'connected', 'B to connect on a retry', 12000);
  } finally { B.store.destroy(); await hub.close(); }
});

test('review #12: leaving with force says how many unsent taps were dropped', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device();
  try {
    A.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
    await join(A, port, { name: 'A' });
    await until(() => A.store.hubStatus().state === 'connected', 'connected');
    A.net.set(false);
    await until(() => A.store.hubStatus().state === 'offline', 'offline');
    A.store.dispatch('createTicket', tix(1)); A.store.dispatch('createTicket', tix(2));
    const r = await A.store.leaveHub({ force: true });
    assert.deepEqual([r.ok, r.dropped], [true, 2]);
  } finally { A.store.destroy(); await hub.close(); }
});
