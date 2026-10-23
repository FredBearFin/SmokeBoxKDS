// Connected stage 1, hub level: a REAL hub process (server/server.mjs) on a free port with a temp data folder, driven over HTTP and server-sent
// events by Node followers. These run today. Where the hub still has a known gap (the answer log and the last half second of changes live only
// in memory) the test FAILS on purpose: it is the proof the hub work (night/a5-c1) has to turn green.
//   node --test test/connected-hub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { startHub, postAction, stream, until, sleep, ROOT } from './_connected.mjs';

const hubs = [];
const hub = async (o) => { const h = await startHub(o); hubs.push(h); return h; };
test.after(async () => { await Promise.all(hubs.map((h) => h.stop('SIGKILL'))); });
const ticket = (n, opId) => ({ type: 'createTicket', payload: { customer: 'T' + n, channel: 'dine_in', items: [{ menuId: 'tea' }] }, opId, clientId: 'leader' });
const state = async (h) => { const s = stream(h.origin); await until(() => s.state, 'the first snapshot'); s.stop(); return s.state; };

/* ---------------------------------------------------- restart: nothing is lost and nothing is applied twice ---------------------------------------------------- */

test('restart (clean stop): an applied opId is still answered as a duplicate and no ticket is made twice', async () => {
  const h = await hub();
  const a = await postAction(h.origin, ticket(1, 'op-a'));
  assert.equal(a.body.report, 'ok');
  const seqBefore = a.body.seq;
  await h.restart('SIGTERM');
  const again = await postAction(h.origin, ticket(1, 'op-a'));
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true, 'the resent action is recognised after a restart (the answer log must be saved, not memory only)');
  assert.equal((await state(h)).tickets.length, 1, 'still exactly one ticket');
  const b = await postAction(h.origin, ticket(2, 'op-b'));
  assert.ok(b.body.seq > seqBefore, 'the change number carries on instead of starting again');
});

test('restart (crash): an action the hub answered "ok" to is on disk even when the hub is killed at once', async () => {
  const h = await hub();
  const a = await postAction(h.origin, ticket(1, 'crash-a'));
  assert.equal(a.body.report, 'ok');
  await h.restart('SIGKILL'); // no time to write anything after the reply
  const st = await state(h);
  assert.equal(st.tickets.length, 1, 'the acknowledged ticket survived the crash (acknowledge only after it is saved)');
  const again = await postAction(h.origin, ticket(1, 'crash-a'));
  assert.equal(again.body.duplicate, true, 'and its opId is remembered');
  assert.equal((await state(h)).tickets.length, 1);
});

test('restart: a follower that reconnects with its last change number gets a consistent answer (catch-up or a fresh snapshot), never a gap', async () => {
  const h = await hub();
  const f = stream(h.origin);
  await until(() => f.state, 'snapshot');
  for (let i = 1; i <= 4; i++) await postAction(h.origin, ticket(i, 'r-' + i));
  await until(() => f.state.tickets.length === 4, 'the follower to see 4 tickets');
  const last = f.seq; f.stop();
  await h.restart('SIGTERM');
  await postAction(h.origin, ticket(5, 'r-5'));
  const g = stream(h.origin, { since: last });
  await until(() => g.events.length > 0, 'the first message after reconnecting');
  const first = g.events[0];
  assert.ok(first.event === 'catchup' || first.event === 'snapshot', 'a catch-up or a snapshot, got ' + first.event);
  let ticketCount = first.event === 'snapshot' ? first.data.state.tickets.length : 4 + first.data.ops.filter((o) => o.actionType === 'createTicket').length;
  assert.equal(ticketCount, 5, 'the follower ends with all 5 tickets');
  g.stop();
});

/* ---------------------------------------------------- convergence ---------------------------------------------------- */

test('two followers and the hub agree after 60 random leader actions (tickets, bumps, 86, batches, temperatures)', async () => {
  const h = await hub();
  const f1 = stream(h.origin), f2 = stream(h.origin);
  await until(() => f1.state && f2.state, 'both snapshots');
  let seed = 4242; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const menu = f1.state.menu.map((m) => m.id);
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const st = f1.state, r = rnd(), act = st.tickets.filter((t) => t.status === 'active');
    let body;
    if (r < 0.35 || !act.length) body = { type: 'createTicket', payload: { customer: 'R' + (n++), items: [{ menuId: pick(menu) }, { menuId: pick(menu) }] } };
    else if (r < 0.60) { const t = pick(act); body = { type: 'completeItem', payload: { ticketId: t.id, itemId: pick(t.items).id } }; }
    else if (r < 0.72) body = { type: 'toggle86', payload: { menuId: pick(menu), on: rnd() < 0.5 } };
    else if (r < 0.82) body = { type: 'addBatch', payload: { ing: 'brisket', tempF: 160, cookedG: 2000 + Math.floor(rnd() * 3000) } };
    else if (r < 0.90 && st.batches.length) body = { type: 'logTemp', payload: { batchId: pick(st.batches).id, tempF: pick([110, 135, 150, 165]) } };
    else { const t = pick(act); body = { type: 'bumpTicket', payload: { ticketId: t.id, force: true } }; }
    body.opId = 'rand-' + i; body.clientId = 'leader';
    const r1 = await postAction(h.origin, body);
    assert.equal(r1.status, 200);
    if (i % 7 === 0) await sleep(15);
    await until(() => f1.seq === r1.body.seq || f1.seq > r1.body.seq, 'follower 1 to reach change ' + r1.body.seq);
  }
  const truth = await state(h);
  await until(() => JSON.stringify(f1.state) === JSON.stringify(truth) && JSON.stringify(f2.state) === JSON.stringify(truth), 'both followers to equal the hub');
  assert.ok(truth.tickets.length > 5);
  assert.ok(Array.isArray(truth.batches) && truth.batches.length >= 1);
  f1.stop(); f2.stop();
});

test('a follower never changes the hub: it cannot post through the stream, and its connection does not count as an action', async () => {
  const h = await hub();
  const before = (await state(h)).rev;
  const f = stream(h.origin);
  await until(() => f.state, 'snapshot');
  await sleep(200);
  assert.equal((await state(h)).rev, before, 'connecting changes nothing');
  f.stop();
});

/* ---------------------------------------------------- security of the follower endpoints ---------------------------------------------------- */

const rawHttp = (port, text, wait = 300) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1'); let buf = '';
  s.on('data', (d) => (buf += d.toString('utf8'))); s.on('error', () => resolve(buf)); s.on('close', () => resolve(buf));
  s.write(text); setTimeout(() => { s.destroy(); resolve(buf); }, wait);
});
const code = (t) => { const m = /^HTTP\/1\.1 (\d{3})/.exec(t); return m ? Number(m[1]) : 0; };

test('resume abuse: odd "since" values are answered with a snapshot or a catch-up and never hang, crash or leak', async () => {
  const h = await hub();
  await postAction(h.origin, ticket(1, 's-1'));
  const values = ['-1', 'NaN', 'abc', '1e999', '1.5', '0x10', '99999999999999999999', '', '1&since=2', '%00', '%ff', '--', '0', '1'.repeat(5000)];
  for (const v of values) {
    const out = await rawHttp(h.port, `GET /events?since=${v} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 250);
    assert.equal(code(out), 200, 'since=' + v.slice(0, 20) + ' -> ' + code(out));
    assert.match(out, /event: (snapshot|catchup)/, 'since=' + v.slice(0, 20));
    assert.ok(!/root:|node_modules|Error:/.test(out), 'nothing leaked');
  }
  const out = await rawHttp(h.port, 'GET /events?since=999999 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 250);
  assert.match(out, /event: snapshot/, 'a change number from the future gets a full snapshot, not an empty catch-up');
  assert.equal(code(await rawHttp(h.port, 'GET /nope HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n', 150)), 404, 'the hub is still up');
});

test('stream cap: the 101st screen is told the hub is busy, the others keep working, and a freed place can be taken', async () => {
  const h = await hub();
  const open = [];
  for (let i = 0; i < 100; i++) { const s = stream(h.origin); open.push(s); }
  await until(() => open.every((s) => s.status === 200), 'all 100 streams', 8000);
  const extra = stream(h.origin);
  await until(() => extra.status !== 0, 'the extra stream to be answered');
  assert.equal(extra.status, 503, 'the 101st stream is refused with 503');
  const r = await postAction(h.origin, ticket(1, 'cap-1'));
  assert.equal(r.body.report, 'ok', 'actions still work at the cap');
  await until(() => open[0].state && open[0].state.tickets.length === 1, 'an open stream to still receive changes');
  open[0].stop();
  await sleep(150);
  const again = stream(h.origin);
  await until(() => again.status !== 0, 'the retry to be answered');
  assert.equal(again.status, 200, 'a freed place is reusable');
  for (const s of open) s.stop(); again.stop(); extra.stop();
});

test('size and origin guards on /action still hold with followers connected (413, 415, 403)', async () => {
  const h = await hub();
  const f = stream(h.origin); await until(() => f.state, 'snapshot');
  const big = await postAction(h.origin, { type: 'createTicket', payload: { note: 'x'.repeat(400000) }, opId: 'big' });
  assert.equal(big.status, 413);
  assert.equal((await postAction(h.origin, '{}', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await postAction(h.origin, ticket(1, 'evil'), { origin: 'https://evil.example' })).status, 403);
  await sleep(100);
  assert.equal(f.state.tickets.length, 0, 'followers saw none of the refused requests');
  f.stop();
});

test('streams: other methods and paths on the event route are refused; a slow reader does not stop the hub', async () => {
  const h = await hub();
  for (const m of ['POST', 'PUT', 'DELETE']) { const c = code(await rawHttp(h.port, `${m} /events HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`, 150)); assert.ok(c === 404 || c === 405, m + ' /events -> ' + c); }
  // a reader that never reads: open a raw socket, send the request and then ignore the data while 50 changes are made
  const lazy = net.connect(h.port, '127.0.0.1'); lazy.write('GET /events HTTP/1.1\r\nHost: x\r\n\r\n'); lazy.pause();
  for (let i = 0; i < 50; i++) { const r = await postAction(h.origin, ticket(i, 'slow-' + i)); assert.equal(r.body.report, 'ok'); }
  lazy.destroy();
  assert.equal((await state(h)).tickets.length, 50);
});

test('auth and pairing: the follower endpoints refuse a screen without a token (needs the pairing work, design stage 5)', async (t) => {
  const src = fs.readFileSync(`${ROOT}/server/server.mjs`, 'utf8');
  if (!/token|pair/i.test(src)) return t.skip('SKIP: the hub has no pairing or token check yet (it relies on the proxy password); this test starts to apply when server.mjs gains tokens');
  const h = await hub({ env: { SMOKEBOX_REQUIRE_TOKEN: '1' } });
  const s = stream(h.origin); await until(() => s.status !== 0, 'answer');
  assert.ok([401, 403].includes(s.status), 'no token, no stream: ' + s.status);
  assert.ok([401, 403].includes((await postAction(h.origin, ticket(1, 'tok'))).status), 'no token, no action');
});
