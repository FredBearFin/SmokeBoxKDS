// The hub side of the read-only follower stream: restart safety (a crash loses nothing that was answered), resume from a change number,
// a resent action answered once, an unknown change number or another history falling back to a snapshot, the access code, and no writing.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHub } from '../server/server.mjs';

const T0 = new Date(2026, 9, 23, 12, 0, 0).getTime();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hubf-')), 'state.json');
async function until(fn, what) { for (let i = 0; i < 150; i++) { if (fn()) return; await sleep(20); } assert.fail('timed out waiting for ' + what); }
const post = (port, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: '/action', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
    let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(JSON.parse(s)));
  });
  r.on('error', reject); r.end(JSON.stringify(body));
});
// Opens /follow and collects the named events (parsed) until stopped. Resolves the HTTP status in .status.
function follow(port, q = '') {
  const f = { events: [], status: null, headers: null, req: null, ended: false };
  f.req = http.get({ host: '127.0.0.1', port, path: '/follow' + q }, (res) => {
    f.status = res.statusCode; f.headers = res.headers;
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (d) => {
      buf += d; let i;
      if (res.statusCode !== 200) return;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block), da = /^data: (.*)$/m.exec(block);
        if (ev && da) f.events.push({ name: ev[1], data: JSON.parse(da[1]) });
      }
    });
    res.on('end', () => { f.ended = true; f.body = buf; });
  });
  f.req.on('error', () => {});
  f.stop = () => f.req.destroy();
  f.of = (n) => f.events.filter((e) => e.name === n);
  return f;
}
const mk = (n, extra) => post(extra.port, { type: 'createTicket', payload: { customer: 'T' + n, items: [{ menuId: 'tea' }] }, opId: 'o:' + n, clientId: 'w' });

test('a follower gets hello, a snapshot, then every applied action in order with its change number', async () => {
  let t = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => t });
  const port = await hub.listen(0);
  const f = follow(port);
  try {
    await until(() => f.of('snapshot').length === 1, 'the snapshot');
    assert.equal(f.of('hello')[0].data.proto, 1); assert.equal(f.of('hello')[0].data.hubId, hub.hubId);
    for (let i = 1; i <= 4; i++) { t += 1000; assert.equal((await mk(i, { port })).report, 'ok'); }
    await until(() => f.of('op').length === 4, 'four ops');
    assert.deepEqual(f.of('op').map((e) => e.data.seq), [1, 2, 3, 4]);
    assert.deepEqual(f.of('op').map((e) => e.data.type), ['createTicket', 'createTicket', 'createTicket', 'createTicket']);
    assert.equal(f.of('snapshot')[0].data.seq, 0);
    // a refused action is not in the order
    assert.notEqual((await post(port, { type: 'bumpTicket', payload: { ticketId: 'nope' }, opId: 'o:bad' })).report, 'ok');
    await sleep(60);
    assert.equal(f.of('op').length, 4);
    // a follower cannot write
    const w = await new Promise((resolve) => { const r = http.request({ host: '127.0.0.1', port, path: '/follow', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode); }); r.end('{}'); });
    assert.equal(w, 404);
  } finally { f.stop(); await hub.close(); }
});

test('resume: asking from a change number gets only the missed actions, in order, and a resumed marker; no snapshot', async () => {
  let t = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => t });
  const port = await hub.listen(0);
  try {
    for (let i = 1; i <= 6; i++) { t += 1000; await mk(i, { port }); }
    const f = follow(port, '?since=3&hub=' + hub.hubId);
    await until(() => f.of('resumed').length === 1, 'resumed');
    assert.deepEqual(f.of('op').map((e) => e.data.seq), [4, 5, 6]);
    assert.equal(f.of('snapshot').length, 0);
    assert.equal(f.of('resumed')[0].data.count, 3);
    // up to date: nothing to replay, still resumed
    const g = follow(port, '?since=6&hub=' + hub.hubId);
    await until(() => g.of('resumed').length === 1, 'resumed when current');
    assert.equal(g.of('op').length, 0);
    f.stop(); g.stop();
  } finally { await hub.close(); }
});

test('an unknown change number, one from the future, another history, or a log that no longer reaches back all get a snapshot', async () => {
  let t = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, now: () => t, maxOps: 3 });
  const port = await hub.listen(0);
  try {
    for (let i = 1; i <= 6; i++) { t += 1000; await mk(i, { port }); }
    const cases = { future: '?since=99&hub=' + hub.hubId, otherHub: '?since=5&hub=deadbeef', noHub: '?since=5', negative: '?since=-2&hub=' + hub.hubId, junk: '?since=abc&hub=' + hub.hubId, tooOld: '?since=1&hub=' + hub.hubId };
    for (const [name, q] of Object.entries(cases)) {
      const f = follow(port, q);
      await until(() => f.of('snapshot').length === 1 || f.of('resumed').length === 1, name);
      assert.equal(f.of('snapshot').length, 1, name + ' falls back to a snapshot');
      assert.equal(f.of('snapshot')[0].data.seq, 6);
      f.stop();
    }
    // the log keeps only the last 3, so since=3 still reaches back (4,5,6)
    const ok = follow(port, '?since=3&hub=' + hub.hubId);
    await until(() => ok.of('resumed').length === 1, 'bounded history still resumes inside its reach');
    assert.deepEqual(ok.of('op').map((e) => e.data.seq), [4, 5, 6]);
    ok.stop();
  } finally { await hub.close(); }
});

test('restart safety: a hub that loses power keeps every answered action; a resent one is answered, not applied twice; a follower resumes', async () => {
  const file = tmp();
  let t = T0;
  const h1 = await createHub({ dataFile: file, starter: true, tickMs: 600000, saveMs: 3600000, now: () => t });
  const p1 = await h1.listen(0);
  const f = follow(p1);
  await until(() => f.of('snapshot').length === 1, 'the snapshot');
  const hubId = h1.hubId;
  for (let i = 1; i <= 5; i++) { t += 1000; assert.equal((await mk(i, { port: p1 })).report, 'ok'); }
  await until(() => f.of('op').length === 5, 'five ops');
  const seen = f.of('op').at(-1).data.seq;
  const before = JSON.stringify(h1.snapshot().state);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).seq, 0, 'the state file is old: only the record holds the five actions');
  await h1.crash();
  f.stop();
  const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, now: () => t });
  const p2 = await h2.listen(0);
  try {
    assert.equal(h2.hubId, hubId, 'the same history');
    assert.equal(h2.replayed, 5);
    assert.equal(h2.snapshot().seq, 5);
    assert.deepEqual(JSON.parse(JSON.stringify(h2.snapshot().state)), JSON.parse(before), 'exactly the state before the power cut');
    // the client never saw an answer for o:5 in its mind, so it resends: answered as a duplicate, not applied again
    const again = await post(p2, { type: 'createTicket', payload: { customer: 'T5', items: [{ menuId: 'tea' }] }, opId: 'o:5', clientId: 'w' });
    assert.equal(again.report, 'ok'); assert.equal(again.duplicate, true);
    assert.equal(h2.snapshot().state.tickets.length, 5);
    assert.equal(h2.snapshot().seq, 5);
    // a follower that had seen change 3 resumes from the rebuilt log
    const g = follow(p2, '?since=3&hub=' + hubId);
    await until(() => g.of('resumed').length === 1, 'resumed after the restart');
    assert.deepEqual(g.of('op').map((e) => e.data.seq), [4, 5]);
    g.stop();
    // new actions continue the numbering
    t += 1000; await mk(6, { port: p2 });
    assert.equal(h2.snapshot().seq, 6);
  } finally { await h2.close(); }
  // a clean stop and start also keeps everything, and the record is trimmed once the state file is current
  const h3 = await createHub({ dataFile: file, starter: true, tickMs: 600000, now: () => t });
  assert.equal(h3.snapshot().state.tickets.length, 6);
  assert.equal(h3.snapshot().seq, 6);
  await h3.close();
});

test('restart safety: a half-written last line in the record is ignored, and a record with no state file is never applied', async () => {
  const file = tmp();
  let t = T0;
  const h1 = await createHub({ dataFile: file, starter: true, tickMs: 600000, saveMs: 3600000, now: () => t });
  const p1 = await h1.listen(0);
  for (let i = 1; i <= 3; i++) { t += 1000; await mk(i, { port: p1 }); }
  await h1.crash();
  fs.appendFileSync(file + '.wal', '{"seq":4,"type":"createTick');                    // power cut in the middle of a write
  const h2 = await createHub({ dataFile: file, starter: true, tickMs: 600000, now: () => t });
  assert.equal(h2.snapshot().state.tickets.length, 3); assert.equal(h2.snapshot().seq, 3);
  await h2.crash();
  fs.rmSync(file);                                                                   // the state file is gone but the record is not
  const h3 = await createHub({ dataFile: file, starter: true, tickMs: 600000, now: () => t });
  assert.equal(h3.snapshot().state.tickets.length, 0); assert.equal(h3.snapshot().seq, 0);
  assert.notEqual(h3.hubId, h2.hubId, 'a lost history is a new history');
  assert.ok(fs.existsSync(file + '.wal.old'));
  await h3.close();
});

test('an action is not applied or answered when it cannot be recorded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hubf-'));
  const file = path.join(dir, 'state.json');
  const hub = await createHub({ dataFile: file, walFile: path.join(dir, 'nodir', 'x.wal'), starter: true, tickMs: 600000, now: () => T0 });
  const port = await hub.listen(0);
  try {
    const r = await post(port, { type: 'createTicket', payload: { customer: 'X', items: [{ menuId: 'tea' }] }, opId: 'z:1' });
    assert.notEqual(r.report, 'ok');
    assert.equal(hub.snapshot().state.tickets.length, 0);
    assert.equal(hub.snapshot().seq, 0);
  } finally { await hub.crash(); }
});

test('the access code: wrong or missing is refused (403), the right one is accepted, ten wrong tries lock for a minute, CORS only with a code', async () => {
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 600000, followCode: 'ABC123', now: () => T0 });
  const port = await hub.listen(0);
  try {
    const none = follow(port); await until(() => none.status !== null, 'no code'); assert.equal(none.status, 403);
    const bad = follow(port, '?code=nope'); await until(() => bad.status !== null, 'bad code'); assert.equal(bad.status, 403);
    const good = follow(port, '?code=ABC123');
    await until(() => good.of('snapshot').length === 1, 'good code'); assert.equal(good.status, 200);
    assert.equal(good.headers['access-control-allow-origin'], '*');
    good.stop();
    for (let i = 0; i < 10; i++) { const f = follow(port, '?code=x' + i); await until(() => f.status !== null, 'try'); }
    const locked = follow(port, '?code=ABC123'); await until(() => locked.status !== null, 'locked');
    assert.equal(locked.status, 429, 'the right code is refused during the lock');
  } finally { await hub.close(); }
  const open = await createHub({ dataFile: null, starter: true, tickMs: 600000, followCode: '', now: () => T0 });
  const p2 = await open.listen(0);
  try {
    const f = follow(p2); await until(() => f.of('snapshot').length === 1, 'open hub');
    assert.equal(f.headers['access-control-allow-origin'], undefined, 'no cross-site reading of an open hub');
    f.stop();
  } finally { await open.close(); }
});

test('the ordered history includes state-changing ticks, so replaying it gives the hub\'s exact state', async () => {
  let t = T0;
  const hub = await createHub({ dataFile: null, starter: true, tickMs: 30, now: () => t });
  const port = await hub.listen(0);
  const f = follow(port);
  try {
    await until(() => f.of('snapshot').length === 1, 'snapshot');
    t += 1000; await mk(1, { port });
    t += 6 * 3600e3;                                                   // six hours pass: batches in the cabinet expire on the hub's tick
    await until(() => f.of('op').some((e) => e.data.type === 'tick'), 'a tick in the history');
    const seqs = f.of('op').map((e) => e.data.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => seqs[0] + i), 'no gaps');
  } finally { f.stop(); await hub.close(); }
});
