// Stage 2: screens that write through the hub. Two or three stores plus the real hub: prediction then the hub's answer, the hub's order
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

test('joining needs an explicit choice; a non-empty hub refuses a seed and nothing is sent; probe says whether the hub is empty', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 });
  const port = await hub.listen(0);
  const d = device();
  d.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
  try {
    assert.equal((await join(d, port, { adopt: undefined })).error, 'choiceRequired');
    assert.equal((await join(d, port, { seed: true })).error, 'choiceRequired');                  // both given
    const p = await d.store.probeHub(Object.assign({ url: 'http://127.0.0.1:' + port }, d.env));
    assert.deepEqual([p.ok, p.empty, typeof p.hubId], [true, true, 'string']);
    // somebody else already used this hub
    await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'createTicket', payload: tix(1), opId: 'x1' }) });
    const p2 = await d.store.probeHub(Object.assign({ url: 'http://127.0.0.1:' + port }, d.env));
    assert.equal(p2.empty, false);
    const before = JSON.stringify(plain(d.store.getState()));
    const r = await d.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, seed: true }, d.env));
    assert.deepEqual([r.ok, r.error], [false, 'notEmpty']);
    assert.equal(d.store.isHubClient(), false); assert.equal(JSON.stringify(plain(d.store.getState())), before, 'the device kept its own kitchen');
    assert.equal(hub.snapshot().state.tickets.length, 1, 'the hub kept its own kitchen');
  } finally { d.store.destroy(); await hub.close(); }
});

test('seed: a device sends its own kitchen to an empty hub, then shows it from memory; its saved kitchen stays untouched and comes back when it leaves', async () => {
  const hub = await createHub({ dataFile: null, starter: false, tickMs: 600000, heartbeatMs: 200, now: () => T0 });
  const port = await hub.listen(0);
  const d = device();
  d.store.init({ now: () => T0, noTimers: true, noSync: true, blank: true });
  assert.equal(d.store.dispatch('addMenuItem', { name: 'Latte', zone: 'cold', cat: 'cold', price: 4, prepSec: 60, track: 'one' }), 'ok');
  d.store.flush();
  const savedBefore = d.disk.get('smokebox.v1.state');
  assert.ok(savedBefore && savedBefore.includes('Latte'));
  try {
    const r = await d.store.initHubClient(Object.assign({ url: 'http://127.0.0.1:' + port, seed: true, name: 'Pit' }, d.env));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(hub.snapshot().state.menu.some((m) => m.name === 'Latte'), true, 'the hub now holds the device\'s kitchen');
    assert.equal(d.store.hubStatus().state, 'connected');
    assert.equal((await d.store.probeHub(Object.assign({ url: 'http://127.0.0.1:' + port }, d.env))).empty, false, 'a second device cannot seed over it, even at change number 0');
    const id = d.store.getState().menu.find((m) => m.name === 'Latte').id;
    assert.equal(d.store.dispatch('createTicket', { customer: 'Hub only', items: [{ menuId: id }], allowPast: true }), 'ok');
    await until(() => settled(d, hub), 'the tap to settle');
    d.store.flush();
    assert.equal(d.disk.get('smokebox.v1.state'), savedBefore, 'nothing of the hub session reached the device\'s saved kitchen');
    assert.equal(d.touched.some(([op, k]) => op === 'set' && /smokebox\.v1\.(state|outbox|lastgood)/.test(k) && d.disk.get(k) !== savedBefore && k === 'smokebox.v1.state'), false);
    const left = await d.store.leaveHub();
    assert.equal(left.ok, true);
    assert.equal(d.store.isHubClient(), false);
    assert.equal(d.store.getState().tickets.length, 0, 'the device\'s own kitchen is back, without the hub\'s ticket');
    assert.ok(d.store.getState().menu.some((m) => m.name === 'Latte'));
  } finally { d.store.destroy(); await hub.close(); }
  // a second seed of the same hub after a restart is also refused
});

test('a tap shows at once as a prediction, the hub\'s answer settles it, and both screens end in the hub\'s exact state; the screen name is on the events', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  try {
    assert.equal((await join(A, port, { name: 'Front' })).ok, true);
    assert.equal((await join(B, port, { name: 'Pit' })).ok, true);
    assert.equal(A.store.dispatch('createTicket', tix(1)), 'ok');
    assert.equal(A.store.getState().tickets.length, 1, 'shown at once, before the hub has answered');
    assert.equal(A.store.hubStatus().queued, 1); assert.equal(B.store.getState().tickets.length, 0);
    await until(() => settled(A, hub) && settled(B, hub), 'both to settle');
    assert.equal(B.store.getState().tickets.length, 1);
    assert.deepEqual(plain(A.store.getState()), plain(hub.snapshot().state));
    assert.deepEqual(plain(B.store.getState()), plain(hub.snapshot().state));
    const ev = hub.snapshot().state.events.find((e) => e.type === 'ticket_created' || e.type === 'ticket_in' || /ticket/.test(e.type) && e.screen);
    assert.equal(hub.snapshot().state.events.filter((e) => e.screen === 'Front').length > 0, true);
    assert.equal(hub.snapshot().state.events.some((e) => e.screen === 'Pit'), false);
    assert.equal(A.store.hubStatus().state, 'connected');
    void ev;
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('conflicts: the same ticket bumped from two screens, the same order paid twice, the same batch cooled twice each give one winner and a plain refusal', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 200, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  const refA = [], refB = [];
  try {
    await join(A, port, { name: 'A' }); await join(B, port, { name: 'B' });
    A.store.subscribeRefusals((r) => refA.push(r)); B.store.subscribeRefusals((r) => refB.push(r));
    A.store.dispatch('createTicket', tix(1));
    await until(() => settled(A, hub) && settled(B, hub) && B.store.getState().tickets.length === 1, 'the ticket on both');
    const t = A.store.getState().tickets[0];
    for (const it of t.items) { assert.equal(A.store.dispatch('completeItem', { ticketId: t.id, itemId: it.id }), 'ok'); }
    await until(() => settled(A, hub) && settled(B, hub), 'items done');
    // both screens bump in the same moment: both predicted ok locally
    const a = A.store.dispatchEx('bumpTicket', { ticketId: t.id }), b = B.store.dispatchEx('bumpTicket', { ticketId: t.id });
    assert.equal(a.report, 'ok'); assert.equal(b.report, 'ok');
    await until(() => settled(A, hub) && settled(B, hub), 'the bump race to settle');
    const bumps = hub.snapshot().state.events.filter((e) => e.type === 'ticket_expedited' && e.ticketId === t.id);
    assert.equal(bumps.length, 1, 'exactly one winner');
    assert.equal(refA.length + refB.length, 1, 'exactly one refusal');
    const ref = refA[0] || refB[0];
    assert.equal(ref.type, 'bumpTicket'); assert.equal(ref.ticketId, t.id); assert.ok(ref.text && ref.text.length > 10, ref.text); assert.ok(ref.report);
    assert.equal((refA[0] ? A : B).store.getState().tickets.find((x) => x.id === t.id).status, 'expedited', 'the loser now shows the hub\'s result');
    // pay the same order twice
    A.store.dispatch('createTicket', tix(2));
    await until(() => settled(A, hub) && settled(B, hub) && A.store.getState().orders.some((o) => o.status === 'open' && o.id !== t.orderId), 'a second order');
    const o2 = A.store.getState().orders.find((o) => o.status === 'open' && o.id !== t.orderId);
    refA.length = 0; refB.length = 0;
    const pa = A.store.dispatchEx('payOrder', { orderId: o2.id, method: 'cash' }), pb = B.store.dispatchEx('payOrder', { orderId: o2.id, method: 'card' });
    assert.equal(pa.report === 'ok' || pb.report === 'ok', true);
    await until(() => settled(A, hub) && settled(B, hub), 'the payment race to settle');
    assert.equal(hub.snapshot().state.events.filter((e) => e.type === 'order_paid' && e.orderId === o2.id).length, 1);
    assert.equal(refA.length + refB.length, 1);
    const winnerMethod = hub.snapshot().state.orders.find((o) => o.id === o2.id).method;
    assert.equal(A.store.getState().orders.find((o) => o.id === o2.id).method, winnerMethod);
    assert.equal(B.store.getState().orders.find((o) => o.id === o2.id).method, winnerMethod);
    // cool the same batch from both screens
    const hot = hub.snapshot().state.batches.find((x) => x.kind === 'hot' && x.remainingG > 0);
    refA.length = 0; refB.length = 0;
    A.store.dispatch('startCooling', { batchId: hot.id }); B.store.dispatch('startCooling', { batchId: hot.id });
    await until(() => settled(A, hub) && settled(B, hub), 'the cooling race to settle');
    assert.equal(hub.snapshot().state.events.filter((e) => e.type === 'cooling_started' && e.from === hot.id).length, 1);
    assert.equal(refA.length + refB.length, 1);
    assert.deepEqual(plain(A.store.getState()), plain(hub.snapshot().state)); assert.deepEqual(plain(B.store.getState()), plain(hub.snapshot().state));
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('offline: taps queue and show, the other screen acts meanwhile, and on reconnect the hub answers each in order; the hub\'s order wins', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device(), B = device();
  const refB = [];
  try {
    await join(A, port, { name: 'A' }); await join(B, port, { name: 'B', staleMs: 60000 });
    B.store.subscribeRefusals((r) => refB.push(r));
    A.store.dispatch('createTicket', tix(1));
    await until(() => settled(A, hub) && settled(B, hub) && B.store.getState().tickets.length === 1, 'the ticket on both');
    const t = A.store.getState().tickets[0];
    for (const it of t.items) A.store.dispatch('completeItem', { ticketId: t.id, itemId: it.id });
    await until(() => settled(A, hub) && settled(B, hub), 'items done');
    B.net.set(false);                                                              // B loses its network
    await until(() => B.store.hubStatus().state === 'offline', 'B to notice');
    assert.equal(B.store.dispatch('bumpTicket', { ticketId: t.id }), 'ok');        // B bumps the ticket while offline (predicted)
    assert.equal(B.store.dispatch('createTicket', tix(9)), 'ok');
    assert.equal(B.store.getState().tickets.length, 2); assert.equal(B.store.hubStatus().queued, 2); assert.equal(B.store.hubStatus().state, 'offline');
    assert.deepEqual(plain(B.store.pendingFor().tickets), [t.id]);
    assert.equal(A.store.dispatch('bumpTicket', { ticketId: t.id }), 'ok');         // A bumps the same ticket first, on the hub
    await until(() => settled(A, hub), 'A settled');
    B.net.set(true);
    await until(() => settled(B, hub) && B.store.hubStatus().state === 'connected', 'B to catch up', 12000);
    assert.equal(refB.length, 1, 'B\'s offline bump was refused; its new ticket was applied');
    assert.equal(refB[0].type, 'bumpTicket'); assert.ok(refB[0].text);
    assert.equal(hub.snapshot().state.tickets.filter((x) => x.customer === 'C9').length, 1);
    assert.equal(hub.snapshot().state.events.filter((e) => e.type === 'ticket_expedited' && e.ticketId === t.id).length, 1);
    await until(() => A.store.getState().tickets.length === 2, 'A to see B\'s ticket');
    assert.deepEqual(plain(B.store.getState()), plain(hub.snapshot().state)); assert.deepEqual(plain(A.store.getState()), plain(hub.snapshot().state));
  } finally { A.store.destroy(); B.store.destroy(); await hub.close(); }
});

test('a lost answer: the tap is resent and the hub answers it as a duplicate; a hub restart in the middle changes nothing and loses nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-'));
  const file = path.join(dir, 'state.json');
  let clock = T0 + 5000;
  const h1 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 150, saveMs: 3600000, now: () => clock });
  const port = await h1.listen(0);
  const A = device();
  try {
    await join(A, port, { name: 'A' });
    A.net.dropNext = 1;                                                           // the hub will apply the tap but the answer is lost
    A.store.dispatch('createTicket', tix(1));
    await until(() => settled(A, h1) && A.net.posts >= 1 && A.store.hubStatus().state === 'connected', 'the tap to settle', 12000);
    assert.equal(h1.snapshot().state.tickets.length, 1, 'applied once, not twice');
    // taps while the hub is down, then it comes back from its record on the same port
    await h1.crash();
    await until(() => A.store.hubStatus().state === 'offline', 'offline');
    A.store.dispatch('createTicket', tix(2)); A.store.dispatch('createTicket', tix(3));
    assert.equal(A.store.getState().tickets.length, 3); assert.equal(A.store.hubStatus().queued, 2);
    const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => clock });
    await h2.listen(port);
    try {
      assert.equal(h2.hubId, h1.hubId); assert.equal(h2.replayed, 1);
      await until(() => settled(A, h2), 'the queue to be answered by the restarted hub', 15000);
      assert.deepEqual(Array.from(h2.snapshot().state.tickets, (t) => t.customer), ['C1', 'C2', 'C3']);
      assert.deepEqual(plain(A.store.getState()), plain(h2.snapshot().state));
    } finally { await h2.close(); }
  } finally { A.store.destroy(); }
});

test('a reload keeps the queued taps in the device\'s hub queue and sends them once; a different hub history drops them with a plain report', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const A = device();
  try {
    await join(A, port, { name: 'A' });
    await until(() => A.store.hubStatus().state === 'connected', 'connected');
    A.net.set(false);
    await until(() => A.store.hubStatus().state === 'offline', 'offline');
    A.store.dispatch('createTicket', tix(1)); A.store.dispatch('createTicket', tix(2));
    const saved = JSON.parse(A.disk.get('smokebox.v1.hubqueue'));
    assert.equal(saved.entries.length, 2); assert.equal(saved.hubId, hub.hubId);
    A.store.destroy();                                                            // the page is reloaded
    const A2 = device({ 'smokebox.v1.hubqueue': A.disk.get('smokebox.v1.hubqueue') });
    try {
      await join(A2, port, { name: 'A' });
      await until(() => settled(A2, hub) && hub.snapshot().state.tickets.length === 2, 'the saved taps to be sent', 10000);
      assert.deepEqual(Array.from(hub.snapshot().state.tickets, (t) => t.customer), ['C1', 'C2']);
      assert.equal(A2.disk.get('smokebox.v1.hubqueue'), undefined, 'the queue is cleared once answered');
    } finally { A2.store.destroy(); }
    // a queue that belongs to another hub history is not sent
    const stale = JSON.stringify({ v: 1, url: 'http://127.0.0.1:' + port, hubId: 'otherhub', entries: [{ opId: 'old:1', type: 'createTicket', payload: tix(7), now: T0 }] });
    const A3 = device({ 'smokebox.v1.hubqueue': stale });
    const refused = [];
    A3.store.subscribeRefusals((r) => refused.push(r));
    try {
      const ready = join(A3, port, { name: 'A' });
      await ready;
      await until(() => refused.length === 1, 'the refusal');
      assert.equal(refused[0].report, 'hubChanged'); assert.match(refused[0].text, /reset|changed/);
      assert.equal(hub.snapshot().state.tickets.some((t) => t.customer === 'C7'), false);
    } finally { A3.store.destroy(); }
  } finally { await hub.close(); }
});

test('random multi-writer run: three screens tapping at random, with an outage, all end in the hub\'s exact state with nothing pending', async () => {
  let clock = T0 + 5000;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 25, heartbeatMs: 150, now: () => clock });
  const port = await hub.listen(0);
  const devs = [device(), device(), device()];
  try {
    for (let i = 0; i < 3; i++) assert.equal((await join(devs[i], port, { name: 'S' + i })).ok, true);
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const menu = hub.snapshot().state.menu.map((m) => m.id);
    for (let i = 0; i < 90; i++) {
      clock += Math.round(rnd() * 40000);
      const d = devs[Math.floor(rnd() * 3)], s = d.store.getState();
      const open = s.tickets.filter((t) => t.status === 'active');
      if (i === 30) devs[2].net.set(false);
      if (i === 60) devs[2].net.set(true);
      const roll = rnd();
      if (roll < 0.3 || !open.length) d.store.dispatch('createTicket', { customer: 'R' + i, items: [{ menuId: menu[Math.floor(rnd() * menu.length)] }], allowPast: true });
      else if (roll < 0.6) { const t = open[Math.floor(rnd() * open.length)]; const it = t.items.find((x) => x.status !== 'done'); if (it) d.store.dispatch('advanceItem', { ticketId: t.id, itemId: it.id }); }
      else if (roll < 0.8) d.store.dispatch('bumpTicket', { ticketId: open[Math.floor(rnd() * open.length)].id });
      else if (roll < 0.9) d.store.dispatch('toggle86', { menuId: menu[Math.floor(rnd() * menu.length)], on: rnd() < 0.5 });
      else d.store.dispatch('pullBatch', { ing: 'pork', g: 150 });
      if (i % 6 === 5) await sleep(40);
    }
    devs[2].net.set(true);
    clock += 3 * 3600e3;
    await until(() => devs.every((d) => d.store.hubStatus().queued === 0 && d.store.hubStatus().seq === hub.snapshot().seq && d.store.hubStatus().state === 'connected'), 'everything to settle', 20000);
    await sleep(100);
    await until(() => devs.every((d) => d.store.hubStatus().seq === hub.snapshot().seq), 'the final tick');
    for (const d of devs) { assert.deepEqual(plain(d.store.getState()), plain(hub.snapshot().state)); assert.equal(d.store.pendingFor().tickets.length, 0); }
    assert.ok(hub.snapshot().seq > 30);
    assert.equal(hub.snapshot().state.events.some((e) => e.screen === 'S0') && hub.snapshot().state.events.some((e) => e.screen === 'S2'), true);
  } finally { for (const d of devs) d.store.destroy(); await hub.close(); }
});

test('the write code: a wrong code is refused (badCode) and nothing is sent; leaving with unanswered taps needs force; erase and restore are refused as hubKitchen', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, heartbeatMs: 150, writeCode: 'WRITE1', now: () => T0 + 5000 });
  const port = await hub.listen(0);
  const bad = device();
  try {
    const r = await join(bad, port, { code: 'nope' });
    assert.deepEqual([r.ok, r.error], [false, 'badCode']);
    assert.equal(bad.store.isHubClient(), false);
    const open = await fetch('http://127.0.0.1:' + port + '/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'createTicket', payload: tix(1), opId: 'z1' }) });
    assert.equal(open.status, 403);
    assert.equal(hub.snapshot().state.tickets.length, 0);
  } finally { bad.store.destroy(); }
  const A = device();
  try {
    assert.equal((await join(A, port, { code: 'WRITE1' })).ok, true);
    assert.equal(A.store.dispatch('resetLive', {}), 'hubKitchen');
    assert.equal(A.store.importAll('{}'), 'hubKitchen'); assert.equal(A.store.reset(), 'hubKitchen'); assert.equal(A.store.startOver({ confirm: A.store.START_OVER_WORD }).report, 'hubKitchen');
    assert.match(A.E.describe('hubKitchen', {}), /shared kitchen/);
    A.net.set(false);
    await until(() => A.store.hubStatus().state === 'offline', 'offline');
    A.store.dispatch('createTicket', tix(5));
    const leave = await A.store.leaveHub();
    assert.deepEqual([leave.ok, leave.error, leave.pending], [false, 'pending', 1]);
    assert.equal((await A.store.leaveHub({ force: true })).ok, true);
    assert.equal(A.disk.get('smokebox.v1.hubqueue'), undefined);
    assert.equal(A.store.isHubClient(), false);
  } finally { A.store.destroy(); await hub.close(); }
});
