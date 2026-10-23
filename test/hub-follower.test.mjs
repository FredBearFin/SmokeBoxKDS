// SPIKE (test only, not wired into the app): a read-only follower that mirrors the hub through server-sent events, with no engine
// writes of its own. It proves two things the hub-authoritative design relies on: a follower that keeps the hub's pushed state is
// always equal to the hub, and a follower that was away can catch up by replaying the hub's ordered action log through the same
// pure engine and ends in exactly the hub's state. Notes for the design are in docs/audit/connected-mode-design.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHub } from '../server/server.mjs';
import { loadSB } from './_load.mjs';

const SB = await loadSB(['00-util', '10-config', '20-engine']);
const E = SB.engine;
const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what) { for (let i = 0; i < 150; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }

// A follower: opens the event stream (optionally from a known change number), keeps a copy of the kitchen and counts what it received.
// It never posts anything. mode 'state' keeps the pushed state; messages of type catchup are replayed through the engine.
function follower(port, { since } = {}) {
  const f = { state: null, seq: null, got: { snapshot: 0, state: 0, catchup: 0, hb: 0 }, bytes: 0, req: null, replayed: 0 };
  f.req = http.get({ host: '127.0.0.1', port, path: '/events' + (since == null ? '' : '?since=' + since) }, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
        if (!ev || !da) continue;
        const data = JSON.parse(da[1]);
        f.got[ev[1]] = (f.got[ev[1]] || 0) + 1; f.bytes += da[1].length;
        if (ev[1] === 'snapshot' || ev[1] === 'state') { f.state = data.state; f.seq = data.seq; }
        else if (ev[1] === 'catchup') {
          for (const op of data.ops) { f.state = E.apply(f.state, op.actionType, op.payload, op.now).state; f.replayed++; }
          f.seq = data.seq;
        }
      }
    });
  });
  f.req.on('error', () => {});
  f.stop = () => f.req.destroy();
  return f;
}
const post = (port, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
    let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(JSON.parse(s)));
  });
  r.on('error', reject); r.end(JSON.stringify(body));
});
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('spike: a read-only follower keeps the hub\'s pushed state and never writes', async () => {
  const clock = { t: T0 };
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => clock.t });
  const port = await hub.listen(0);
  const f = follower(port);
  try {
    await until(() => f.state, 'the first snapshot');
    for (let i = 0; i < 5; i++) {
      clock.t += 1000;
      const r = await post(port, { type: 'createTicket', payload: { customer: 'Table ' + i, items: [{ menuId: 'tea' }] }, opId: 'x:' + i, clientId: 'writer' });
      assert.equal(r.report, 'ok');
    }
    await until(() => f.seq === hub.snapshot().seq, 'the follower to reach the hub\'s change number');
    same(f.state, hub.snapshot().state);
    assert.equal(f.got.snapshot, 1); assert.ok(f.got.state >= 5, 'the hub pushes the whole state on every change');
    // a refused action changes nothing and is not pushed
    const before = f.got.state;
    const bad = await post(port, { type: 'bumpTicket', payload: { ticketId: 'nope' }, opId: 'x:bad' });
    assert.notEqual(bad.report, 'ok');
    await sleep(80);
    assert.equal(f.got.state, before);
  } finally { f.stop(); await hub.close(); }
});

test('spike: a follower that was away catches up by replaying the hub\'s ordered action log and ends in the hub\'s exact state', async () => {
  const clock = { t: T0 };
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => clock.t });
  const port = await hub.listen(0);
  let f = follower(port);
  try {
    await until(() => f.state, 'the first snapshot');
    const seen = f.seq, base = f.state;
    f.stop();                                                                  // the follower leaves (a TV loses its Wi-Fi)
    const acts = [
      ['createTicket', { customer: 'A', items: [{ menuId: 'tea' }, { menuId: 'pork_qtr' }] }],
      ['createTicket', { customer: 'B', items: [{ menuId: 'tea' }] }],
      ['pullBatch', { ing: 'pork', g: 400 }],
      ['toggle86', { menuId: 'tea', on: true }],
      ['createTicket', { customer: 'C', items: [{ menuId: 'tea' }] }],
    ];
    let n = 0;
    for (const [type, payload] of acts) { clock.t += 1500; const r = await post(port, { type, payload, opId: 'w:' + ++n, clientId: 'writer' }); assert.ok(r.report === 'ok' || type === 'createTicket', type + ' ' + r.report); }
    const hubSnap = hub.snapshot();
    // back again, asking only for what it missed
    f = follower(port, { since: seen });
    f.state = base; f.seq = seen;
    await until(() => f.got.catchup >= 1, 'the catch-up message');
    assert.equal(f.got.snapshot, 0, 'the log still reached back, so no full snapshot was needed');
    assert.ok(f.replayed >= 1);
    assert.equal(f.seq, hubSnap.seq);
    same(f.state, hubSnap.state);                                              // replaying the same actions through the pure engine gives the same state
    // a follower that asks from a change number the log cannot cover gets a full snapshot instead
    const far = follower(port, { since: 99999 });
    await until(() => far.got.snapshot === 1, 'a snapshot for an unknown change number');
    same(far.state, hubSnap.state);
    far.stop();
  } finally { f.stop(); await hub.close(); }
});

test('spike: how big one pushed message is for a day of orders (the whole state is sent on every change)', async () => {
  const clock = { t: T0 };
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => clock.t });
  const port = await hub.listen(0);
  const f = follower(port);
  try {
    await until(() => f.state, 'the first snapshot');
    for (let i = 0; i < 120; i++) { clock.t += 30000; await post(port, { type: 'createTicket', payload: { customer: 'Guest ' + i, items: [{ menuId: 'tea' }, { menuId: 'pork_qtr' }] }, opId: 'b:' + i }); }
    await until(() => f.seq === hub.snapshot().seq, 'the follower to catch up');
    const size = JSON.stringify(hub.snapshot().state).length;
    console.log('hub state after 120 tickets: ' + size + ' characters; the follower received ' + f.bytes + ' characters in ' + (f.got.snapshot + f.got.state) + ' messages');
    same(f.state, hub.snapshot().state);
    assert.ok(size > 0);
  } finally { f.stop(); await hub.close(); }
});
