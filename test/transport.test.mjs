// Store transport: opIds, the saved outbox of unconfirmed actions, retry/back-off, and a pluggable transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E } = SB;
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny in-memory storage like the one the store tests use.
function memStorage() {
  const m = new Map();
  return {
    persistent: true, m,
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    set(k, v) { m.set(k, JSON.stringify(v)); return true; },
    remove(k) { m.delete(k); },
  };
}
// A fake transport that records what it is given. push() behaviour is set by the test.
function fakeTransport(pushFn) {
  const t = {
    opened: 0, closed: 0, posted: [], deliver: null,
    open(d) { t.opened++; t.deliver = d; return true; },
    post(m) { t.posted.push(m); return true; },
    close() { t.closed++; },
  };
  if (pushFn) t.push = pushFn;
  return t;
}
const order = { items: [{ menuId: 'tea' }] };

test('every dispatch carries an opId, and refused actions get one too', () => {
  const clock = { real: T0 };
  S.init({ now: () => clock.real, storage: memStorage(), noTimers: true, noSync: true });
  const a = S.dispatchEx('createTicket', order);
  const b = S.dispatchEx('createTicket', { items: [] });
  assert.equal(a.report, 'ok');
  assert.equal(b.report, 'emptyOrder');
  assert.match(a.opId, /^tab_.+:\d+$/);
  assert.notEqual(a.opId, b.opId);
  assert.equal(S.lastResult().opId.startsWith('tab_'), true);
  assert.deepEqual(S.outbox(), []); // no transport that can push: nothing is queued
  S.destroy();
});

test('with a pushing transport, actions queue, persist, and leave the outbox when acknowledged', async () => {
  const clock = { real: T0 };
  const storage = memStorage();
  let reply = null; const seen = [];
  const t = fakeTransport((entries) => { seen.push(entries.map((e) => e.opId)); return reply ? reply(entries) : Promise.reject(new Error('offline')); });
  S.init({ now: () => clock.real, storage, noTimers: true, transport: t });
  const a = S.dispatchEx('createTicket', order);
  S.dispatchEx('createTicket', { items: [] }); // refused: not queued
  S.dispatchEx('createTicket', order, { source: 'sim' }); // simulator traffic: not queued
  assert.deepEqual(S.outbox().map((x) => x.opId).length, 1);
  assert.equal(S.outbox()[0].opId, a.opId);
  assert.equal(JSON.parse(storage.m.get('smokebox.v1.outbox'))[0].opId, a.opId); // survives a reload
  await sleep(20);
  assert.equal(seen.length, 1); // the offline push failed, so the action stays queued
  assert.equal(S.outbox().length, 1);
  // back-off: an immediate retry does nothing, syncNow forces one
  clock.real += 100; S.tick();
  assert.equal(seen.length, 1);
  reply = (entries) => Promise.resolve({ acked: entries.map((e) => e.opId) });
  S.syncNow();
  await sleep(20);
  assert.equal(seen.length, 2);
  assert.deepEqual(S.outbox(), []);
  assert.deepEqual(JSON.parse(storage.m.get('smokebox.v1.outbox')), []);
  S.destroy();
  assert.equal(t.closed, 1);
});

test('a restart keeps unconfirmed actions and the server can ack through deliver', async () => {
  const clock = { real: T0 };
  const storage = memStorage();
  const t1 = fakeTransport(() => Promise.reject(new Error('offline')));
  S.init({ now: () => clock.real, storage, noTimers: true, transport: t1 });
  const a = S.dispatchEx('createTicket', order).opId;
  const b = S.dispatchEx('createTicket', order).opId;
  S.flush(); S.destroy();
  const t2 = fakeTransport(() => new Promise(() => {})); // never answers
  S.init({ now: () => clock.real, storage, noTimers: true, transport: t2 });
  assert.deepEqual(S.outbox().map((x) => x.opId), [a, b]);
  t2.deliver({ type: 'ack', opIds: [a] });
  assert.deepEqual(S.outbox().map((x) => x.opId), [b]);
  S.destroy();
});

test('a remote action is applied once and is not queued again', () => {
  const clock = { real: T0 };
  const t = fakeTransport(() => Promise.reject(new Error('offline')));
  S.init({ now: () => clock.real, storage: memStorage(), noTimers: true, transport: t });
  const msg = { type: 'action', tab: 'other', opId: 'other:1', actionType: 'createTicket', payload: order, now: T0 };
  t.deliver(msg); t.deliver(msg);
  assert.equal(S.getState().tickets.length, 1);
  assert.equal(S.outbox().length, 0);
  assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
  t.deliver({ type: 'action', tab: 'other', opId: 'other:2', actionType: 'nope', payload: {} });
  assert.equal(S.getState().tickets.length, 1);
  S.destroy();
});

test('a custom transport receives saved announcements, a failed open runs alone, and a factory works', () => {
  const clock = { real: T0 };
  const t = fakeTransport();
  S.init({ now: () => clock.real, storage: memStorage(), noTimers: true, transport: () => t });
  assert.equal(S.canBroadcast(), true);
  S.dispatch('createTicket', order);
  S.flush();
  assert.equal(t.posted.some((m) => m.type === 'saved' && m.tab === S.tabId), true);
  assert.equal(S.broadcast({ type: 'alert-hello' }), true);
  assert.equal(t.posted.at(-1).tab, S.tabId);
  S.destroy();
  const dead = fakeTransport(); dead.open = () => false;
  S.init({ now: () => clock.real, storage: memStorage(), noTimers: true, transport: dead });
  assert.equal(S.canBroadcast(), false);
  assert.equal(S.dispatch('createTicket', order), 'ok');
  S.destroy();
});
