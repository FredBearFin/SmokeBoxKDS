// Independent-review fixes in the store: a damaged save is never replaced unless a copy was kept (#1), records dropped at load are parked and
// named (#2), one forward clock blip does not move time (#5). Node only (fake clock, memory storage with a quota knob).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine', '30-store']);
const { store: S, engine: E } = SB;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();

// A memory storage like the app's, with a set of keys whose writes fail (the browser store being full).
function memStorage() {
  const m = new Map();
  const st = {
    persistent: true, m, failKeys: new Set(),
    get(k, fb) { const raw = m.get(k); if (raw == null) return fb; try { return JSON.parse(raw); } catch (e) { return fb; } },
    raw(k) { return m.has(k) ? m.get(k) : null; },
    set(k, v) { if (st.failKeys.has(k)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, JSON.stringify(v)); return true; },
    remove(k) { m.delete(k); },
    keys(prefix) { return [...m.keys()].filter((k) => !prefix || k.startsWith(prefix)); },
  };
  return st;
}
const boot = (storage, clock) => S.init({ now: () => clock.real, storage, noTimers: true, noSync: true, starter: true, mode: 'real' });
// The saved text with its state marked as a newer version, which the checker refuses.
function refused(text) { const e = JSON.parse(text); (e.state || e).v = 2; return JSON.stringify(e); }
// Starts a real kitchen, sells something, saves, and returns the storage and the saved text.
function savedKitchen() {
  const clock = { real: T0 }, storage = memStorage();
  boot(storage, clock);
  const menu = S.getState().menu[0].id;
  assert.equal(S.dispatch('createTicket', { customer: 'Keep me', items: [{ menuId: menu }] }), 'ok');
  S.flush();
  return { clock, storage, text: storage.m.get(S.KEY) };
}

test('#1: when the set-aside copy cannot be written, the damaged save is not replaced and the owner is told', () => {
  const { clock, storage, text } = savedKitchen();
  const damaged = refused(text);
  storage.m.set(S.KEY, damaged);
  storage.m.delete('smokebox.v1.lastgood');
  storage.failKeys.add('smokebox.v1.corrupt');
  const st = boot(storage, clock);
  assert.ok(st.corrupt, 'reported as damaged');
  assert.equal(st.heldInMemory, true, 'the status says the damaged data could not be kept safe');
  S.dispatch('toggle86', { menuId: S.getState().menu[0].id, on: true }); S.flush();
  assert.equal(storage.m.get(S.KEY), damaged, 'the damaged text is still the saved text: nothing replaced it');
  assert.equal(S.damagedText(), damaged, 'and the text can be handed to the owner to download');
  assert.equal(S.status().lastSaveOk === true, false, 'the screen is not told that saving worked');
});

test('#1: when the set-aside copy is written, the app starts as before (copy kept, fresh start)', () => {
  const { clock, storage, text } = savedKitchen();
  const damaged = refused(text);
  storage.m.set(S.KEY, damaged); storage.m.delete('smokebox.v1.lastgood');
  const st = boot(storage, clock);
  assert.ok(st.corrupt); assert.ok(!st.heldInMemory);
  assert.ok(storage.m.get('smokebox.v1.corrupt'), 'the damaged copy is kept');
  S.flush();
  assert.notEqual(storage.m.get(S.KEY), damaged, 'the live key is then replaced by the working state');
});

test('#1: unreadable text with a full store is held too', () => {
  const clock = { real: T0 }, storage = memStorage();
  storage.m.set(S.KEY, '{not json at all'); storage.failKeys.add('smokebox.v1.corrupt');
  const st = boot(storage, clock);
  assert.equal(st.heldInMemory, true); S.flush();
  assert.equal(storage.m.get(S.KEY), '{not json at all');
  assert.equal(S.damagedText(), '{not json at all');
});

// A saved kitchen with one paid order whose tip is text, so the checker drops it while repairing.
function savedWithBadOrder() {
  const { clock, storage, text } = savedKitchen();
  const env = JSON.parse(text), s = env.state || env;
  const o = s.orders[0]; o.status = 'paid'; o.paidAt = T0 + 1000; o.totals = { subtotal: 10, tax: 0.8, tip: '2.00', total: 12.8 };
  storage.m.set(S.KEY, JSON.stringify(env)); storage.m.delete('smokebox.v1.lastgood');
  return { clock, storage, before: JSON.stringify(env), count: s.orders.length };
}

test('#2: a record the checker drops at load is parked whole and the status says how many', () => {
  const { clock, storage, before } = savedWithBadOrder();
  const st = boot(storage, clock);
  assert.ok(st.repaired.some((r) => /dropped/.test(r)), 'something was dropped: ' + JSON.stringify(st.repaired));
  assert.ok(st.droppedCount && st.droppedCount.orders + st.droppedCount.tickets > 0, JSON.stringify(st.droppedCount));
  assert.equal(storage.m.get('smokebox.v1.dropped'), before, 'the text as it was before the repair is kept');
  S.flush();
  assert.equal(storage.m.get('smokebox.v1.dropped'), before, 'and a later save does not touch it');
});

test('#2: a repair that drops nothing does not park anything', () => {
  const { clock, storage } = savedKitchen();
  const st = boot(storage, clock);
  assert.equal(storage.m.get('smokebox.v1.dropped') == null, true);
  assert.ok(!st.droppedCount);
});

test('start over refuses until the screen says a backup file was saved, and changes nothing when it refuses', () => {
  const { clock, storage } = savedKitchen();
  boot(storage, clock);
  const before = JSON.stringify(S.getState());
  for (const bad of [undefined, null, {}, { filename: '', chars: 5 }, { filename: 'b.json', chars: 0 }, { filename: 'b.json', chars: NaN }, { filename: 7, chars: 5 }]) {
    const r = S.startOver({ confirm: 'ERASE', backupSaved: bad });
    assert.equal(r.ok, false); assert.equal(r.report, 'backupRequired');
  }
  assert.equal(JSON.stringify(S.getState()), before);
  assert.equal(S.startOver({ confirm: 'ERASE', backupSaved: { filename: 'b.json', chars: 100 } }).ok, true);
});

const HOUR = 3600e3, DAYMS = 24 * HOUR, TEN_YEARS = 3650 * DAYMS;
// A real kitchen with a clock the test can move, one batch cooking, ticking each time the clock moves.
function clocked() {
  const clock = { real: T0 }, storage = memStorage();
  boot(storage, clock);
  return { clock, storage, tick: () => { S.now(); S.tick(); } };
}

test('#5: one reading ten years ahead, then back to normal, moves nothing and discards nothing', () => {
  const { clock, storage, tick } = clocked();
  const batchesBefore = S.getState().batches.map((b) => b.status).join();
  clock.real = T0 + TEN_YEARS; tick();
  assert.ok(S.status().clockSuspect, 'the status says the clock jumped');
  assert.ok(S.now() - T0 < HOUR, 'the app clock stayed with the last trusted time');
  clock.real = T0 + 5000; tick();
  assert.equal(S.status().clockSuspect, null, 'and it clears when the clock is normal again');
  assert.ok(S.now() - T0 < HOUR);
  assert.equal(S.getState().batches.map((b) => b.status).join(), batchesBefore, 'no batch was thrown out');
  S.flush();
  const st = boot(storage, clock);
  assert.ok(S.now() - clock.real < 5 * 60e3, 'after a reload the app clock is still the device clock: ' + (S.now() - clock.real));
  assert.equal(st.clockSuspect == null, true);
});

test('#5: a jump that stays is held until the owner accepts it; time keeps running meanwhile', () => {
  const { clock, tick } = clocked();
  clock.real = T0 + TEN_YEARS; tick();
  clock.real += 60e3; tick();
  assert.ok(S.status().clockSuspect && S.status().clockSuspect.aheadMs > 3000 * DAYMS);
  assert.ok(S.now() >= T0 + 59e3 && S.now() < T0 + HOUR, 'a minute passed on the held clock');
  assert.equal(S.getState().batches.some((b) => b.status === 'discard'), false);
  assert.equal(S.acceptClockJump(), true);
  assert.ok(Math.abs(S.now() - clock.real) < 1000, 'after accepting, the clock follows the device');
  assert.equal(S.status().clockSuspect, null);
  assert.equal(S.acceptClockJump(), false, 'nothing to accept now');
});

test('#5: an ordinary wake-up gap (8 hours) is followed at once, as before', () => {
  const { clock, tick } = clocked();
  clock.real = T0 + 8 * HOUR; tick();
  assert.equal(S.status().clockSuspect == null, true);
  assert.ok(Math.abs(S.now() - clock.real) < 1000);
});

test('#5: a saved or restored kitchen stamped far in the future does not move the clock', () => {
  const { clock, storage, tick } = clocked();
  const menu = S.getState().menu[0].id;
  S.dispatch('createTicket', { customer: 'Future', items: [{ menuId: menu }] });
  const text = S.exportAll();
  const env = JSON.parse(text);
  const s = env.state || env;
  // Moves every time field of a record ten years on, so the record is still consistent with itself.
  const shift = (x) => { if (Array.isArray(x)) x.forEach(shift); else if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (typeof x[k] === 'number' && (/At$/.test(k) || k === 't')) x[k] += TEN_YEARS; else shift(x[k]); } };
  shift(s.tickets); shift(s.orders); shift(s.events);
  const r = S.importAll(JSON.stringify(env));
  assert.equal(r, 'ok', JSON.stringify(S.lastResult()));
  tick();
  assert.ok(S.now() - clock.real < HOUR, 'the clock is still the device clock after the restore: ' + (S.now() - clock.real) + ' ' + JSON.stringify(r).slice(0, 80));
  assert.ok(S.status().clockWrong, 'and the status says the stamps look wrong');
});
