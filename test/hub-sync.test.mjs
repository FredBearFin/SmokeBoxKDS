// Two-client sync against the hub prototype, in Node, through the store transport interface (a2/transport):
// both clients converge, an offline client's queued actions replay after reconnect, a duplicate opId is applied once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/server.mjs';
import { hubTransport, newClient } from './_hub-transport.mjs';

const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A tiny in-memory storage like the one the store tests use.
function memStorage() {
  const m = new Map();
  return { persistent: true, m, get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } }, set(k, v) { m.set(k, JSON.stringify(v)); return true; }, remove(k) { m.delete(k); } };
}
// Polls until fn() is true, up to 3 s, so tests wait for real network round trips without fixed sleeps.
async function until(fn, what) { for (let i = 0; i < 150; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
// Starts a hub and two clients (each with its own store copy, storage and transport) on one shared fake clock.
async function rig() {
  const clock = { t: T0 };
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => clock.t });
  const port = await hub.listen(0);
  const mk = (id) => {
    const store = newClient(), transport = hubTransport(port, id);
    // Both devices start from the same state the hub holds (the prototype has no snapshot adoption yet).
    store.init({ now: () => clock.t, storage: memStorage(), noTimers: true, starter: true, transport });
    return { id, store, transport };
  };
  const A = mk('A'), B = mk('B');
  await sleep(50); // let both event streams open
  return { clock, hub, A, B, stop: async () => { A.store.destroy(); B.store.destroy(); await hub.close(); } };
}
// Arrays from the other VM context have another Array prototype, so copy them into this realm before comparing.
const names = (s) => Array.from(s.getState().tickets, (t) => t.customer).sort();
const order = (customer) => ({ customer, items: [{ menuId: 'tea' }] });

test('two clients converge when they act one after the other', async () => {
  const r = await rig();
  try {
    assert.equal(r.A.store.dispatch('createTicket', order('From A')), 'ok');
    await until(() => r.B.store.getState().tickets.length === 1, 'B to see the ticket from A');
    assert.equal(r.B.store.dispatch('createTicket', order('From B')), 'ok');
    await until(() => r.A.store.getState().tickets.length === 2, 'A to see the ticket from B');
    await until(() => r.hub.snapshot().state.tickets.length === 2 && r.A.store.outbox().length === 0 && r.B.store.outbox().length === 0, 'both outboxes to empty');
    assert.deepEqual(names(r.A.store), ['From A', 'From B']);
    assert.deepEqual(names(r.B.store), ['From A', 'From B']);
    // same tickets with the same numbers on all three (the hub and both clients)
    const nums = (s) => Array.from(s.tickets, (t) => t.num + ':' + t.customer);
    assert.deepEqual(nums(r.A.store.getState()), nums(r.hub.snapshot().state));
    assert.deepEqual(nums(r.B.store.getState()), nums(r.hub.snapshot().state));
  } finally { await r.stop(); }
});

test('an offline client queues actions and they replay after it reconnects', async () => {
  const r = await rig();
  try {
    r.B.transport.setOnline(false);
    r.clock.t += 1000;
    assert.equal(r.B.store.dispatch('createTicket', order('Offline 1')), 'ok');
    r.clock.t += 1000;
    assert.equal(r.B.store.dispatch('createTicket', order('Offline 2')), 'ok');
    assert.equal(r.B.store.outbox().length, 2);
    r.clock.t += 1000;
    assert.equal(r.A.store.dispatch('createTicket', order('While away')), 'ok');
    await until(() => r.hub.snapshot().state.tickets.length === 1, 'hub to take the online action');
    await sleep(100);
    assert.equal(r.hub.snapshot().state.tickets.length, 1, 'offline actions have not reached the hub');
    assert.deepEqual(names(r.B.store), ['Offline 1', 'Offline 2']);
    // reconnect: B pushes its queue and catches up on what it missed
    r.B.transport.setOnline(true);
    r.B.store.syncNow();
    await until(() => r.B.store.outbox().length === 0, 'B outbox to empty');
    await until(() => r.hub.snapshot().state.tickets.length === 3, 'hub to hold all three tickets');
    await until(() => r.A.store.getState().tickets.length === 3 && r.B.store.getState().tickets.length === 3, 'both clients to hold three tickets');
    assert.deepEqual(names(r.A.store), ['Offline 1', 'Offline 2', 'While away']);
    assert.deepEqual(names(r.B.store), ['Offline 1', 'Offline 2', 'While away']);
    assert.equal(r.B.transport.catchups, 1, 'B asked only for what it missed instead of a full snapshot');
  } finally { await r.stop(); }
});

// KNOWN GAP (prototype): the clients apply their own actions at once and other devices' actions when they arrive, while
// the hub applies everything in the order it received it. After a reconnect the three can hold the same tickets under
// different ticket numbers. Fixing it needs the client to adopt the hub's state (a snapshot message in the transport
// interface), which is not in a2/transport yet. This test records the gap and is marked todo so it does not fail the suite.
test('ticket numbers match everywhere after an offline replay', { todo: 'needs snapshot adoption in the transport interface' }, async () => {
  const r = await rig();
  try {
    r.B.transport.setOnline(false);
    r.B.store.dispatch('createTicket', order('Offline'));
    r.A.store.dispatch('createTicket', order('Online'));
    await until(() => r.hub.snapshot().state.tickets.length === 1, 'hub to take the online action');
    r.B.transport.setOnline(true); r.B.store.syncNow();
    await until(() => r.hub.snapshot().state.tickets.length === 2 && r.B.store.getState().tickets.length === 2 && r.A.store.getState().tickets.length === 2, 'all to hold two tickets');
    const nums = (s) => Array.from(s.tickets, (t) => t.num + ':' + t.customer).sort();
    assert.deepEqual(nums(r.B.store.getState()), nums(r.hub.snapshot().state));
  } finally { await r.stop(); }
});

test('a duplicate opId is applied once, whether re-sent by a client or by a retry', async () => {
  const r = await rig();
  try {
    assert.equal(r.A.store.dispatch('createTicket', order('Once')), 'ok');
    const entry = r.A.store.outbox()[0] || { opId: r.A.store.lastResult().opId, type: 'createTicket', payload: order('Once'), now: T0 };
    await until(() => r.hub.snapshot().state.tickets.length === 1 && r.A.store.outbox().length === 0, 'first delivery');
    // a lost acknowledgement makes the client send the same entry again
    const again = await r.A.transport.push([entry]);
    assert.deepEqual(again.acked, [entry.opId]);
    await sleep(100);
    assert.equal(r.hub.snapshot().state.tickets.length, 1);
    assert.equal(r.B.store.getState().tickets.length, 1);
    // the same hub message delivered twice (a reconnect overlap) is applied once by the client store
    const msg = { type: 'action', opId: 'Z:1', actionType: 'createTicket', payload: order('Remote'), now: T0 };
    r.B.transport.inject(msg); r.B.transport.inject(msg);
    assert.equal(r.B.store.getState().tickets.length, 2);
    assert.equal(r.B.store.outbox().length, 0, 'a remote action is never queued back to the hub');
  } finally { await r.stop(); }
});
