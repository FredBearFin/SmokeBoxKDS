// Voice call-out logic: what is worth saying, the station filter, the one-at-a-time queue and stale calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '25-deadlines']);
const D = SB.deadlines;
const T0 = Date.UTC(2026, 9, 12, 16, 0, 0);

// A tiny state with one active ticket: a pit dish at once, a pit dish paced 5 minutes later, a fry dish paced later.
function state(extra) {
  const items = [
    { id: 'i1', short: 'Brisket', name: 'Brisket plate', qty: 2, zone: 'pit', status: 'cooking', fireAt: T0 },
    { id: 'i2', short: 'Ribs', name: 'Ribs', qty: 1, zone: 'pit', status: 'queued', fireAt: T0 + 300e3 },
    { id: 'i3', short: 'Hush puppies', name: 'Hush puppies', qty: 1, zone: 'fry', status: 'queued', fireAt: T0 + 240e3 },
  ];
  return { tickets: [Object.assign({ id: 't1', num: 12, status: 'active', createdAt: T0, items }, extra || {})] };
}

test('wants: a new ticket is called for the all view with the item count, and a paced dish is not called before its time', () => {
  const w = D.calloutWants(state(), T0 + 1000, 'all');
  assert.deepEqual(w.map((x) => x.id), ['n:t1']);
  assert.equal(w[0].text, 'New ticket 12, 3 items.');
});

test('wants: when a paced dish is due it gets a start-now call naming the dish and the ticket', () => {
  const s = state();
  s.tickets[0].items[1].status = 'displayed';
  const w = D.calloutWants(s, T0 + 301e3, 'all');
  const st = w.find((x) => x.kind === 'start');
  assert.equal(st.id, 's:i2');
  assert.equal(st.text, 'Start Ribs now. Ticket 12.');
  assert.equal(st.at, T0 + 300e3);
});

test('wants: a dish that starts with the ticket never gets a start call (the new-ticket call covers it)', () => {
  const s = state();
  s.tickets[0].items[0].status = 'displayed';
  assert.equal(D.calloutWants(s, T0 + 5000, 'all').filter((x) => x.kind === 'start').length, 0);
});

test('station filter: a station only hears its own dishes, and a ticket with nothing for it is silent', () => {
  const s = state();
  s.tickets[0].items[1].status = 'displayed'; s.tickets[0].items[2].status = 'displayed';
  const fry = D.calloutWants(s, T0 + 400e3, 'fry');
  assert.deepEqual(fry.map((x) => x.id).sort(), ['n:t1', 's:i3']);
  assert.equal(fry.find((x) => x.kind === 'new').text, 'New ticket 12: Hush puppies.');
  const pit = D.calloutWants(s, T0 + 400e3, 'pit');
  assert.equal(pit.find((x) => x.kind === 'new').text, 'New ticket 12: 2 Brisket, Ribs.');
  assert.deepEqual(pit.filter((x) => x.kind === 'start').map((x) => x.id), ['s:i2']);
  assert.deepEqual(D.calloutWants(s, T0 + 400e3, 'cold'), []);
});

test('station filter: the expo tab hears new tickets only, never start calls', () => {
  const s = state();
  s.tickets[0].items[1].status = 'displayed';
  const w = D.calloutWants(s, T0 + 400e3, 'expo');
  assert.deepEqual(w.map((x) => x.kind), ['new']);
});

test('wants: bumped tickets and finished dishes make no call', () => {
  const s = state({ status: 'expedited' });
  assert.deepEqual(D.calloutWants(s, T0, 'all'), []);
});

test('queue: one call at a time, oldest first, and each call is handed out once', () => {
  const q = D.makeCallouts();
  q.sync([{ id: 'b', at: T0 + 2000, text: 'B' }, { id: 'a', at: T0 + 1000, text: 'A' }], T0 + 3000);
  assert.equal(q.next(T0 + 3000).text, 'A');
  assert.equal(q.next(T0 + 3000).text, 'B');
  assert.equal(q.next(T0 + 3000), null);
  q.sync([{ id: 'a', at: T0 + 1000, text: 'A' }], T0 + 4000);
  assert.equal(q.next(T0 + 4000), null, 'a call already handed out is not repeated');
});

test('queue: a call that is stale when it arrives, or while it waits, is dropped not read late', () => {
  const q = D.makeCallouts({ staleMs: 30e3 });
  q.sync([{ id: 'old', at: T0, text: 'old' }, { id: 'fresh', at: T0 + 50e3, text: 'fresh' }], T0 + 60e3);
  assert.equal(q.size(), 1);
  assert.equal(q.next(T0 + 95e3), null, 'fresh waited 45 s, longer than the limit');
  assert.equal(q.dropped(), 2);
});

test('queue: a call whose reason is gone (ticket bumped, dish started) is dropped before it is spoken', () => {
  const q = D.makeCallouts();
  q.sync([{ id: 'x', at: T0, text: 'X' }, { id: 'y', at: T0, text: 'Y' }], T0 + 1000);
  q.sync([{ id: 'y', at: T0, text: 'Y' }], T0 + 2000);
  assert.equal(q.next(T0 + 2000).text, 'Y');
  assert.equal(q.next(T0 + 2000), null);
});

test('queue: a rush keeps only the newest few waiting calls', () => {
  const q = D.makeCallouts({ maxWait: 3 });
  const ws = [1, 2, 3, 4, 5].map((i) => ({ id: 'c' + i, at: T0 + i * 1000, text: 'C' + i }));
  q.sync(ws, T0 + 6000);
  assert.deepEqual([q.next(T0 + 6000).id, q.next(T0 + 6000).id, q.next(T0 + 6000).id], ['c3', 'c4', 'c5']);
});

test('prime: what is already true when call-outs start is not read out, but later arrivals are', () => {
  const q = D.makeCallouts();
  q.prime([{ id: 'n:t1', at: T0, text: 'old' }]);
  q.sync([{ id: 'n:t1', at: T0, text: 'old' }, { id: 'n:t2', at: T0 + 5000, text: 'new' }], T0 + 6000);
  assert.equal(q.next(T0 + 6000).text, 'new');
  assert.equal(q.next(T0 + 6000), null);
});
