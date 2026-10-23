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
  // Wait until both event streams have really opened (each gets a snapshot first); a fixed sleep is too short on a loaded machine.
  await until(() => A.transport.snapshots >= 1 && B.transport.snapshots >= 1, 'both event streams to open');
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
    await until(() => r.B.store.outbox().length === 0, 'B outbox to empty');
    assert.deepEqual(nums(r.B.store.getState()), nums(r.hub.snapshot().state));
    assert.deepEqual(nums(r.A.store.getState()), nums(r.hub.snapshot().state));
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
    assert.equal(r.B.transport.snapshots >= 2, true, 'B took a fresh snapshot of the hub when it reconnected');
  } finally { await r.stop(); }
});

// After an offline replay the hub's order wins: the store adopts the hub state (transport 'state' message) and replays its
// own unconfirmed actions on top, so ticket numbers match on the hub and both clients.
test('ticket numbers match everywhere after an offline replay', async () => {
  const r = await rig();
  try {
    r.B.transport.setOnline(false);
    r.B.store.dispatch('createTicket', order('Offline'));
    r.A.store.dispatch('createTicket', order('Online'));
    await until(() => r.hub.snapshot().state.tickets.length === 1, 'hub to take the online action');
    r.B.transport.setOnline(true); r.B.store.syncNow();
    await until(() => r.hub.snapshot().state.tickets.length === 2 && r.B.store.getState().tickets.length === 2 && r.A.store.getState().tickets.length === 2, 'all to hold two tickets');
    const nums = (s) => Array.from(s.tickets, (t) => t.num + ':' + t.customer).sort();
    await until(() => r.B.store.outbox().length === 0, 'B outbox to empty');
    assert.deepEqual(nums(r.B.store.getState()), nums(r.hub.snapshot().state));
    assert.deepEqual(nums(r.A.store.getState()), nums(r.hub.snapshot().state));
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

// Start over on an offline client: the actions it queued for the erased kitchen are dropped (the hub never sees those customers),
// the erase itself is still sent so the hub is emptied too, and a failed Start over leaves the queue alone.
test('Start over drops the erased kitchen\'s queued actions but still sends the erase', async () => {
  const r = await rig();
  try {
    r.B.transport.setOnline(false);
    r.clock.t += 1000;
    assert.equal(r.B.store.dispatch('createTicket', order('Secret 1')), 'ok');
    r.clock.t += 1000;
    assert.equal(r.B.store.dispatch('createTicket', order('Secret 2')), 'ok');
    assert.equal(r.B.store.outbox().length, 2);
    // a refused Start over (wrong word) changes nothing
    assert.equal(r.B.store.startOver({ backupSaved: { filename: 'b.json', chars: 1 }, confirm: 'nope' }).ok, false);
    assert.equal(r.B.store.outbox().length, 2);
    r.clock.t += 1000;
    const res = r.B.store.startOver({ backupSaved: { filename: 'b.json', chars: 1 }, confirm: r.B.store.START_OVER_WORD });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(Array.from(r.B.store.outbox(), (x) => x.type), ['resetLive']);
    assert.equal(r.B.store.getState().tickets.length, 0);
    r.B.transport.setOnline(true); r.B.store.syncNow();
    await until(() => r.B.store.outbox().length === 0, 'B outbox to empty');
    await sleep(100);
    assert.equal(JSON.stringify(r.hub.snapshot().state).includes('Secret'), false, 'the erased customers never reached the hub');
    assert.equal(r.hub.snapshot().state.tickets.length, 0);
    assert.equal(r.B.store.getState().tickets.length, 0);
  } finally { await r.stop(); }
});
