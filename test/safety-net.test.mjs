// The safety net: the rolling last-good copy, restore from it when the live save is damaged, the slow-save back-off, and the
// 30-day clean-up of a set-aside damaged copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E } = SB;
const T = 1780326000000, H = 3600e3, DAY = 24 * H;
const PIN = 'sha256:' + 'ef56'.repeat(16);
// A storage with a total capacity in characters (like a browser's quota) that logs what is written.
function capStorage(cap, delayMs) {
  const m = new Map(), writes = [];
  const used = () => Array.from(m.values()).reduce((a, v) => a + v.length, 0);
  return { m, writes, persistent: true, used, get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f), raw: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => {
      const raw = JSON.stringify(v);
      if (delayMs) { const e = Date.now() + delayMs; while (Date.now() < e) { /* a slow disk */ } }
      if (used() - (m.has(k) ? m.get(k).length : 0) + raw.length > cap) return false;
      writes.push(k); m.set(k, raw); return true;
    },
    remove: (k) => { m.delete(k); }, keys: (p) => Array.from(m.keys()).filter((k) => k.indexOf(p) === 0) };
}
let clock = T;
const start = (b, mode) => S.init({ storage: b, mode: mode || 'real', blank: true, noTimers: true, noSync: true, now: () => clock });
// Adds n finished, bumped, paid one-dish tickets (the clock moves on a little for each).
function history(n) {
  for (let i = 0; i < n; i++) {
    clock += 600e3;
    S.dispatch('createTicket', { customer: 'g' + i, channel: 'dine_in', items: [{ menuId: 'dish_' + (i % 60), qty: 1 }] });
    S.tick();
    const tk = S.getState().tickets[S.getState().tickets.length - 1];
    S.dispatch('completeItem', { ticketId: tk.id, itemId: tk.items[0].id });
    S.dispatch('bumpTicket', { ticketId: tk.id });
    const o = S.getState().orders[S.getState().orders.length - 1];
    if (o && o.status === 'open') S.dispatch('payOrder', { orderId: o.id, method: 'cash', tip: 0, discount: 0 });
  }
}
const dish = (n) => S.dispatch('addMenuItem', { name: n, zone: 'cold', cat: 'cold', price: 4, prepSec: 30, track: 'one' });

test('a slow save makes the next one wait longer, between 400 ms and 5 seconds', () => {
  clock = T;
  start(capStorage(1e9));
  dish('Pie'); S.flush();
  assert.equal(S.status().saveDelayMs <= 400 || S.status().saveCostMs < 50, true);
  S.destroy();
  const slow = capStorage(1e9, 150);
  start(slow);
  dish('Pie'); S.flush();
  const st = S.status();
  assert.ok(st.saveCostMs >= 100, 'cost ' + st.saveCostMs);
  dish('Cake');                                         // schedules the next save with the longer wait
  assert.ok(S.status().saveDelayMs >= 800 && S.status().saveDelayMs <= 5000, 'delay ' + S.status().saveDelayMs);
  S.destroy();
});

test('the last-good copy is taken on the first save, again after close day, and every 6 hours, never in the demo', () => {
  clock = T;
  const b = capStorage(1e9);
  start(b);
  dish('Pie'); S.dispatch('updateSettings', { patch: { office: { pinHash: PIN } } }); S.flush();
  const first = b.get('smokebox.v1.lastgood', null);
  assert.ok(first && first.reason === 'interval'); assert.equal(first.takenAt, T);
  assert.equal(first.state.settings.office.pinHash, PIN); assert.equal(first.state.menu.length, 1);
  dish('Cake'); S.flush();
  assert.equal(b.get('smokebox.v1.lastgood', null).takenAt, T, 'not refreshed within 6 hours');
  clock = T + 1000;
  assert.equal(S.dispatch('closeDay', { leftovers: 'keep' }), 'ok'); S.flush();
  const second = b.get('smokebox.v1.lastgood', null);
  assert.equal(second.reason, 'closeDay'); assert.equal(second.takenAt, T + 1000); assert.equal(second.state.menu.length, 2);
  clock = T + 7 * H; dish('Tart'); S.flush();
  assert.equal(b.get('smokebox.v1.lastgood', null).takenAt, T + 7 * H);
  S.destroy();
  const d = capStorage(1e9);
  start(d, 'demo'); dish('Pie'); S.flush(); S.destroy();
  assert.deepEqual(d.keys('smokebox.').sort(), ['smokebox.demo.sid', 'smokebox.demo.state']);
  // a build that was not told its mode (the plain tests) keeps no copy
  const p = capStorage(1e9);
  S.init({ storage: p, noTimers: true, noSync: true, now: () => clock }); dish('Pie'); S.flush(); S.destroy();
  assert.equal(p.m.has('smokebox.v1.lastgood'), false);
});

test('a damaged live save is replaced by the last-good copy, and the damaged one is set aside', () => {
  clock = T;
  const b = capStorage(1e9);
  start(b);
  dish('Pie'); dish('Cake'); S.dispatch('updateSettings', { patch: { office: { pinHash: PIN } } }); S.flush();
  S.destroy();
  b.m.set('smokebox.v1.state', '{"v":1,"state":{broken');
  clock = T + 3 * H;
  const st = start(b);
  try {
    assert.ok(st.corrupt); assert.equal(st.restoredFromCopy, T);
    assert.deepEqual(S.getState().menu.map((m) => m.name), ['Pie', 'Cake']);
    assert.equal(S.getState().settings.office.pinHash, PIN); assert.equal(S.isOwn(), true);
    assert.deepEqual(E.checkInvariants(S.getState(), S.now()), []);
    assert.equal(b.get('smokebox.v1.corrupt', null), '{"v":1,"state":{broken');       // kept
    assert.equal(b.get('smokebox.v1.corruptat', null), T + 3 * H);
    S.flush();                                                                      // the live save is whole again
    assert.equal(E.validateBackup(S.decodeSaved(b.get('smokebox.v1.state'))).ok, true);
  } finally { S.destroy(); }
  // damaged live save and a damaged copy: a blank kitchen, with both set aside / untouched, no crash
  b.m.set('smokebox.v1.state', 'nope'); b.m.set('smokebox.v1.lastgood', '{"x"');
  const st2 = start(b);
  try { assert.equal(st2.restoredFromCopy, undefined); assert.equal(S.isBlank(), true); } finally { S.destroy(); }
  // a payload that parses but fails the check also falls back to the copy
  b.m.set('smokebox.v1.state', JSON.stringify({ v: 2 }));
  const good = capStorage(1e9); start(good); dish('Solo'); S.flush(); S.destroy();
  b.m.set('smokebox.v1.lastgood', good.m.get('smokebox.v1.lastgood'));
  const st3 = start(b);
  try { assert.ok(st3.restoredFromCopy); assert.equal(S.getState().menu[0].name, 'Solo'); } finally { S.destroy(); }
  // the demo never restores from a copy
  const dm = capStorage(1e9); dm.m.set('smokebox.demo.state', 'broken'); dm.m.set('smokebox.demo.lastgood', good.m.get('smokebox.v1.lastgood'));
  const st4 = start(dm, 'demo');
  try { assert.equal(st4.restoredFromCopy, undefined); } finally { S.destroy(); }
});

test('under quota pressure the copy goes first, history is trimmed only after, and the copy is small', () => {
  clock = T;
  // 1. size: with a lot of history the copy is a sliver of the live save
  const big = capStorage(1e9);
  start(big);
  for (let i = 0; i < 60; i++) dish('Dish ' + i);
  history(1500);
  S.flush();
  const liveLen = big.m.get('smokebox.v1.state').length, decodedLen = JSON.stringify(S.decodeSaved(big.get('smokebox.v1.state'))).length, snapLen = big.m.get('smokebox.v1.lastgood').length;
  assert.ok(snapLen < decodedLen * 0.5, 'copy ' + snapLen + ' live ' + decodedLen);
  S.destroy();
  // 2. room for the live save only: the copy does not fit, is not kept, and the live save is whole (not trimmed)
  const tight = capStorage(Math.ceil(liveLen * 1.03));
  start(tight);
  for (let i = 0; i < 60; i++) dish('Dish ' + i);
  history(1500);
  S.flush();
  assert.equal(S.status().lastSaveOk, true); assert.equal(S.status().trimmed, false);
  const stateLen = tight.m.get('smokebox.v1.state').length;
  S.destroy();
  // 3. room for the live save plus the copy; then the live save grows past it: the copy is dropped, history is not trimmed
  const cap = stateLen + snapLen + 2000;
  const roomy = capStorage(cap);
  start(roomy);
  for (let i = 0; i < 60; i++) dish('Dish ' + i);
  history(1500);
  S.flush();
  assert.equal(roomy.m.has('smokebox.v1.lastgood'), true, 'the copy fits at first');
  let guard = 0;
  while (roomy.m.has('smokebox.v1.lastgood') && guard++ < 60) { for (let i = 0; i < 20; i++) dish('More ' + guard + '_' + i); S.flush(); }
  assert.ok(guard < 60, 'the copy was never dropped');
  assert.equal(S.status().lastSaveOk, true); assert.equal(S.status().trimmed, false, 'history must not be trimmed while the copy can be dropped');
  assert.equal(E.validateBackup(S.decodeSaved(roomy.get('smokebox.v1.state'))).ok, true);
  S.destroy();
});

test('a set-aside damaged copy is cleared after 30 days, not before, and never while the save itself is damaged', () => {
  clock = T;
  const b = capStorage(1e9);
  start(b); dish('Pie'); S.flush(); S.destroy();
  b.m.set('smokebox.v1.corrupt', '"old damaged text"'); b.m.set('smokebox.v1.corruptat', String(T - 29 * DAY));
  clock = T + 1; start(b);
  assert.equal(b.m.has('smokebox.v1.corrupt'), true); assert.equal(S.status().corruptCleared, undefined); S.destroy();
  b.m.set('smokebox.v1.corruptat', String(T - 31 * DAY));
  start(b);
  assert.equal(b.m.has('smokebox.v1.corrupt'), false); assert.equal(b.m.has('smokebox.v1.corruptat'), false); assert.equal(S.status().corruptCleared, true);
  assert.equal(S.getState().menu.length, 1);
  S.destroy();
  // the live save is damaged right now: the older set-aside copy is replaced by this newest one, never cleared
  b.m.set('smokebox.v1.corrupt', '"older"'); b.m.set('smokebox.v1.corruptat', String(T - 40 * DAY));
  b.m.set('smokebox.v1.state', '{bad');
  const st = start(b);
  try { assert.ok(st.corrupt); assert.equal(b.get('smokebox.v1.corrupt', null), '{bad'); assert.equal(b.get('smokebox.v1.corruptat', null), clock); } finally { S.destroy(); }
  // an old copy with no time on record is left alone
  const c = capStorage(1e9); start(c); dish('Pie'); S.flush(); S.destroy();
  c.m.set('smokebox.v1.corrupt', '"x"');
  start(c); assert.equal(c.m.has('smokebox.v1.corrupt'), true); S.destroy();
});

test('the new keys are classified as kitchen data (separate in the demo)', () => {
  assert.ok(SB.util.dataKeys.includes('smokebox.v1.lastgood') && SB.util.dataKeys.includes('smokebox.v1.corruptat'));
  assert.equal(SB.util.storageKey('smokebox.v1.lastgood', 'demo'), 'smokebox.demo.lastgood');
});
