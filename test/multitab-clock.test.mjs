// Three tabs of one browser create tickets at the same moment: none may be lost (single-device multi-tab sync, 30-store.js).
// Deterministic stand-ins, no browser: each tab is its own copy of the modules in a vm context, with its own VIEW of the shared storage
// (a write shows at once in the writing tab and reaches the other tabs only when the test says so, like a browser's per-process
// localStorage cache), and a message bus that the test delivers by hand. One tab's clock is 3 hours behind, as in board-round11,
// but the skew is NOT needed to lose a ticket: the same interleaving loses one with every clock on time.
// Found by A1: board-round11 "three tabs end with the same tickets and none lost" fails about 10% of runs on main and connected alike.
// The test is marked todo until the store is fixed: remove the todo option then.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './_load.mjs';

const T0 = new Date(2026, 9, 17, 12, 0, 0).getTime();
const SRC = ['00-util.js', '10-config.js', '20-engine.js', '30-store.js'].map((f) => [f, fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')]);

// A shared storage with one view per tab: coherent views see every write at once, stale views see another tab's write after sync().
function makeWorld({ coherent }) {
  const canon = new Map();
  const W = { tabs: {}, queue: [], real: T0, canon };
  W.addTab = (name, skew = 0) => {
    const ctx = { console, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {}, navigator: {} };
    ctx.globalThis = ctx; vm.createContext(ctx);
    for (const [f, src] of SRC) vm.runInContext(src, ctx, { filename: f });
    const tab = { name, S: ctx.SB.store, skew, inbox: [], pendingWrites: [] };
    const m = coherent ? canon : new Map(canon);
    tab.view = {
      persistent: true,
      get(k, fb) { const r = m.get(k); if (r == null) return fb; try { return JSON.parse(r); } catch (e) { return fb; } },
      set(k, v) { const raw = JSON.stringify(v); m.set(k, raw); canon.set(k, raw); if (!coherent) for (const o of Object.values(W.tabs)) if (o !== tab) o.pendingWrites.push([k, raw]); return true; },
      remove(k) { m.delete(k); canon.delete(k); },
      apply(k, raw) { m.set(k, raw); },
    };
    const transport = { name: 'manual', open(d) { tab.deliver = d; return true; }, post(msg) { for (const o of Object.values(W.tabs)) if (o !== tab) o.inbox.push(msg); return true; }, close() {} };
    tab.S.init({ now: () => W.real + tab.skew, storage: tab.view, noTimers: true, starter: true, transport });
    W.tabs[name] = tab;
    return tab;
  };
  // The writes other tabs made reach this tab's view.
  W.sync = (name) => { const t = W.tabs[name]; for (const [k, raw] of t.pendingWrites.splice(0)) t.view.apply(k, raw); };
  W.deliver = (name) => { const t = W.tabs[name]; for (const m of t.inbox.splice(0)) t.deliver(m); };
  W.create = (name, label) => { const t = W.tabs[name]; W.real += 10; assert.equal(t.S.dispatch('createTicket', { customer: label, items: [{ menuId: 'tea' }] }), 'ok'); };
  W.flush = (name) => { W.real += 10; W.tabs[name].S.flush(); };
  // Everything settles: every tab sees every write and message, saves what it holds, until nothing moves.
  W.settle = () => { for (let r = 0; r < 4; r++) for (const n of Object.keys(W.tabs)) { W.sync(n); W.deliver(n); W.flush(n); } for (const n of Object.keys(W.tabs)) { W.sync(n); W.deliver(n); } };
  W.labels = (name) => W.tabs[name].S.getState().tickets.map((t) => t.customer).filter((c) => /^T:/.test(c)).sort().join();
  W.saved = () => JSON.parse(canon.get(Object.values(W.tabs)[0].S.KEY)).state.tickets.map((t) => t.customer).filter((c) => /^T:/.test(c)).sort().join();
  W.destroy = () => Object.values(W.tabs).forEach((t) => t.S.destroy());
  return W;
}

// The interleaving: B saves; C and A (not yet shown B's save) each add a ticket and save on top of what they last saw.
function interleave(W) {
  W.addTab('A', W.skewA || 0); W.addTab('B'); W.addTab('C');
  W.create('B', 'T:B'); W.flush('B');   // B's save is in storage, but A's and C's views are not updated yet
  W.create('C', 'T:C'); W.flush('C');   // C builds on its old view: sid still looks unchanged, so it does not rebase onto B's save
  W.create('A', 'T:A'); W.flush('A');   // A the same
  W.settle();
}

test('control: with coherent storage the same interleaving keeps all three tickets', () => {
  const W = makeWorld({ coherent: true });
  interleave(W);
  assert.equal(W.labels('A'), 'T:A,T:B,T:C'); assert.equal(W.labels('B'), 'T:A,T:B,T:C'); assert.equal(W.labels('C'), 'T:A,T:B,T:C');
  assert.equal(W.saved(), 'T:A,T:B,T:C');
  W.destroy();
});

for (const [label, skewA] of [['all clocks on time', 0], ['tab A clock 3 hours behind', -3 * 3600e3]]) {
  test('three tabs create at once, ' + label + ': no ticket is lost when a tab reads storage a moment late', () => {
    const W = makeWorld({ coherent: false });
    W.skewA = skewA;
    interleave(W);
    const want = 'T:A,T:B,T:C';
    assert.deepEqual(['A', 'B', 'C'].map((n) => W.labels(n)), [want, want, want], 'every tab has all three');
    assert.equal(W.saved(), want, 'and so does the saved copy');
    W.destroy();
  });
}
